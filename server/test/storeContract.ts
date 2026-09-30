import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ReviewStore } from '../src/store/types.js'

const meta = { prTitle: 'Title', prUrl: 'https://example.test/pr/1', author: 'kartik' }

/** Behaviour every ReviewStore must have, run against the in-memory and MongoDB stores. */
export function storeContract(name: string, makeStore: () => ReviewStore | Promise<ReviewStore>, options: { skip?: boolean } = {}) {
  describe.skipIf(options.skip)(`${name} store contract`, () => {
    // Fresh owner per test, so tests never see each other's rows in a shared database.
    const key = (headSha = 'sha-1', owner = `owner-${randomUUID()}`) => ({ owner, repo: 'r', prNumber: 1, headSha })

    it('claims a commit once', async () => {
      const store = await makeStore()
      const k = key()
      const first = await store.claim(k, meta)
      expect(first).toMatchObject({ ...k, ...meta, status: 'running' })
      expect(await store.claim(k, meta)).toBeNull()
    })

    it('does not re-claim a completed review', async () => {
      const store = await makeStore()
      const k = key()
      const rec = (await store.claim(k, meta))!
      await store.update(rec.id, { status: 'completed' })
      expect(await store.claim(k, meta)).toBeNull()
    })

    it('lets a failed or skipped review be claimed again, with a clean slate', async () => {
      const store = await makeStore()
      const k = key()
      const rec = (await store.claim(k, meta))!
      await store.update(rec.id, { status: 'failed', error: 'boom', inputTokens: 50 })

      const retry = await store.claim(k, meta)
      expect(retry).not.toBeNull()
      expect(retry!.id).toBe(rec.id)
      expect(retry!.status).toBe('running')
      expect(retry!.error ?? undefined).toBeUndefined()
      expect(retry!.inputTokens).toBe(0)

      await store.update(rec.id, { status: 'skipped', skipReason: 'draft' })
      expect(await store.claim(k, meta)).not.toBeNull()
    })

    it('keeps different commits of the same pull request separate', async () => {
      const store = await makeStore()
      const a = key('sha-a')
      expect(await store.claim(a, meta)).not.toBeNull()
      expect(await store.claim({ ...a, headSha: 'sha-b' }, meta)).not.toBeNull()
    })

    it('remembers fingerprints of posted comments per pull request', async () => {
      const store = await makeStore()
      const k = key()
      const rec = (await store.claim(k, meta))!
      await store.update(rec.id, {
        status: 'completed',
        comments: [{ path: 'a.ts', line: 1, severity: 'warning', body: 'x', fingerprint: 'fp-1' }],
      })
      expect([...(await store.postedFingerprints(k.owner, k.repo, k.prNumber))]).toEqual(['fp-1'])
      expect((await store.postedFingerprints(k.owner, k.repo, 999)).size).toBe(0)
    })

    it('lists newest first, filters, paginates and fetches by id', async () => {
      const store = await makeStore()
      const owner = `owner-${randomUUID()}`
      const a = (await store.claim({ owner, repo: 'r', prNumber: 1, headSha: 'a' }, meta))!
      await new Promise((r) => setTimeout(r, 5))
      const b = (await store.claim({ owner, repo: 'r', prNumber: 2, headSha: 'b' }, meta))!
      await store.update(a.id, { status: 'completed' })
      await store.update(b.id, { status: 'failed' })

      const all = await store.list({ repo: `${owner}/r`, limit: 10, skip: 0 })
      expect(all.total).toBe(2)
      expect(all.items.map((r) => r.id)).toEqual([b.id, a.id])

      expect((await store.list({ repo: `${owner}/r`, status: 'failed', limit: 10, skip: 0 })).items.map((r) => r.id)).toEqual([b.id])
      expect((await store.list({ repo: `${owner}/r`, limit: 1, skip: 1 })).items.map((r) => r.id)).toEqual([a.id])

      expect((await store.get(a.id))!.status).toBe('completed')
      expect(await store.get('does-not-exist')).toBeNull()
      expect((await store.recent(1000)).length).toBeGreaterThanOrEqual(2)
    })
  })
}
