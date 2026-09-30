import type { ReviewComment } from '../review/types.js'

export type ReviewStatus = 'running' | 'completed' | 'skipped' | 'failed'

export interface ReviewKey {
  owner: string
  repo: string
  prNumber: number
  headSha: string
}

export interface ReviewMeta {
  prTitle: string
  prUrl: string
  author: string
}

export interface ReviewRecord extends ReviewKey, ReviewMeta {
  id: string
  status: ReviewStatus
  skipReason?: string
  error?: string
  filesReviewed: number
  filesSkipped: number
  chunks: number
  droppedChunks: number
  /** Comments that were posted to the pull request. */
  comments: ReviewComment[]
  model: string
  inputTokens: number
  outputTokens: number
  summary?: string
  startedAt: Date
  finishedAt?: Date
  durationMs?: number
}

export type ReviewPatch = Partial<Omit<ReviewRecord, 'id' | keyof ReviewKey>>

export interface ListQuery {
  repo?: string // "owner/name"
  status?: ReviewStatus
  limit: number
  skip: number
}

export interface ReviewStore {
  /**
   * Starts a review for this exact commit. Returns null if one is already running,
   * or already completed. Failed, skipped and stale (crashed) runs can be started again.
   */
  claim(key: ReviewKey, meta: ReviewMeta): Promise<ReviewRecord | null>
  update(id: string, patch: ReviewPatch): Promise<void>
  /** Fingerprints of comments already posted on this PR by earlier reviews. */
  postedFingerprints(owner: string, repo: string, prNumber: number): Promise<Set<string>>
  list(query: ListQuery): Promise<{ items: ReviewRecord[]; total: number }>
  get(id: string): Promise<ReviewRecord | null>
  /** Newest first. Used for dashboard statistics. */
  recent(limit: number): Promise<ReviewRecord[]>
}

/** A running review older than this is assumed to have died with its process. */
export const STALE_RUNNING_MS = 15 * 60 * 1000
