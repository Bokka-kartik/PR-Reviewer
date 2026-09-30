import { describe, expect, it } from 'vitest'
import { compact, formatDuration, niceMax, plainMarkdown, shortDate, ticks, timeAgo } from './format'

describe('plainMarkdown', () => {
  it('removes heading, italic and bold markers but keeps other text intact', () => {
    expect(plainMarkdown('### Automated review\nLeft 2 comments.\n\n_May be wrong._')).toBe(
      'Automated review\nLeft 2 comments.\n\nMay be wrong.',
    )
    expect(plainMarkdown('**bold** and snake_case_name')).toBe('bold and snake_case_name')
  })
})

describe('compact', () => {
  it('formats numbers for stat tiles', () => {
    expect(compact(0)).toBe('0')
    expect(compact(1284)).toBe('1,284')
    expect(compact(12_900)).toBe('12.9K')
    expect(compact(10_000)).toBe('10K')
    expect(compact(123_456)).toBe('123K')
    expect(compact(4_200_000)).toBe('4.2M')
  })
})

describe('formatDuration', () => {
  it('picks a readable unit', () => {
    expect(formatDuration(undefined)).toBe('-')
    expect(formatDuration(420)).toBe('420 ms')
    expect(formatDuration(2_340)).toBe('2.3 s')
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(125_000)).toBe('2 min 5 s')
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-03-10T12:00:00Z')
  it('describes recent and old times', () => {
    expect(timeAgo('2026-03-10T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-03-10T11:15:00Z', now)).toBe('45 min ago')
    expect(timeAgo('2026-03-10T07:00:00Z', now)).toBe('5 h ago')
    expect(timeAgo('2026-03-07T12:00:00Z', now)).toBe('3 d ago')
    expect(timeAgo('2025-01-02T12:00:00Z', now)).toMatch(/2025/)
  })
})

describe('chart scale', () => {
  it('rounds the maximum up to a clean number with a sensible minimum', () => {
    expect(niceMax(0)).toBe(4)
    expect(niceMax(3)).toBe(4)
    expect(niceMax(5)).toBe(5)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(13)).toBe(20)
    expect(niceMax(41)).toBe(50)
    expect(niceMax(730)).toBe(1000)
  })

  it('builds evenly spaced ticks from zero to the maximum', () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20])
    expect(ticks(4, 2)).toEqual([0, 2, 4])
  })

  it('formats day labels without timezone drift', () => {
    expect(shortDate('2026-03-10')).toBe('Mar 10')
    expect(shortDate('2026-01-01')).toBe('Jan 1')
  })
})
