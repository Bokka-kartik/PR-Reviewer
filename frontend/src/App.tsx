import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'
import { Overview } from './pages/Overview'
import { ReviewDetail } from './pages/ReviewDetail'
import { Reviews } from './pages/Reviews'

type Route = { name: 'overview' } | { name: 'reviews' } | { name: 'detail'; id: string }

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const detail = /^\/reviews\/([^/]+)$/.exec(path)
  if (detail) return { name: 'detail', id: decodeURIComponent(detail[1]!) }
  if (path === '/reviews') return { name: 'reviews' }
  return { name: 'overview' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'pr-reviewer.theme'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Not persisted; fine.
    }
  }, [theme])
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  return [theme, () => setTheme(next[theme])]
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.checkToken(value.trim())
      setToken(value.trim())
      onSuccess()
    } catch {
      setError('That token was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>PR Reviewer</h1>
        <p className="muted">Enter the dashboard token (the DASHBOARD_TOKEN value from the server settings).</p>
        <input type="password" placeholder="Dashboard token" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        <button disabled={busy || !value.trim()}>{busy ? 'Checking…' : 'Sign in'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => getToken() !== null)
  const route = useRoute()
  const [theme, cycleTheme] = useTheme()

  const logout = useCallback(() => {
    setToken(null)
    setAuthed(false)
  }, [])

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <strong className="brand">PR Reviewer</strong>
          <nav>
            <a href="#/" aria-current={route.name === 'overview' ? 'page' : undefined}>
              Overview
            </a>
            <a href="#/reviews" aria-current={route.name !== 'overview' ? 'page' : undefined}>
              Reviews
            </a>
          </nav>
          <span className="spacer" />
          <button type="button" className="link-btn" onClick={cycleTheme} title="Change theme">
            Theme: {theme}
          </button>
          <button type="button" className="link-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        {route.name === 'overview' && <Overview onUnauthorized={logout} />}
        {route.name === 'reviews' && <Reviews onUnauthorized={logout} />}
        {route.name === 'detail' && <ReviewDetail id={route.id} onUnauthorized={logout} />}
      </main>
    </>
  )
}
