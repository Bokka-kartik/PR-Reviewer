import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { authedApi, detail, emptyStats, mockApi, page, summary, stats, TOKEN } from './test/fixtures'

async function signIn(user: ReturnType<typeof userEvent.setup>, token = TOKEN) {
  await user.type(screen.getByPlaceholderText('Dashboard token'), token)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('sign-in', () => {
  it('asks for the token first and calls no data endpoint before that', () => {
    const { fake } = authedApi()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(fake).not.toHaveBeenCalled()
  })

  it('rejects a wrong token and stays on the sign-in screen', async () => {
    authedApi()
    const user = userEvent.setup()
    render(<App />)

    await signIn(user, 'wrong-token-value-123')
    expect(await screen.findByText('That token was not accepted.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('pr-reviewer.token')).toBeNull()
  })

  it('accepts the right token, remembers it for the tab, and shows the overview', async () => {
    const { calls } = authedApi()
    const user = userEvent.setup()
    render(<App />)

    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Reviews per day' })).toBeInTheDocument()
    expect(sessionStorage.getItem('pr-reviewer.token')).toBe(TOKEN)
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
  })

  it('skips the sign-in screen when the tab already has a token', async () => {
    sessionStorage.setItem('pr-reviewer.token', TOKEN)
    authedApi()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Reviews per day' })).toBeInTheDocument()
  })

  it('signs out, and signs out by itself if the server later rejects the token', async () => {
    sessionStorage.setItem('pr-reviewer.token', TOKEN)
    authedApi()
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Reviews per day' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(sessionStorage.getItem('pr-reviewer.token')).toBeNull()
    unmount()

    // A token that stops working (e.g. the server was reconfigured).
    sessionStorage.setItem('pr-reviewer.token', 'stale-token-1234567890')
    authedApi()
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(sessionStorage.getItem('pr-reviewer.token')).toBeNull()
  })
})

describe('overview', () => {
  const signedIn = () => sessionStorage.setItem('pr-reviewer.token', TOKEN)

  it('shows the headline numbers and breakdowns', async () => {
    signedIn()
    authedApi()
    render(<App />)

    const tiles = await screen.findByText('Comments posted')
    expect(tiles.closest('.tile')).toHaveTextContent('21')
    expect(screen.getByText('Average review time').closest('.tile')).toHaveTextContent('8.4 s')
    expect(screen.getByText('Model tokens').closest('.tile')).toHaveTextContent('56.5K')
    // Failed reviews get their own tile only when there are some.
    expect(screen.getByText('Failed reviews').closest('.tile')).toHaveTextContent('1')
    expect(screen.getByText('acme/widgets')).toBeInTheDocument()
    expect(screen.getByText('▲ Critical')).toBeInTheDocument()
  })

  it('hides the failed tile when nothing failed', async () => {
    signedIn()
    authedApi({ stats: { ...stats, totals: { ...stats.totals, failed: 0 } } })
    render(<App />)
    await screen.findByText('Comments posted')
    expect(screen.queryByText('Failed reviews')).not.toBeInTheDocument()
  })

  it('explains what to do when there are no reviews yet', async () => {
    signedIn()
    authedApi({ stats: emptyStats })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No reviews yet' })).toBeInTheDocument()
  })

  it('reports a load failure instead of showing a blank page', async () => {
    signedIn()
    mockApi(() => ({ status: 500, body: {} }))
    render(<App />)
    expect(await screen.findByText(/Could not load statistics/)).toBeInTheDocument()
  })
})

describe('reviews list', () => {
  const signedIn = () => {
    sessionStorage.setItem('pr-reviewer.token', TOKEN)
    window.location.hash = '#/reviews'
  }

  it('lists reviews with status, counts and a link to the detail page', async () => {
    signedIn()
    authedApi({
      reviews: () =>
        page([
          summary({ id: 'a', prTitle: 'Add host support', commentCount: 2 }),
          summary({
            id: 'b',
            prTitle: 'Fix cache race',
            status: 'skipped',
            skipReason: 'draft pull request',
            commentCount: 0,
          }),
        ]),
    })
    render(<App />)

    const link = await screen.findByRole('link', { name: 'Add host support' })
    expect(link).toHaveAttribute('href', '#/reviews/a')
    const row = link.closest('tr')!
    expect(within(row).getByText('Completed')).toBeInTheDocument()
    expect(within(row).getByText('acme/widgets #7 · kartik')).toBeInTheDocument()
    expect(within(row).getByText('12 s')).toBeInTheDocument()

    const skipped = screen.getByRole('link', { name: 'Fix cache race' }).closest('tr')!
    expect(within(skipped).getByText('draft pull request')).toBeInTheDocument()
  })

  it('sends filters to the API and returns to page 1', async () => {
    signedIn()
    const { calls } = authedApi({ reviews: () => page([summary()], { total: 40 }) })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('link', { name: 'Add host support' })

    // Go to page 2 first, then filter: the page must reset.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(calls.at(-1)!.search).toContain('page=2'))

    await user.selectOptions(screen.getByLabelText('Status'), 'failed')
    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/api/reviews').at(-1)!
      expect(last.search).toContain('status=failed')
      expect(last.search).toContain('page=1')
    })

    await user.selectOptions(screen.getByLabelText('Repository'), 'acme/billing')
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/reviews').at(-1)!.search).toContain('repo=acme%2Fbilling'),
    )
  })

  it('paginates and disables the buttons at either end', async () => {
    signedIn()
    authedApi({ reviews: (url) => page([summary()], { total: 40, page: Number(url.searchParams.get('page')) }) })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Page 1 of 3')

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 3 of 3')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('says so when no review matches', async () => {
    signedIn()
    authedApi({ reviews: () => page([]) })
    render(<App />)
    expect(await screen.findByText('No reviews match these filters.')).toBeInTheDocument()
  })
})

