import type { Octokit } from 'octokit'

export interface ReviewCommentInput {
  path: string
  line: number
  body: string
}

/** The few GitHub operations the reviewer needs. Faked in tests. */
export interface GitHubClient {
  getDiff(owner: string, repo: string, pullNumber: number): Promise<string>
  /** Returns null when the file does not exist at that ref. */
  getFile(owner: string, repo: string, path: string, ref: string): Promise<string | null>
  createReview(params: {
    owner: string
    repo: string
    pullNumber: number
    commitId: string
    body: string
    comments: ReviewCommentInput[]
  }): Promise<void>
}

export function githubClient(octokit: Octokit): GitHubClient {
  return {
    async getDiff(owner, repo, pullNumber) {
      const res = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: pullNumber,
        headers: { accept: 'application/vnd.github.diff' },
      })
      return res.data as unknown as string
    },

    async getFile(owner, repo, path, ref) {
      try {
        const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path,
          ref,
          headers: { accept: 'application/vnd.github.raw+json' },
        })
        return typeof res.data === 'string' ? res.data : null
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null
        throw e
      }
    },

    async createReview({ owner, repo, pullNumber, commitId, body, comments }) {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        event: 'COMMENT',
        body,
        comments: comments.map((c) => ({ path: c.path, line: c.line, side: 'RIGHT' as const, body: c.body })),
      })
    },
  }
}
