import { Webhooks } from '@octokit/webhooks'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { registerHandlers } from '../src/github/webhooks.js'
import { silentLogger } from '../src/log.js'
import { JobQueue } from '../src/queue.js'
import { MemoryReviewStore } from '../src/store/memory.js'
import { fakeGitHub, fakeLlm, usage, type FakeGitHub } from './helpers.js'

const SECRET = 'test-webhook-secret'
const TOKEN = 'dashboard-token-1234567890'

function pullRequestPayload(action: string, over: Record<string, unknown> = {}) {
  return {
    action,
    installation: { id: 42 },
    repository: { name: 'widgets', owner: { login: 'acme' } },
    pull_request: {
      number: 7,
      title: 'Add host support',
      body: 'Lets you choose the listen host.',
      html_url: 'https://github.com/acme/widgets/pull/7',
      draft: false,
      head: { sha: 'sha-1' },
      user: { login: 'kartik', type: 'User' },
      labels: [],
      ...over,
    },
  }
}

let webhooks: Webhooks
let store: MemoryReviewStore
let queue: JobQueue
let github: FakeGitHub
let installationsRequested: number[]
let app: ReturnType<typeof createApp>

beforeEach(() => {
  webhooks = new Webhooks({ secret: SECRET })
  store = new MemoryReviewStore()
  queue = new JobQueue(2, silentLogger)
  github = fakeGitHub()
  installationsRequested = []
  registerHandlers(webhooks, {
    getGitHub: async (id) => {
      installationsRequested.push(id)
      return github
    },
    review: {
      llm: fakeLlm(() => ({
        comments: [{ path: 'src/app.ts', line: 12, severity: 'warning', body: 'HOST may be undefined.' }],
        usage,
      })),
      store,
      log: silentLogger,
      maxDiffChars: 300_000,
    },
    queue,
    log: silentLogger,
  })
  app = createApp({ webhooks, store, dashboardToken: TOKEN, log: silentLogger })
})

async function deliver(event: string, payload: unknown, opts: { signature?: string; delivery?: string } = {}) {
  const body = JSON.stringify(payload)
  return request(app)
    .post('/webhook')
    .set('content-type', 'application/json')
    .set('x-github-event', event)
    .set('x-github-delivery', opts.delivery ?? 'delivery-1')
    .set('x-hub-signature-256', opts.signature ?? (await webhooks.sign(body)))
    .send(body)
}

