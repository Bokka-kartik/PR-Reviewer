export type Status = 'running' | 'completed' | 'skipped' | 'failed'
export type Severity = 'critical' | 'warning' | 'suggestion'

export interface ReviewComment {
  path: string
  line: number
  severity: Severity
  body: string
}

export interface ReviewSummary {
  id: string
  owner: string
  repo: string
  prNumber: number
  headSha: string
  prTitle: string
  prUrl: string
  author: string
  status: Status
  skipReason?: string
  error?: string
  filesReviewed: number
  filesSkipped: number
  chunks: number
  droppedChunks: number
  model: string
  inputTokens: number
  outputTokens: number
  summary?: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  commentCount: number
}

export interface ReviewDetail extends Omit<ReviewSummary, 'commentCount'> {
  comments: ReviewComment[]
}

export interface Stats {
  totals: {
    reviews: number
    completed: number
    skipped: number
    failed: number
    commentsPosted: number
    filesReviewed: number
    inputTokens: number
    outputTokens: number
    avgDurationMs: number
  }
  bySeverity: Record<Severity, number>
  byDay: { date: string; reviews: number; comments: number }[]
  byRepo: { repo: string; reviews: number; comments: number }[]
}

export interface ReviewPage {
  total: number
  page: number
  limit: number
  items: ReviewSummary[]
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}

const TOKEN_KEY = 'pr-reviewer.token'

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be blocked (private windows); the session then lasts until reload.
  }
}

async function get<T>(path: string, token = getToken()): Promise<T> {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return (await res.json()) as T
}

export const api = {
  stats: () => get<Stats>('/api/stats'),
  /** Used by the login form to check a token before saving it. */
  checkToken: (token: string) => get<Stats>('/api/stats', token),
  reviews: (params: { page: number; status?: string; repo?: string }) => {
    const q = new URLSearchParams({ page: String(params.page), limit: '15' })
    if (params.status) q.set('status', params.status)
    if (params.repo) q.set('repo', params.repo)
    return get<ReviewPage>(`/api/reviews?${q}`)
  },
  review: (id: string) => get<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}`),
}
