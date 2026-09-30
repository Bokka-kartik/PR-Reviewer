import { createHash } from 'node:crypto'
import { z } from 'zod'
import { commentableLines } from './diff.js'
import type { RepoConfig } from './repoConfig.js'
import { SEVERITY_RANK, type FileDiff, type ReviewComment } from './types.js'

const rawCommentSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(['critical', 'warning', 'suggestion']),
  body: z.string().trim().min(1).max(4000),
})

/** Stable id for a comment, independent of its line number (lines shift between pushes). */
export function fingerprint(path: string, body: string): string {
  const normalised = body.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
  return createHash('sha1').update(`${path}\n${normalised}`).digest('hex')
}

export interface ValidationResult {
  comments: ReviewComment[]
  dropped: { invalid: number; offDiff: number; duplicate: number; belowSeverity: number; overLimit: number }
}

/**
 * Turns whatever the model returned into comments that GitHub will accept:
 * well-formed, on a line that is really in the diff, not seen before, and within the limits.
 */
export function validateComments(
  raw: unknown[],
  files: FileDiff[],
  config: RepoConfig,
  alreadyPosted: ReadonlySet<string>,
): ValidationResult {
  const lineSets = new Map(files.map((f) => [f.path, commentableLines(f)]))
  const dropped = { invalid: 0, offDiff: 0, duplicate: 0, belowSeverity: 0, overLimit: 0 }
  const seen = new Set(alreadyPosted)
  const accepted: ReviewComment[] = []

  for (const item of raw) {
    const parsed = rawCommentSchema.safeParse(item)
    if (!parsed.success) {
      dropped.invalid++
      continue
    }
    const c = parsed.data
    if (!lineSets.get(c.path)?.has(c.line)) {
      dropped.offDiff++
      continue
    }
    if (SEVERITY_RANK[c.severity] < SEVERITY_RANK[config.minSeverity]) {
      dropped.belowSeverity++
      continue
    }
    const fp = fingerprint(c.path, c.body)
    if (seen.has(fp)) {
      dropped.duplicate++
      continue
    }
    seen.add(fp)
    accepted.push({ ...c, fingerprint: fp })
  }

  // Most important first, then by position, so the limit keeps the best comments.
  accepted.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.path.localeCompare(b.path) || a.line - b.line,
  )
  dropped.overLimit = Math.max(0, accepted.length - config.maxComments)
  return { comments: accepted.slice(0, config.maxComments), dropped }
}
