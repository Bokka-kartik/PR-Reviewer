import { describe, expect, it } from 'vitest'
import { computeStats } from '../src/api/stats.js'
import { seedDemoStore } from '../src/demo/seed.js'
import { MemoryReviewStore } from '../src/store/memory.js'

describe('seedDemoStore', () => {
  const now = new Date('2026-03-10T18:00:00Z')

  it('creates a varied, believable data set for the dashboard', async () => {
    const store = new MemoryReviewStore()
    const count = await seedDemoStore(store, now)
    const reviews = await store.recent(1000)
    const stats = computeStats(reviews, now)

    expect(count).toBeGreaterThanOrEqual(30)
    expect(reviews).toHaveLength(count)
    // Every state the UI can show is present.
    expect(stats.totals.completed).toBeGreaterThan(0)
    expect(stats.totals.skipped).toBeGreaterThan(0)
    expect(stats.totals.failed).toBeGreaterThan(0)
    expect(stats.bySeverity.critical).toBeGreaterThan(0)
    expect(stats.bySeverity.warning).toBeGreaterThan(0)
    expect(stats.bySeverity.suggestion).toBeGreaterThan(0)
    expect(stats.byRepo.length).toBe(3)
    // Activity fills the chart window, with some quiet days.
    expect(stats.byDay).toHaveLength(14)
    expect(stats.byDay.reduce((sum, d) => sum + d.reviews, 0)).toBe(count)
    expect(stats.byDay.some((d) => d.reviews === 0)).toBe(true)
  })

  it('is deterministic and produces internally consistent records', async () => {
    const a = new MemoryReviewStore()
    const b = new MemoryReviewStore()
    await seedDemoStore(a, now)
    await seedDemoStore(b, now)
    const strip = (rs: Awaited<ReturnType<MemoryReviewStore['recent']>>) => rs.map(({ id: _id, ...rest }) => rest)
    expect(strip(await a.recent(1000))).toEqual(strip(await b.recent(1000)))

    for (const r of await a.recent(1000)) {
      if (r.status === 'failed') expect(r.error).toBeTruthy()
      if (r.status === 'skipped') expect(r.skipReason).toBeTruthy()
      if (r.status !== 'completed') expect(r.comments).toHaveLength(0)
      expect(r.startedAt.getTime()).toBeLessThanOrEqual(now.getTime())
    }
    const fingerprints = (await a.recent(1000)).flatMap((r) => r.comments.map((c) => c.fingerprint))
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })
})
