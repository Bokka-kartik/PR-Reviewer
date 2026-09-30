import { describe, expect, it } from 'vitest'
import { parseDiff } from '../src/review/diff.js'
import { DEFAULT_REPO_CONFIG, parseRepoConfig } from '../src/review/repoConfig.js'
import { fingerprint, validateComments } from '../src/review/validate.js'
import { SAMPLE_DIFF } from './fixtures/diffs.js'

const files = parseDiff(SAMPLE_DIFF)
const config = { ...DEFAULT_REPO_CONFIG }
const none = new Set<string>()

const comment = (over: Record<string, unknown> = {}) => ({
  path: 'src/app.ts',
  line: 12,
  severity: 'warning',
  body: 'HOST may be undefined here.',
  ...over,
})

describe('validateComments', () => {
  it('accepts a well-formed comment on a changed line', () => {
    const { comments, dropped } = validateComments([comment()], files, config, none)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.fingerprint).toBe(fingerprint('src/app.ts', 'HOST may be undefined here.'))
    expect(dropped).toEqual({ invalid: 0, offDiff: 0, duplicate: 0, belowSeverity: 0, overLimit: 0 })
  })

  it('drops comments GitHub would reject: unknown file, line outside the diff, removed line', () => {
    const { comments, dropped } = validateComments(
      [comment({ path: 'nope.ts' }), comment({ line: 99 }), comment({ line: 0 })],
      files,
      config,
      none,
    )
    expect(comments).toHaveLength(0)
    expect(dropped.offDiff + dropped.invalid).toBe(3)
  })

  it('drops malformed model output instead of crashing', () => {
    const { comments, dropped } = validateComments(
      [null, 'text', {}, comment({ severity: 'blocker' }), comment({ body: '   ' }), comment({ line: '12' })],
      files,
      config,
      none,
    )
    expect(comments).toHaveLength(0)
    expect(dropped.invalid).toBe(6)
  })

  it('removes duplicates within one review and against earlier reviews', () => {
    const first = validateComments([comment(), comment({ line: 13 })], files, config, none)
    expect(first.comments).toHaveLength(1)
    expect(first.dropped.duplicate).toBe(1)

    const earlier = new Set([fingerprint('src/app.ts', 'HOST may be undefined here.')])
    const second = validateComments([comment({ line: 14 })], files, config, earlier)
    expect(second.comments).toHaveLength(0)
    expect(second.dropped.duplicate).toBe(1)
  })

  it('treats a reworded-only-by-whitespace-or-case comment as the same', () => {
    expect(fingerprint('a.ts', 'Null  pointer\nhere')).toBe(fingerprint('a.ts', 'null pointer here'))
    expect(fingerprint('a.ts', 'x')).not.toBe(fingerprint('b.ts', 'x'))
  })

  it('filters by minimum severity', () => {
    const { comments, dropped } = validateComments(
      [comment({ severity: 'suggestion' }), comment({ line: 13, body: 'b', severity: 'warning' })],
      files,
      { ...config, minSeverity: 'warning' },
      none,
    )
    expect(comments).toHaveLength(1)
    expect(dropped.belowSeverity).toBe(1)
  })

  it('keeps the most severe comments when over the limit', () => {
    const raw = [
      comment({ line: 10, body: 'a', severity: 'suggestion' }),
      comment({ line: 11, body: 'b', severity: 'critical' }),
      comment({ line: 12, body: 'c', severity: 'warning' }),
    ]
    const { comments, dropped } = validateComments(raw, files, { ...config, maxComments: 2 }, none)
    expect(comments.map((c) => c.severity)).toEqual(['critical', 'warning'])
    expect(dropped.overLimit).toBe(1)
  })
})

describe('parseRepoConfig', () => {
  it('uses defaults when the file is missing or empty', () => {
    expect(parseRepoConfig(null)).toEqual({ config: DEFAULT_REPO_CONFIG })
    expect(parseRepoConfig('  \n')).toEqual({ config: DEFAULT_REPO_CONFIG })
  })

  it('reads a valid file and fills the rest with defaults', () => {
    const { config, warning } = parseRepoConfig(
      ['ignore:', '  - "docs/**"', 'focus: [security, error handling]', 'minSeverity: warning', 'maxComments: 5'].join(
        '\n',
      ),
    )
    expect(warning).toBeUndefined()
    expect(config.ignore).toEqual(['docs/**'])
    expect(config.focus).toEqual(['security', 'error handling'])
    expect(config.minSeverity).toBe('warning')
    expect(config.maxComments).toBe(5)
    expect(config.enabled).toBe(true)
    expect(config.reviewDrafts).toBe(false)
  })

  it('falls back to defaults with a warning on bad YAML', () => {
    const { config, warning } = parseRepoConfig('ignore: [unclosed')
    expect(config).toEqual(DEFAULT_REPO_CONFIG)
    expect(warning).toMatch(/not valid YAML/)
  })

  it('falls back to defaults with a warning on invalid values', () => {
    const { config, warning } = parseRepoConfig('maxComments: 500')
    expect(config).toEqual(DEFAULT_REPO_CONFIG)
    expect(warning).toMatch(/maxComments/)
  })
})
