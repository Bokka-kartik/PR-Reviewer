import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import {
  STALE_RUNNING_MS,
  type ListQuery,
  type ReviewKey,
  type ReviewMeta,
  type ReviewPatch,
  type ReviewRecord,
  type ReviewStore,
} from './types.js'

const commentSchema = new Schema(
  {
    path: { type: String, required: true },
    line: { type: Number, required: true },
    severity: { type: String, enum: ['critical', 'warning', 'suggestion'], required: true },
    body: { type: String, required: true },
    fingerprint: { type: String, required: true },
  },
  { _id: false },
)

const reviewSchema = new Schema({
  owner: { type: String, required: true },
  repo: { type: String, required: true },
  prNumber: { type: Number, required: true },
  headSha: { type: String, required: true },
  prTitle: { type: String, default: '' },
  prUrl: { type: String, default: '' },
  author: { type: String, default: '' },
  status: { type: String, enum: ['running', 'completed', 'skipped', 'failed'], required: true },
  skipReason: String,
  error: String,
  filesReviewed: { type: Number, default: 0 },
  filesSkipped: { type: Number, default: 0 },
  chunks: { type: Number, default: 0 },
  droppedChunks: { type: Number, default: 0 },
  comments: { type: [commentSchema], default: [] },
  model: { type: String, default: '' },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  summary: String,
  startedAt: { type: Date, required: true },
  finishedAt: Date,
  durationMs: Number,
})

// One review per commit; this also makes "claim" race-safe across instances.
reviewSchema.index({ owner: 1, repo: 1, prNumber: 1, headSha: 1 }, { unique: true })
reviewSchema.index({ startedAt: -1 })

type ReviewDoc = InferSchemaType<typeof reviewSchema> & { _id: mongoose.Types.ObjectId }

const ReviewModel = mongoose.model('Review', reviewSchema)

function toRecord(doc: ReviewDoc): ReviewRecord {
  const { _id, ...rest } = doc as ReviewDoc & Record<string, unknown>
  return { id: String(_id), ...(rest as Omit<ReviewRecord, 'id'>) }
}

const FRESH_FIELDS = {
  skipReason: null,
  error: null,
  filesReviewed: 0,
  filesSkipped: 0,
  chunks: 0,
  droppedChunks: 0,
  comments: [],
  model: '',
  inputTokens: 0,
  outputTokens: 0,
  summary: null,
  finishedAt: null,
  durationMs: null,
}

export class MongoReviewStore implements ReviewStore {
  async claim(key: ReviewKey, meta: ReviewMeta): Promise<ReviewRecord | null> {
    const startedAt = new Date()

    // Take over a failed, skipped or stale run of the same commit.
    const restarted = await ReviewModel.findOneAndUpdate(
      {
        ...key,
        $or: [
          { status: { $in: ['failed', 'skipped'] } },
          { status: 'running', startedAt: { $lt: new Date(startedAt.getTime() - STALE_RUNNING_MS) } },
        ],
      },
      { $set: { ...FRESH_FIELDS, ...meta, status: 'running', startedAt } },
      { new: true },
    ).lean()
    if (restarted) return toRecord(restarted as unknown as ReviewDoc)

    try {
      const created = await ReviewModel.create({ ...key, ...meta, status: 'running', startedAt })
      return toRecord(created.toObject() as unknown as ReviewDoc)
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return null // already running or completed
      throw e
    }
  }

  async update(id: string, patch: ReviewPatch): Promise<void> {
    await ReviewModel.updateOne({ _id: id }, { $set: patch })
  }

  async postedFingerprints(owner: string, repo: string, prNumber: number): Promise<Set<string>> {
    const docs = await ReviewModel.find({ owner, repo, prNumber }, { 'comments.fingerprint': 1 }).lean()
    const set = new Set<string>()
    for (const doc of docs as unknown as { comments?: { fingerprint: string }[] }[]) {
      for (const c of doc.comments ?? []) set.add(c.fingerprint)
    }
    return set
  }

  async list(query: ListQuery): Promise<{ items: ReviewRecord[]; total: number }> {
    const filter: Record<string, unknown> = {}
    if (query.repo) {
      const [owner, repo] = query.repo.split('/')
      filter['owner'] = owner
      filter['repo'] = repo
    }
    if (query.status) filter['status'] = query.status
    const [docs, total] = await Promise.all([
      ReviewModel.find(filter).sort({ startedAt: -1 }).skip(query.skip).limit(query.limit).lean(),
      ReviewModel.countDocuments(filter),
    ])
    return { items: docs.map((d) => toRecord(d as unknown as ReviewDoc)), total }
  }

  async get(id: string): Promise<ReviewRecord | null> {
    if (!mongoose.isValidObjectId(id)) return null
    const doc = await ReviewModel.findById(id).lean()
    return doc ? toRecord(doc as unknown as ReviewDoc) : null
  }

  async recent(limit: number): Promise<ReviewRecord[]> {
    const docs = await ReviewModel.find().sort({ startedAt: -1 }).limit(limit).lean()
    return docs.map((d) => toRecord(d as unknown as ReviewDoc))
  }
}

export async function connectMongo(uri: string): Promise<void> {
  await mongoose.connect(uri)
  // Make sure the unique index exists before serving traffic.
  await ReviewModel.init()
}
