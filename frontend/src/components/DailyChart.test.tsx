import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { stats } from '../test/fixtures'
import { DailyChart } from './DailyChart'

describe('DailyChart', () => {
  it('draws one bar per day that has reviews, and labels only the peak', () => {
    const { container } = render(<DailyChart days={stats.byDay} />)

    expect(screen.getByRole('heading', { name: 'Reviews per day' })).toBeInTheDocument()
    expect(screen.getByText(/Last 3 days · 12 total/)).toBeInTheDocument()
    // The day with zero reviews has no bar.
    expect(container.querySelectorAll('path.bar')).toHaveLength(2)
    // Only the peak value is written on the chart itself.
    const valueLabels = container.querySelectorAll('.value-label')
    expect(valueLabels).toHaveLength(1)
    expect(valueLabels[0]).toHaveTextContent('9')
  })

  it('describes the chart for screen readers', () => {
    render(<DailyChart days={stats.byDay} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/12 in total over 3 days/)
  })

  it("shows a tooltip with that day's numbers on hover, and hides it again", () => {
    render(<DailyChart days={stats.byDay} />)

    const day = screen.getByLabelText('Mar 10: 9 reviews, 17 comments')
    fireEvent.mouseEnter(day)
    const tooltip = screen.getByRole('status')
    expect(within(tooltip).getByText('Mar 10')).toBeInTheDocument()
    expect(within(tooltip).getByText('9 reviews')).toBeInTheDocument()
    expect(within(tooltip).getByText('17 comments')).toBeInTheDocument()

    fireEvent.mouseLeave(day.closest('.chart')!)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('uses singular words for a count of one', () => {
    render(<DailyChart days={[{ date: '2026-03-10', reviews: 1, comments: 1 }]} />)
    fireEvent.mouseEnter(screen.getByLabelText('Mar 10: 1 reviews, 1 comments'))
    expect(screen.getByText('1 review')).toBeInTheDocument()
    expect(screen.getByText('1 comment')).toBeInTheDocument()
  })

  it('offers the same data as a table, and switches back', async () => {
    const user = userEvent.setup()
    render(<DailyChart days={stats.byDay} />)

    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(4) // header + 3 days
    expect(within(table).getByRole('row', { name: /Mar 10\s+9\s+17/ })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show chart' }))
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('renders an empty period without crashing', () => {
    const quiet = stats.byDay.map((d) => ({ ...d, reviews: 0, comments: 0 }))
    const { container } = render(<DailyChart days={quiet} />)
    expect(container.querySelectorAll('path.bar')).toHaveLength(0)
    expect(container.querySelectorAll('.value-label')).toHaveLength(0)
  })
})
