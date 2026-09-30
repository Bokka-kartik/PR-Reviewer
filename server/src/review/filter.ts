import { minimatch } from 'minimatch'
import type { FileDiff } from './types.js'

/** Files that add cost but no review value. */
export const DEFAULT_IGNORE = [
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/poetry.lock',
  '**/Cargo.lock',
  '**/go.sum',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/*.snap',
  '**/*.svg',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.ico',
  '**/*.pdf',
  '.pr-reviewer.yml',
]

export interface FilterResult {
  reviewable: FileDiff[]
  skipped: { path: string; reason: string }[]
}

export function filterFiles(files: FileDiff[], extraIgnore: string[] = []): FilterResult {
  const patterns = [...DEFAULT_IGNORE, ...extraIgnore]
  const reviewable: FileDiff[] = []
  const skipped: { path: string; reason: string }[] = []

  for (const file of files) {
    if (file.binary) {
      skipped.push({ path: file.path, reason: 'binary file' })
    } else if (file.status === 'deleted') {
      skipped.push({ path: file.path, reason: 'deleted file' })
    } else if (file.hunks.length === 0) {
      skipped.push({ path: file.path, reason: 'no changed lines' })
    } else if (patterns.some((p) => minimatch(file.path, p, { dot: true }))) {
      skipped.push({ path: file.path, reason: 'ignored by pattern' })
    } else {
      reviewable.push(file)
    }
  }
  return { reviewable, skipped }
}
