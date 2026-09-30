import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarList, SeverityBadge, StatTile, StatusBadge } from './Badges'

describe('badges', () => {
  it('status is a word plus a symbol, never colour alone', () => {
    render(
      <>
        <StatusBadge status="completed" />
        <StatusBadge status="failed" />
        <StatusBadge status="skipped" />
        <StatusBadge status="running" />
      </>,
    )
    for (const [label, glyph] of [
      ['Completed', '✓'],
      ['Failed', '✕'],
      ['Skipped', '–'],
      ['Running', '…'],
    ] as const) {
      const badge = screen.getByText(label).closest('.badge')!
      expect(badge).toHaveTextContent(glyph)
    }
  })

  it('severity is a word plus a symbol', () => {
    render(
      <>
        <SeverityBadge severity="critical" />
        <SeverityBadge severity="warning" />
        <SeverityBadge severity="suggestion" />
      </>,
    )
    expect(screen.getByText('Critical').closest('.badge')).toHaveTextContent('▲')
    expect(screen.getByText('Warning').closest('.badge')).toHaveTextContent('◆')
    expect(screen.getByText('Suggestion').closest('.badge')).toHaveTextContent('●')
  })
})

describe('StatTile', () => {
  it('shows label, value and an optional hint', () => {
    const { rerender } = render(<StatTile label="Reviews" value="40" hint="28 completed" />)
    expect(screen.getByText('Reviews')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('28 completed')).toBeInTheDocument()

    rerender(<StatTile label="Reviews" value="40" />)
    expect(screen.queryByText('28 completed')).not.toBeInTheDocument()
  })
})

describe('BarList', () => {
  it('scales bars against the largest value', () => {
    const { container } = render(
      <BarList
        empty="none"
        rows={[
          { label: 'a', value: 10 },
          { label: 'b', value: 5, hint: 'reviews' },
        ]}
      />,
    )
    const fills = [...container.querySelectorAll<HTMLElement>('.barlist-fill')].map((f) => f.style.width)
    expect(fills).toEqual(['100%', '50%'])
    expect(screen.getByText('reviews')).toBeInTheDocument()
  })

  it('shows the empty message when there are no rows', () => {
    render(<BarList rows={[]} empty="No repositories yet." />)
    expect(screen.getByText('No repositories yet.')).toBeInTheDocument()
  })

  it('does not divide by zero when every value is zero', () => {
    const { container } = render(<BarList empty="x" rows={[{ label: 'a', value: 0 }]} />)
    expect(container.querySelector<HTMLElement>('.barlist-fill')!.style.width).toBe('0%')
  })
})
