import type { GitHubClient } from '../github/client.js'
import type { Logger } from '../log.js'
import type { ReviewRecord, ReviewStore } from '../store/types.js'
import { chunkFiles } from './chunk.js'
import { parseDiff } from './diff.js'
import { filterFiles } from './filter.js'
import { buildPrompt } from './prompt.js'
import { CONFIG_PATH, parseRepoConfig, type RepoConfig } from './repoConfig.js'
import type { LlmReviewer, LlmUsage, ReviewComment } from './types.js'
import { validateComments, type ValidationResult } from './validate.js'

export interface PullRequestRef {
  owner: string
  repo: string
  number: number
  headSha: string
  title: string
  body: string
  url: string
  draft: boolean
  author: string
  authorIsBot: boolean
  labels: string[]
}

export interface ReviewDeps {
  github: GitHubClient
  llm: LlmReviewer
  store: ReviewStore
  log: Logger
  /** Total diff text allowed per PR. */
  maxDiffChars: number
  /** Diff text per model call. */
  maxChunkChars?: number
  /** Model calls in flight at once for one PR. */
  chunkConcurrency?: number
}

export const SKIP_LABEL = 'no-ai-review'
const DEFAULT_CHUNK_CHARS = 30_000
const DEFAULT_CHUNK_CONCURRENCY = 3

const SEVERITY_LABEL = { critical: '🔴 Critical', warning: '🟠 Warning', suggestion: '🔵 Suggestion' } as const

/**
 * Reviews one pull request commit end to end and records the outcome.
 * Returns null when this commit was already handled (duplicate webhook).
 */
