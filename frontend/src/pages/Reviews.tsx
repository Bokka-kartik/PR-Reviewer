import { useState } from 'react'
import { api } from '../api'
import { StatusBadge } from '../components/Badges'
import { formatDuration, timeAgo } from '../format'
import { useApi } from '../useApi'

const STATUS_OPTIONS = ['completed', 'skipped', 'failed', 'running']

export function Reviews({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [repo, setRepo] = useState('')

  const repos = useApi(api.stats, [], onUnauthorized)
  const { data, error, loading } = useApi(
    () => api.reviews({ page, status: status || undefined, repo: repo || undefined }),
    [page, status, repo],
    onUnauthorized,
  )

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const filterChanged = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <div className="card">
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={filterChanged(setStatus)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Repository
          <select value={repo} onChange={filterChanged(setRepo)}>
            <option value="">All</option>
            {repos.data?.byRepo.map((r) => (
              <option key={r.repo} value={r.repo}>
                {r.repo}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <span className="muted">
            {data.total} {data.total === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>

      {error && <p className="error">Could not load reviews: {error}</p>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && data.items.length === 0 && <p className="muted">No reviews match these filters.</p>}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="plain">
            <thead>
              <tr>
                <th>Pull request</th>
                <th>Status</th>
                <th className="num">Comments</th>
                <th className="num">Files</th>
                <th className="num">Time</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`#/reviews/${r.id}`} className="title-link">
                      {r.prTitle || `#${r.prNumber}`}
                    </a>
                    <div className="muted small">
                      {r.owner}/{r.repo} #{r.prNumber} · {r.author}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.skipReason && <div className="muted small">{r.skipReason}</div>}
                  </td>
                  <td className="num">{r.commentCount}</td>
                  <td className="num">{r.filesReviewed}</td>
                  <td className="num">{formatDuration(r.durationMs)}</td>
                  <td className="muted">{timeAgo(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
