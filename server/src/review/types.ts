export type Severity = 'critical' | 'warning' | 'suggestion'

/** Higher number = more important. */
export const SEVERITY_RANK: Record<Severity, number> = {
  suggestion: 1,
  warning: 2,
  critical: 3,
}

export interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  /** Line number in the new file. Undefined for deleted lines. */
  newLine?: number
  text: string
}

export interface Hunk {
  header: string
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: Hunk[]
  binary: boolean
}

export interface RawComment {
  path: string
  line: number
  severity: Severity
  body: string
}

export interface ReviewComment extends RawComment {
  fingerprint: string
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
}

export interface LlmReviewInput {
  system: string
  user: string
}

export interface LlmReviewOutput {
  comments: unknown[]
  usage: LlmUsage
}

/** Anything that can review one chunk of a diff. Faked in tests. */
export interface LlmReviewer {
  readonly model: string
  review(input: LlmReviewInput): Promise<LlmReviewOutput>
}
