import type { GitHubClient } from '../src/github/client.js'
import type { PullRequestRef } from '../src/review/orchestrator.js'
import type { LlmReviewInput, LlmReviewOutput, LlmReviewer } from '../src/review/types.js'
import { SAMPLE_DIFF } from './fixtures/diffs.js'

export interface CreatedReview {
  owner: string
  repo: string
  pullNumber: number
  commitId: string
  body: string
  comments: { path: string; line: number; body: string }[]
}

export interface FakeGitHub extends GitHubClient {
  created: CreatedReview[]
  diffCalls: number
  /** Content of .pr-reviewer.yml, or null when the repo has none. */
  configFile: string | null
  diff: string
  /** If set, the next createReview call rejects with this error. */
  failNextCreate?: unknown
}

export function fakeGitHub(overrides: Partial<Pick<FakeGitHub, 'diff' | 'configFile'>> = {}): FakeGitHub {
  const fake: FakeGitHub = {
    created: [],
    diffCalls: 0,
    configFile: overrides.configFile ?? null,
    diff: overrides.diff ?? SAMPLE_DIFF,
    async getDiff() {
      fake.diffCalls++
      return fake.diff
    },
    async getFile(_o, _r, path) {
      return path === '.pr-reviewer.yml' ? fake.configFile : null
    },
    async createReview(params) {
      if (fake.failNextCreate) {
        const err = fake.failNextCreate
        fake.failNextCreate = undefined
        throw err
      }
      fake.created.push(params)
    },
  }
  return fake
}

export type LlmBehaviour = (input: LlmReviewInput, call: number) => LlmReviewOutput | Promise<LlmReviewOutput>

export interface FakeLlm extends LlmReviewer {
  inputs: LlmReviewInput[]
}

export function fakeLlm(behaviour: LlmBehaviour): FakeLlm {
  const fake: FakeLlm = {
    model: 'fake-model',
    inputs: [],
    async review(input) {
      fake.inputs.push(input)
      return behaviour(input, fake.inputs.length)
    },
  }
  return fake
}

export const usage = { inputTokens: 100, outputTokens: 20 }

export function pr(overrides: Partial<PullRequestRef> = {}): PullRequestRef {
  return {
    owner: 'acme',
    repo: 'widgets',
    number: 7,
    headSha: 'sha-1',
    title: 'Add host support',
    body: 'Lets you choose the listen host.',
    url: 'https://github.com/acme/widgets/pull/7',
    draft: false,
    author: 'kartik',
    authorIsBot: false,
    labels: [],
    ...overrides,
  }
}