describe('review detail', () => {
  const open = (id = 'r1') => {
    sessionStorage.setItem('pr-reviewer.token', TOKEN)
    window.location.hash = `#/reviews/${id}`
  }

  it('shows the facts, the summary without Markdown symbols, and comments grouped by file', async () => {
    open()
    authedApi({ review: detail })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Add host support' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'acme/widgets #7' })).toHaveAttribute(
      'href',
      'https://github.com/acme/widgets/pull/7',
    )
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-5-5')).toBeInTheDocument()

    const summaryText = screen.getByText(/Reviewed 3 files and left 2 comments/)
    expect(summaryText.textContent).not.toContain('###')
    expect(summaryText.textContent).not.toContain('_Generated')

    expect(screen.getByRole('heading', { name: 'Comments (3)' })).toBeInTheDocument()
    const appFile = screen.getByRole('heading', { name: 'src/app.ts' }).closest('section')!
    expect(within(appFile).getAllByRole('article')).toHaveLength(2)
    expect(within(appFile).getByText('HOST may be undefined.')).toBeInTheDocument()
    expect(within(appFile).getByText('Critical')).toBeInTheDocument()
    const cacheFile = screen.getByRole('heading', { name: 'src/cache.ts' }).closest('section')!
    expect(within(cacheFile).getByText('line 3')).toBeInTheDocument()
  })

  it('explains failed and skipped reviews', async () => {
    open()
    authedApi({
      review: { ...detail, status: 'failed', error: 'every model call failed', comments: [], summary: undefined },
    })
    render(<App />)
    expect(await screen.findByText('Failed: every model call failed')).toBeInTheDocument()
    expect(screen.getByText('No comments were posted for this commit.')).toBeInTheDocument()
    expect(screen.queryByText('Summary posted on the pull request')).not.toBeInTheDocument()
  })

  it('shows a clear message for an unknown review', async () => {
    open('missing')
    authedApi()
    render(<App />)
    expect(await screen.findByText(/Could not load this review/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /All reviews/ })).toHaveAttribute('href', '#/reviews')
  })
})

describe('theme', () => {
  it('cycles system, light, dark and remembers the choice', async () => {
    sessionStorage.setItem('pr-reviewer.token', TOKEN)
    authedApi()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Reviews per day' })

    expect(document.documentElement).not.toHaveAttribute('data-theme')
    await user.click(screen.getByRole('button', { name: 'Theme: system' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(screen.getByRole('button', { name: 'Theme: light' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('pr-reviewer.theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Theme: dark' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})