describe('POST /webhook', () => {
  it('accepts a signed pull request event, answers immediately and reviews in the background', async () => {
    const res = await deliver('pull_request', pullRequestPayload('opened'))
    expect(res.status).toBe(202)

    await queue.onIdle()
    expect(installationsRequested).toEqual([42])
    expect(github.created).toHaveLength(1)
    expect(github.created[0]).toMatchObject({ owner: 'acme', repo: 'widgets', pullNumber: 7, commitId: 'sha-1' })
    const { items } = await store.list({ limit: 10, skip: 0 })
    expect(items[0]).toMatchObject({ status: 'completed', prTitle: 'Add host support', author: 'kartik' })
  })

  it.each(['synchronize', 'reopened', 'ready_for_review'])('also reviews on %s', async (action) => {
    expect((await deliver('pull_request', pullRequestPayload(action))).status).toBe(202)
    await queue.onIdle()
    expect(github.created).toHaveLength(1)
  })

  it('ignores actions it does not care about', async () => {
    expect((await deliver('pull_request', pullRequestPayload('closed'))).status).toBe(202)
    expect((await deliver('ping', { zen: 'Keep it logically awesome.' })).status).toBe(202)
    await queue.onIdle()
    expect(github.created).toHaveLength(0)
    expect(installationsRequested).toHaveLength(0)
  })

  it('reviews a redelivered event only once', async () => {
    await deliver('pull_request', pullRequestPayload('opened'), { delivery: 'a' })
    await queue.onIdle()
    await deliver('pull_request', pullRequestPayload('opened'), { delivery: 'b' })
    await queue.onIdle()
    expect(github.created).toHaveLength(1)
  })

  it('rejects a wrong signature and does nothing', async () => {
    const res = await deliver('pull_request', pullRequestPayload('opened'), { signature: 'sha256=' + '0'.repeat(64) })
    expect(res.status).toBe(401)
    await queue.onIdle()
    expect(installationsRequested).toHaveLength(0)
  })

  it('rejects a body that was changed after signing', async () => {
    const original = JSON.stringify(pullRequestPayload('opened'))
    const signature = await webhooks.sign(original)
    const res = await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd')
      .set('x-hub-signature-256', signature)
      .send(original.replace('sha-1', 'evil'))
    expect(res.status).toBe(401)
  })

  it('rejects requests missing the GitHub headers', async () => {
    const res = await request(app).post('/webhook').set('content-type', 'application/json').send('{}')
    expect(res.status).toBe(400)
  })

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json'
    const res = await request(app)
      .post('/webhook')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd')
      .set('x-hub-signature-256', await webhooks.sign(body))
      .send(body)
    expect(res.status).toBe(400)
  })

  it('skips pull requests from bots', async () => {
    await deliver('pull_request', pullRequestPayload('opened', { user: { login: 'dependabot[bot]', type: 'Bot' } }))
    await queue.onIdle()
    expect(github.created).toHaveLength(0)
    expect((await store.list({ limit: 1, skip: 0 })).items[0]!.status).toBe('skipped')
  })
})

describe('dashboard API', () => {
  const auth = { authorization: `Bearer ${TOKEN}` }

  async function seed() {
    await deliver('pull_request', pullRequestPayload('opened'))
    await queue.onIdle()
    return (await store.list({ limit: 1, skip: 0 })).items[0]!
  }

  it('requires the dashboard token', async () => {
    for (const path of ['/api/stats', '/api/reviews', '/api/reviews/abc']) {
      expect((await request(app).get(path)).status).toBe(401)
      expect((await request(app).get(path).set('authorization', 'Bearer wrong-token-value')).status).toBe(401)
      expect((await request(app).get(path).set('authorization', TOKEN)).status).toBe(401)
    }
  })

  it('lists reviews without comment bodies but with a count', async () => {
    await seed()
    const res = await request(app).get('/api/reviews').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0]).toMatchObject({ owner: 'acme', repo: 'widgets', status: 'completed', commentCount: 1 })
    expect(res.body.items[0].comments).toBeUndefined()
  })

  it('filters and paginates', async () => {
    await seed()
    expect((await request(app).get('/api/reviews?status=failed').set(auth)).body.total).toBe(0)
    expect((await request(app).get('/api/reviews?repo=acme/widgets').set(auth)).body.total).toBe(1)
    expect((await request(app).get('/api/reviews?repo=acme/other').set(auth)).body.total).toBe(0)
    expect((await request(app).get('/api/reviews?limit=1000&page=-3').set(auth)).body).toMatchObject({
      limit: 100,
      page: 1,
    })
    expect((await request(app).get('/api/reviews?status=bogus').set(auth)).status).toBe(400)
  })

  it('returns one review with its comments, or 404', async () => {
    const review = await seed()
    const res = await request(app).get(`/api/reviews/${review.id}`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.comments[0]).toMatchObject({ path: 'src/app.ts', line: 12, severity: 'warning' })
    expect((await request(app).get('/api/reviews/nope').set(auth)).status).toBe(404)
  })

  it('returns statistics', async () => {
    await seed()
    const res = await request(app).get('/api/stats').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.totals).toMatchObject({ reviews: 1, completed: 1, commentsPosted: 1 })
    expect(res.body.bySeverity.warning).toBe(1)
    expect(res.body.byDay).toHaveLength(14)
  })

  it('serves an unauthenticated health check', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' })
  })
})
