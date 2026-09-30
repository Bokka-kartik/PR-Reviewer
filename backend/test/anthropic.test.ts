import { describe, expect, it } from 'vitest'
import { AnthropicReviewer } from '../src/review/anthropic.js'

interface Captured {
  url: string
  body: Record<string, any>
  headers: Headers
}

function reviewerReturning(responseBody: unknown, status = 200) {
  const captured: Captured[] = []
  const fakeFetch = async (input: any, init: any) => {
    captured.push({ url: String(input), body: JSON.parse(init.body), headers: new Headers(init.headers) })
    return new Response(JSON.stringify(responseBody), { status, headers: { 'content-type': 'application/json' } })
  }
  const reviewer = new AnthropicReviewer('test-key', 'test-model', { fetch: fakeFetch as any, maxRetries: 0 })
  return { reviewer, captured }
}

const message = (content: unknown[]) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'test-model',
  content,
  stop_reason: 'tool_use',
  stop_sequence: null,
  usage: { input_tokens: 321, output_tokens: 45 },
})

describe('AnthropicReviewer', () => {
  it('forces the submit_review tool and returns its comments with token usage', async () => {
    const comments = [{ path: 'a.ts', line: 3, severity: 'warning', body: 'Check for null.' }]
    const { reviewer, captured } = reviewerReturning(
      message([{ type: 'tool_use', id: 'tu_1', name: 'submit_review', input: { comments } }]),
    )

    const out = await reviewer.review({ system: 'SYSTEM', user: 'USER' })

    expect(out).toEqual({ comments, usage: { inputTokens: 321, outputTokens: 45 } })

    const req = captured[0]!
    expect(req.url).toContain('/v1/messages')
    expect(req.headers.get('x-api-key')).toBe('test-key')
    expect(req.body).toMatchObject({
      model: 'test-model',
      system: 'SYSTEM',
      tool_choice: { type: 'tool', name: 'submit_review' },
      messages: [{ role: 'user', content: 'USER' }],
    })
    expect(req.body['tools'][0].name).toBe('submit_review')
    expect(req.body['tools'][0].input_schema.required).toContain('comments')
  })

  it('returns no comments when the model sends an empty list', async () => {
    const { reviewer } = reviewerReturning(
      message([{ type: 'tool_use', id: 'tu_1', name: 'submit_review', input: { comments: [] } }]),
    )
    expect((await reviewer.review({ system: 's', user: 'u' })).comments).toEqual([])
  })

  it('treats a response without a usable tool call as no findings instead of crashing', async () => {
    const noTool = reviewerReturning(message([{ type: 'text', text: 'Looks fine.' }]))
    expect((await noTool.reviewer.review({ system: 's', user: 'u' })).comments).toEqual([])

    const badShape = reviewerReturning(
      message([{ type: 'tool_use', id: 'tu_1', name: 'submit_review', input: { comments: 'oops' } }]),
    )
    expect((await badShape.reviewer.review({ system: 's', user: 'u' })).comments).toEqual([])
  })

  it('surfaces API errors so the orchestrator can count the chunk as failed', async () => {
    const { reviewer } = reviewerReturning(
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      401,
    )
    await expect(reviewer.review({ system: 's', user: 'u' })).rejects.toThrow(/401|invalid x-api-key/)
  })
})
