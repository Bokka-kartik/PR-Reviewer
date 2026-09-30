import type { Webhooks } from '@octokit/webhooks'
import type { Logger } from '../log.js'
import type { JobQueue } from '../queue.js'
import { reviewPullRequest, type PullRequestRef, type ReviewDeps } from '../review/orchestrator.js'
import type { GitHubClient } from './client.js'

/** The part of a pull_request webhook payload this app reads. */
export interface PullRequestPayload {
  installation?: { id: number }
  repository: { name: string; owner: { login: string } }
  pull_request: {
    number: number
    title: string
    body: string | null
    html_url: string
    draft?: boolean
    head: { sha: string }
    user: { login: string; type: string } | null
    labels?: { name: string }[]
  }
}

export function toPullRequestRef(payload: PullRequestPayload): PullRequestRef {
  const pr = payload.pull_request
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    number: pr.number,
    headSha: pr.head.sha,
    title: pr.title,
    body: pr.body ?? '',
    url: pr.html_url,
    draft: pr.draft ?? false,
    author: pr.user?.login ?? 'unknown',
    authorIsBot: pr.user?.type === 'Bot',
    labels: (pr.labels ?? []).map((l) => l.name),
  }
}

export interface WebhookDeps {
  /** Returns a GitHub client authenticated as the app installation. */
  getGitHub(installationId: number): Promise<GitHubClient>
  review: Omit<ReviewDeps, 'github'>
  queue: JobQueue
  log: Logger
}

export function registerHandlers(webhooks: Webhooks, deps: WebhookDeps): void {
  webhooks.on(
    [
      'pull_request.opened',
      'pull_request.synchronize',
      'pull_request.reopened',
      'pull_request.ready_for_review',
    ],
    ({ payload }) => {
      const installationId = payload.installation?.id
      if (!installationId) {
        deps.log.warn('pull_request event without installation id, ignoring')
        return
      }
      const pr = toPullRequestRef(payload as unknown as PullRequestPayload)
      // Answer GitHub immediately; the review runs in the background.
      deps.queue.add(`${pr.owner}/${pr.repo}#${pr.number}`, async () => {
        const github = await deps.getGitHub(installationId)
        await reviewPullRequest(pr, { ...deps.review, github })
      })
    },
  )
}
