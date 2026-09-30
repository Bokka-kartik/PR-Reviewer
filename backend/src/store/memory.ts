import { randomUUID } from 'node:crypto'
import {
  STALE_RUNNING_MS,
  type ListQuery,
  type ReviewKey,
  type ReviewMeta,
  type ReviewPatch,
  type ReviewRecord,
  type ReviewStore,
} from './types.js'

/** In-memory store used by tests and for trying the app without MongoDB. */
export class MemoryReviewStore implements ReviewStore {
  private readonly records: ReviewRecord[] = []

  constructor(private readonly now: () => Date = () => new Date()) {}

  async claim(key: ReviewKey, meta: ReviewMeta): Promise<ReviewRecord | null> {
    const existing = this.records.find(
      (r) => r.owner === key.owner && r.repo === key.repo && r.prNumber === key.prNumber && r.headSha === key.headSha,
    )
    const fresh = {
      status: 'running' as const,
      skipReason: undefined,
      error: undefined,
      filesReviewed: 0,
      filesSkipped: 0,
      chunks: 0,
      droppedChunks: 0,
      comments: [],
      model: '',
      inputTokens: 0,
      outputTokens: 0,
      summary: undefined,
      startedAt: this.now(),
      finishedAt: undefined,
      durationMs: undefined,
      ...meta,
    }
    if (existing) {
      const stale =
        existing.status === 'running' && this.now().getTime() - existing.startedAt.getTime() > STALE_RUNNING_MS
      if (existing.status === 'completed' || (existing.status === 'running' && !stale)) return null
      Object.assign(existing, fresh)
      return { ...existing }
    }
    const record: ReviewRecord = { id: randomUUID(), ...key, ...fresh }
    this.records.push(record)
    return { ...record }
  }

  async update(id: string, patch: ReviewPatch): Promise<void> {
    const record = this.records.find((r) => r.id === id)
    if (record) Object.assign(record, patch)
  }

  async postedFingerprints(owner: string, repo: string, prNumber: number): Promise<Set<string>> {
    const set = new Set<string>()
    for (const r of this.records) {
      if (r.owner === owner && r.repo === repo && r.prNumber === prNumber) {
        for (const c of r.comments) set.add(c.fingerprint)
      }
    }
    return set
  }

  async list(query: ListQuery): Promise<{ items: ReviewRecord[]; total: number }> {
    const matching = this.sorted().filter(
      (r) => (!query.repo || `${r.owner}/${r.repo}` === query.repo) && (!query.status || r.status === query.status),
    )
    return {
      items: matching.slice(query.skip, query.skip + query.limit).map((r) => ({ ...r })),
      total: matching.length,
    }
  }

  async get(id: string): Promise<ReviewRecord | null> {
    const record = this.records.find((r) => r.id === id)
    return record ? { ...record } : null
  }

  async recent(limit: number): Promise<ReviewRecord[]> {
    return this.sorted()
      .slice(0, limit)
      .map((r) => ({ ...r }))
  }

  private sorted(): ReviewRecord[] {
    return [...this.records].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  }
}
