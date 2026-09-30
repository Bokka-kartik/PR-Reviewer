import Anthropic from '@anthropic-ai/sdk'
import type { LlmReviewInput, LlmReviewOutput, LlmReviewer } from './types.js'

const SUBMIT_REVIEW_TOOL = {
  name: 'submit_review',
  description:
    'Submit the review findings for this part of the diff. Use an empty list when there is nothing to report.',
  input_schema: {
    type: 'object' as const,
    properties: {
      comments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path exactly as shown in the diff header.' },
            line: { type: 'integer', description: 'New-file line number shown next to the line.' },
            severity: { type: 'string', enum: ['critical', 'warning', 'suggestion'] },
            body: { type: 'string', description: 'What is wrong and what to do about it.' },
          },
          required: ['path', 'line', 'severity', 'body'],
        },
      },
    },
    required: ['comments'],
  },
}

/** Reviews one diff chunk with Claude, forcing structured output through a tool call. */
export class AnthropicReviewer implements LlmReviewer {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    readonly model: string,
    /** Extra SDK options; tests use this to supply a fake `fetch`. */
    options: Omit<ConstructorParameters<typeof Anthropic>[0] & object, 'apiKey'> = {},
  ) {
    // The SDK retries rate limits and transient errors with backoff.
    this.client = new Anthropic({ maxRetries: 3, ...options, apiKey })
  }

  async review(input: LlmReviewInput): Promise<LlmReviewOutput> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: input.system,
      tools: [SUBMIT_REVIEW_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_REVIEW_TOOL.name },
      messages: [{ role: 'user', content: input.user }],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    const payload = toolUse && toolUse.type === 'tool_use' ? (toolUse.input as { comments?: unknown }) : undefined
    const comments = Array.isArray(payload?.comments) ? payload.comments : []

    return {
      comments,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }
}
