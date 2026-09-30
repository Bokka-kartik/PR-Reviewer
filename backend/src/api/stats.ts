import type { ReviewRecord } from '../store/types.js'

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
  bySeverity: { critical: number; warning: number; suggestion: number }
  /** Oldest first, one entry per day including days with no activity. */
  byDay: { date: string; reviews: number; comments: number }[]
  byRepo: { repo: string; reviews: number; comments: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function computeStats(reviews: ReviewRecord[], now: Date = new Date(), days = 14): Stats {
  const totals = {
    reviews: reviews.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    commentsPosted: 0,
    filesReviewed: 0,
    inputTokens: 0,
    outputTokens: 0,
    avgDurationMs: 0,
  }
  const bySeverity = { critical: 0, warning: 0, suggestion: 0 }
  const repos = new Map<string, { reviews: number; comments: number }>()
  const daily = new Map<string, { reviews: number; comments: number }>()
  for (let i = days - 1; i >= 0; i--) {
    daily.set(dayKey(new Date(now.getTime() - i * DAY_MS)), { reviews: 0, comments: 0 })
  }

  let durationSum = 0
  let durationCount = 0
  for (const r of reviews) {
    if (r.status === 'completed') totals.completed++
    else if (r.status === 'skipped') totals.skipped++
    else if (r.status === 'failed') totals.failed++

    totals.commentsPosted += r.comments.length
    totals.filesReviewed += r.filesReviewed
    totals.inputTokens += r.inputTokens
    totals.outputTokens += r.outputTokens
    for (const c of r.comments) bySeverity[c.severity]++

    if (r.status === 'completed' && r.durationMs !== undefined) {
      durationSum += r.durationMs
      durationCount++
    }

    const repoName = `${r.owner}/${r.repo}`
    const repo = repos.get(repoName) ?? { reviews: 0, comments: 0 }
    repo.reviews++
    repo.comments += r.comments.length
    repos.set(repoName, repo)

    const day = daily.get(dayKey(new Date(r.startedAt)))
    if (day) {
      day.reviews++
      day.comments += r.comments.length
    }
  }
  totals.avgDurationMs = durationCount > 0 ? Math.round(durationSum / durationCount) : 0

  return {
    totals,
    bySeverity,
    byDay: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
    byRepo: [...repos.entries()]
      .map(([repo, v]) => ({ repo, ...v }))
      .sort((a, b) => b.reviews - a.reviews || a.repo.localeCompare(b.repo))
      .slice(0, 10),
  }
}
