import { useEffect, useState } from 'react'
import { UnauthorizedError } from './api'

export interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Runs `load` whenever `deps` change and reports loading, data and error. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[], onUnauthorized: () => void): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (e: unknown) => {
        if (cancelled) return
        if (e instanceof UnauthorizedError) onUnauthorized()
        setState({ data: null, error: e instanceof Error ? e.message : 'Something went wrong', loading: false })
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
