import { describe, expect, it } from 'vitest'
import { toPullRequestRef, type PullRequestPayload } from '../src/github/webhooks.js'

const payload = (over: Partial<PullRequestPayload['pull_request']> = {}): PullRequestPayload => ({
  installation: { id: 42 },
  repository: { name: 'widgets', owner: { login: 'acme' } },
  pull_request: {
    number: 7,
    title: 'Add host support',
    body: 'Body text',
    html_url: 'https://github.com/acme/widgets/pull/7',
    draft: true,
    head: { sha: 'sha-1' },
    user: { login: 'kartik', type: 'User' },
    labels: [{ name: 'bug' }, { name: 'no-ai-review' }],
    ...over,
  },
})

describe('toPullRequestRef', () => {
  it('maps the webhook payload to the fields the reviewer uses', () => {
    expect(toPullRequestRef(payload())).toEqual({
      owner: 'acme',
      repo: 'widgets',
      number: 7,
      headSha: 'sha-1',
      title: 'Add host support',
      body: 'Body text',
      url: 'https://github.com/acme/widgets/pull/7',
      draft: true,
      author: 'kartik',
      authorIsBot: false,
      labels: ['bug', 'no-ai-review'],
    })
  })

  it('copes with missing optional fields', () => {
    const ref = toPullRequestRef(payload({ body: null, draft: undefined, user: null, labels: undefined }))
    expect(ref).toMatchObject({ body: '', draft: false, author: 'unknown', authorIsBot: false, labels: [] })
  })

  it('recognises bot authors', () => {
    expect(toPullRequestRef(payload({ user: { login: 'dependabot[bot]', type: 'Bot' } })).authorIsBot).toBe(true)
  })
})
