import { describe, expect, it } from 'vitest'
import { chunkFiles } from '../src/review/chunk.js'
import { parseDiff } from '../src/review/diff.js'
import { filterFiles } from '../src/review/filter.js'
import { SAMPLE_DIFF } from './fixtures/diffs.js'

const files = parseDiff(SAMPLE_DIFF)

describe('filterFiles', () => {
  it('keeps source changes and drops deleted, binary and lock files', () => {
    const { reviewable, skipped } = filterFiles(files)
    expect(reviewable.map((f) => f.path)).toEqual(['src/app.ts', 'src/new.ts', 'lib/b.ts'])
    expect(Object.fromEntries(skipped.map((s) => [s.path, s.reason]))).toEqual({
      'old.txt': 'deleted file',
      'logo.png': 'binary file',
      'package-lock.json': 'ignored by pattern',
    })
  })

  it('applies extra ignore patterns from the repo config', () => {
    const { reviewable } = filterFiles(files, ['src/**'])
    expect(reviewable.map((f) => f.path)).toEqual(['lib/b.ts'])
  })
})

describe('chunkFiles', () => {
  const { reviewable } = filterFiles(files)

  it('puts small changes in one chunk with line numbers the model can cite', () => {
    const { chunks, droppedChunks } = chunkFiles(reviewable, 30_000, 300_000)
    expect(chunks).toHaveLength(1)
    expect(droppedChunks).toBe(0)
    const text = chunks[0]!.text
    expect(text).toContain('### File: src/app.ts (modified)')
    expect(text).toContain('   11 +   const host = process.env.HOST')
    expect(text).toContain('   10     const port = 3000')
    // Removed lines are shown but carry no number.
    expect(text).toContain('      -   listen(port)')
    expect(chunks[0]!.paths).toEqual(['src/app.ts', 'src/new.ts', 'lib/b.ts'])
  })

  it('splits into several chunks when the size limit is small, without losing any line', () => {
    const { chunks } = chunkFiles(reviewable, 220, 1_000_000)
    expect(chunks.length).toBeGreaterThan(1)
    const all = chunks.map((c) => c.text).join('\n')
    for (const needle of ['const host', 'listen(port, host)', 'return true', 'export const c = 3', '+ new']) {
      expect(all).toContain(needle)
    }
    // A continued piece repeats the file header so the model knows where it is.
    expect(chunks.some((c) => c.text.includes('(continued)'))).toBe(true)
  })

  it('drops whole chunks beyond the total budget and reports how many', () => {
    const result = chunkFiles(reviewable, 220, 500)
    expect(result.chunks.length).toBeGreaterThanOrEqual(1)
    expect(result.droppedChunks).toBeGreaterThan(0)
    const total = chunkFiles(reviewable, 220, 1_000_000).chunks.length
    expect(result.chunks.length + result.droppedChunks).toBe(total)
  })

  it('always keeps at least one chunk even if it exceeds the budget', () => {
    const result = chunkFiles(reviewable, 30_000, 10)
    expect(result.chunks).toHaveLength(1)
  })

  it('truncates absurdly long lines', () => {
    const [file] = parseDiff(
      ['diff --git a/x.js b/x.js', '--- a/x.js', '+++ b/x.js', '@@ -1,1 +1,1 @@', `+${'x'.repeat(5000)}`, ''].join(
        '\n',
      ),
    )
    const { chunks } = chunkFiles([file!], 30_000, 300_000)
    expect(chunks[0]!.chars).toBeLessThan(1500)
  })
})
