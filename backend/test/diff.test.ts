import { describe, expect, it } from 'vitest'
import { commentableLines, parseDiff } from '../src/review/diff.js'
import { APP_TS_LINES, SAMPLE_DIFF } from './fixtures/diffs.js'

describe('parseDiff', () => {
  const files = parseDiff(SAMPLE_DIFF)
  const byPath = (p: string) => files.find((f) => f.path === p)!

  it('finds every file with the right path and status', () => {
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['src/app.ts', 'modified'],
      ['src/new.ts', 'added'],
      ['old.txt', 'deleted'],
      ['lib/b.ts', 'renamed'],
      ['logo.png', 'added'],
      ['package-lock.json', 'modified'],
    ])
  })

  it('numbers added and context lines by their position in the new file', () => {
    const lines = byPath('src/app.ts').hunks[0]!.lines
    expect(lines.map((l) => [l.type, l.newLine])).toEqual([
      ['ctx', 10],
      ['del', undefined],
      ['add', 11],
      ['add', 12],
      ['ctx', 13],
      ['add', 14],
      ['ctx', 15],
    ])
    expect(lines[2]!.text).toBe('  const host = process.env.HOST')
  })

  it('allows comments on added and context lines only', () => {
    expect([...commentableLines(byPath('src/app.ts'))].sort((a, b) => a - b)).toEqual(APP_TS_LINES)
  })

  it('handles files created from scratch', () => {
    const lines = byPath('src/new.ts').hunks[0]!.lines
    expect(lines.map((l) => l.newLine)).toEqual([1, 2, 3])
  })

  it('reads the new path of a renamed file and keeps its edits', () => {
    const renamed = byPath('lib/b.ts')
    expect(renamed.hunks[0]!.lines.map((l) => [l.type, l.newLine])).toEqual([
      ['ctx', 1],
      ['del', undefined],
      ['add', 2],
    ])
  })

  it('flags binary files and keeps deleted files without commentable lines', () => {
    expect(byPath('logo.png').binary).toBe(true)
    expect(commentableLines(byPath('old.txt')).size).toBe(0)
  })

  it('tracks line numbers across several hunks', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,2 @@',
      ' a',
      '-b',
      '+B',
      '@@ -20,2 +20,3 @@',
      ' t',
      '+u',
      ' v',
      '',
    ].join('\n')
    const [file] = parseDiff(diff)
    expect([...commentableLines(file!)].sort((a, b) => a - b)).toEqual([1, 2, 20, 21, 22])
  })

  it('ignores the "no newline" marker and does not count it as a line', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' a',
      '+b',
      '\\ No newline at end of file',
      '',
    ].join('\n')
    const [file] = parseDiff(diff)
    expect(file!.hunks[0]!.lines).toHaveLength(2)
  })

  it('treats an empty line inside a hunk as a context line whose space was stripped', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,3 +1,4 @@',
      ' a',
      '',
      '+b',
      ' c',
      '',
    ].join('\n')
    const [file] = parseDiff(diff)
    expect(file!.hunks[0]!.lines.map((l) => [l.type, l.newLine])).toEqual([
      ['ctx', 1],
      ['ctx', 2],
      ['add', 3],
      ['ctx', 4],
    ])
  })

  it('does not mistake a removed line that looks like a header for a new file', () => {
    const diff = [
      'diff --git a/x.md b/x.md',
      '--- a/x.md',
      '+++ b/x.md',
      '@@ -1,2 +1,1 @@',
      '--- a/not-a-file',
      ' keep',
      '',
    ].join('\n')
    const files = parseDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe('x.md')
  })

  it('returns nothing for empty input', () => {
    expect(parseDiff('')).toEqual([])
  })
})
