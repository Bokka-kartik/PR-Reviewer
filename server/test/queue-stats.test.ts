import { describe, expect, it } from 'vitest'
import { computeStats } from '../src/api/stats.js'
import { silentLogger } from '../src/log.js'
import { JobQueue } from '../src/queue.js'
import type { ReviewRecord } from '../src/store/types.js'

describe('JobQueue', () => {
  it('never runs more jobs at once than its concurrency', async () => {
    const queue = new JobQueue(2, silentLogger)
    let active = 0
    let peak = 0
    let done = 0
    for (let i = 0; i < 6; i++) {
      queue.add(`job-${i}`, async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        done++
      })
    }
    await queue.onIdle()
    expect(done).toBe(6)
    expect(peak).toBe(2)
  })

  it('keeps going after a job throws', async () => {
    const queue = new JobQueue(1, silentLogger)
    let ran = false
    queue.add('bad', async () => {
      throw new Error('nope')
    })
    queue.add('good', async () => {
      ran = true
    })
    await queue.onIdle()
    expect(ran).toBe(true)
  })

  it('reports idle immediately when empty', async () => {
    await expect(new JobQueue(1, silentLogger).onIdle()).resolves.toBeUndefined()
  })
})

const record = (over: Partial<ReviewRecord>): ReviewRecord => ({
  id: 'x',
  owner: 'acme',
  repo: 'widgets',
  prNumber: 1,
  headSha: 's',
  prTitle: '',
  prUrl: '',
  author: '',
  status: 'completed',
  filesReviewed: 2,
  filesSkipped: 0,
  chunks: 1,
  droppedChunks: 0,
  comments: [],
  model: 'm',
  inputTokens: 100,
  outputTokens: 10,
  startedAt: new Date('2026-03-10T12:00:00Z'),
  durationMs: 1000,
  ...over,
})

const c = (severity: 'critical' | 'warning' | 'suggestion') => ({ path: 'a', line: 1, severity, body: severity, fingerprint: severity })

describe('computeStats', () => {
  const now = new Date('2026-03-10T18:00:00Z')

  it('totals reviews, comments, tokens and average duration', () => {
    const stats = computeStats(
      [
        record({ comments: [c('critical'), c('warning')], durationMs: 1000 }),
        record({ status: 'failed', durationMs: 50_000 }),
        record({ status: 'skipped', filesReviewed: 0 }),
        record({ repo: 'gadgets', comments: [c('suggestion')], durationMs: 3000 }),
      ],
      now,
    )
    expect(stats.totals).toMatchObject({
      reviews: 4,
      completed: 2,
      failed: 1,
      skipped: 1,
      commentsPosted: 3,
      filesReviewed: 6,
      inputTokens: 400,
      avgDurationMs: 2000, // only completed reviews count
    })
    expect(stats.bySeverity).toEqual({ critical: 1, warning: 1, suggestion: 1 })
    expect(stats.byRepo).toEqual([
      { repo: 'acme/widgets', reviews: 3, comments: 2 },
      { repo: 'acme/gadgets', reviews: 1, comments: 1 },
    ])
  })

  it('returns one entry per day for the window, including quiet days, oldest first', () => {
    const stats = computeStats(
      [
        record({ startedAt: new Date('2026-03-10T01:00:00Z'), comments: [c('warning')] }),
        record({ startedAt: new Date('2026-03-08T23:00:00Z') }),
        record({ startedAt: new Date('2026-01-01T00:00:00Z') }), // outside the window
      ],
      now,
      5,
    )
    expect(stats.byDay).toEqual([
      { date: '2026-03-06', reviews: 0, comments: 0 },
      { date: '2026-03-07', reviews: 0, comments: 0 },
      { date: '2026-03-08', reviews: 1, comments: 0 },
      { date: '2026-03-09', reviews: 0, comments: 0 },
      { date: '2026-03-10', reviews: 1, comments: 1 },
    ])
  })

  it('handles no data', () => {
    const stats = computeStats([], now)
    expect(stats.totals.reviews).toBe(0)
    expect(stats.totals.avgDurationMs).toBe(0)
    expect(stats.byDay).toHaveLength(14)
  })
})