export async function reviewPullRequest(pr: PullRequestRef, deps: ReviewDeps): Promise<ReviewRecord | null> {
  const { store, log } = deps
  const started = Date.now()
  const key = { owner: pr.owner, repo: pr.repo, prNumber: pr.number, headSha: pr.headSha }

  const record = await store.claim(key, { prTitle: pr.title, prUrl: pr.url, author: pr.author })
  if (!record) {
    log.info('review already handled, ignoring', key)
    return null
  }

  const finish = async (patch: Parameters<ReviewStore['update']>[1]) => {
    const finished = { ...patch, finishedAt: new Date(), durationMs: Date.now() - started }
    await store.update(record.id, finished)
    return (await store.get(record.id)) ?? { ...record, ...finished }
  }

  try {
    const skip = (reason: string) => {
      log.info('review skipped', { ...key, reason })
      return finish({ status: 'skipped', skipReason: reason })
    }

    if (pr.authorIsBot) return await skip('pull request is from a bot')
    if (pr.labels.includes(SKIP_LABEL)) return await skip(`labelled ${SKIP_LABEL}`)

    const configText = await deps.github.getFile(pr.owner, pr.repo, CONFIG_PATH, pr.headSha)
    const { config, warning } = parseRepoConfig(configText)
    if (!config.enabled) return await skip(`disabled in ${CONFIG_PATH}`)
    if (pr.draft && !config.reviewDrafts) return await skip('draft pull request')

    const diffText = await deps.github.getDiff(pr.owner, pr.repo, pr.number)
    const { reviewable, skipped } = filterFiles(parseDiff(diffText), config.ignore)
    if (reviewable.length === 0) return await skip('no reviewable files in this change')

    const { chunks, droppedChunks } = chunkFiles(reviewable, deps.maxChunkChars ?? DEFAULT_CHUNK_CHARS, deps.maxDiffChars)
    const alreadyPosted = await store.postedFingerprints(pr.owner, pr.repo, pr.number)

    const { raw, usage, failedChunks } = await runChunks(chunks.map((c) => c.text), pr, config, deps)
    if (failedChunks === chunks.length) throw new Error('every model call failed')

    const validation = validateComments(raw, reviewable, config, alreadyPosted)
    const summary = buildSummary({
      files: reviewable.length,
      skippedFiles: skipped.length,
      chunks: chunks.length,
      droppedChunks,
      failedChunks,
      validation,
      configWarning: warning,
    })

    if (validation.comments.length > 0) {
      await postReview(pr, validation.comments, summary, deps)
    }

    log.info('review completed', { ...key, comments: validation.comments.length, chunks: chunks.length })
    return await finish({
      status: 'completed',
      filesReviewed: reviewable.length,
      filesSkipped: skipped.length,
      chunks: chunks.length,
      droppedChunks,
      comments: validation.comments,
      model: deps.llm.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      summary,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.error('review failed', { ...key, error: message })
    return await finish({ status: 'failed', error: message })
  }
}

async function runChunks(chunkTexts: string[], pr: PullRequestRef, config: RepoConfig, deps: ReviewDeps) {
  const ctx = { title: pr.title, description: pr.body, config }
  const raw: unknown[] = []
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 }
  let failedChunks = 0
  let next = 0

  const worker = async () => {
    while (next < chunkTexts.length) {
      const index = next++
      try {
        const out = await deps.llm.review(buildPrompt(chunkTexts[index]!, ctx))
        raw.push(...out.comments)
        usage.inputTokens += out.usage.inputTokens
        usage.outputTokens += out.usage.outputTokens
      } catch (e) {
        failedChunks++
        deps.log.warn('model call failed for a chunk', { chunk: index, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  const workers = Math.min(deps.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY, chunkTexts.length)
  await Promise.all(Array.from({ length: workers }, worker))
  return { raw, usage, failedChunks }
}

function formatComment(c: ReviewComment): string {
  return `**${SEVERITY_LABEL[c.severity]}**\n\n${c.body}`
}

async function postReview(pr: PullRequestRef, comments: ReviewComment[], summary: string, deps: ReviewDeps) {
  const base = { owner: pr.owner, repo: pr.repo, pullNumber: pr.number, commitId: pr.headSha }
  try {
    await deps.github.createReview({
      ...base,
      body: summary,
      comments: comments.map((c) => ({ path: c.path, line: c.line, body: formatComment(c) })),
    })
  } catch (e) {
    // 422 means GitHub rejected a line position. Post everything as one plain comment instead of losing it.
    if ((e as { status?: number }).status !== 422) throw e
    deps.log.warn('inline comments rejected, posting as plain text', { pr: pr.number })
    const list = comments.map((c) => `- \`${c.path}:${c.line}\` ${formatComment(c).replace(/\n+/g, ' ')}`).join('\n')
    await deps.github.createReview({ ...base, body: `${summary}\n\n${list}`, comments: [] })
  }
}

function buildSummary(info: {
  files: number
  skippedFiles: number
  chunks: number
  droppedChunks: number
  failedChunks: number
  validation: ValidationResult
  configWarning?: string
}): string {
  const counts = { critical: 0, warning: 0, suggestion: 0 }
  for (const c of info.validation.comments) counts[c.severity]++
  const total = info.validation.comments.length

  const lines = [
    '### 🤖 Automated review',
    total === 0
      ? `Reviewed ${info.files} file${info.files === 1 ? '' : 's'}: nothing to report.`
      : `Reviewed ${info.files} file${info.files === 1 ? '' : 's'} and left ${total} comment${total === 1 ? '' : 's'}: ` +
        `${counts.critical} critical, ${counts.warning} warnings, ${counts.suggestion} suggestions.`,
  ]
  const notes: string[] = []
  if (info.skippedFiles > 0) notes.push(`${info.skippedFiles} file(s) skipped (lockfiles, binaries, ignored paths).`)
  if (info.droppedChunks > 0) notes.push(`This pull request is large; ${info.droppedChunks} part(s) were not reviewed.`)
  if (info.failedChunks > 0) notes.push(`${info.failedChunks} part(s) could not be reviewed because of model errors.`)
  if (info.validation.dropped.overLimit > 0) notes.push(`${info.validation.dropped.overLimit} lower-priority comment(s) omitted (limit reached).`)
  if (info.validation.dropped.duplicate > 0) notes.push(`${info.validation.dropped.duplicate} comment(s) already made on an earlier push were not repeated.`)
  if (info.configWarning) notes.push(info.configWarning)
  if (notes.length > 0) lines.push('', ...notes.map((n) => `- ${n}`))
  lines.push('', '_Generated by an AI model and may be wrong. Treat it as a second pair of eyes, not a verdict._')
  return lines.join('\n')
}
