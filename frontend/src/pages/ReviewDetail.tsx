import { api, type ReviewComment } from '../api'
import { SeverityBadge, StatusBadge } from '../components/Badges'
import { compact, formatDuration, plainMarkdown, timeAgo } from '../format'
import { useApi } from '../useApi'

function groupByFile(comments: ReviewComment[]): [string, ReviewComment[]][] {
  const groups = new Map<string, ReviewComment[]>()
  for (const c of comments) groups.set(c.path, [...(groups.get(c.path) ?? []), c])
  return [...groups.entries()]
}

export function ReviewDetail({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const { data: r, error, loading } = useApi(() => api.review(id), [id], onUnauthorized)

  return (
    <>
      <a href="#/reviews" className="back">
        ← All reviews
      </a>
      {loading && !r && <p className="muted">Loading…</p>}
      {error && <p className="error">Could not load this review: {error}</p>}
      {r && (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{r.prTitle || `Pull request #${r.prNumber}`}</h2>
                <p className="muted">
                  <a href={r.prUrl} target="_blank" rel="noreferrer">
                    {r.owner}/{r.repo} #{r.prNumber}
                  </a>{' '}
                  · by {r.author} · commit <code>{r.headSha.slice(0, 7)}</code>
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <dl className="facts">
              <div>
                <dt>Started</dt>
                <dd>{timeAgo(r.startedAt)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(r.durationMs)}</dd>
              </div>
              <div>
                <dt>Files reviewed</dt>
                <dd>
                  {r.filesReviewed}
                  {r.filesSkipped > 0 && <span className="muted"> ({r.filesSkipped} skipped)</span>}
                </dd>
              </div>
              <div>
                <dt>Model calls</dt>
                <dd>{r.chunks}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>
                  {compact(r.inputTokens)} in · {compact(r.outputTokens)} out
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{r.model || '-'}</dd>
              </div>
            </dl>
            {r.error && <p className="callout critical">Failed: {r.error}</p>}
            {r.skipReason && <p className="callout neutral">Skipped: {r.skipReason}</p>}
          </div>

          {r.summary && (
            <div className="card">
              <h2>Summary posted on the pull request</h2>
              <pre className="summary">{plainMarkdown(r.summary)}</pre>
            </div>
          )}

          <div className="card">
            <h2>Comments ({r.comments.length})</h2>
            {r.comments.length === 0 && <p className="muted">No comments were posted for this commit.</p>}
            {groupByFile(r.comments).map(([path, comments]) => (
              <section key={path} className="file-group">
                <h3>{path}</h3>
                {comments.map((c, i) => (
                  <article key={`${c.line}-${i}`} className="comment">
                    <div className="comment-head">
                      <SeverityBadge severity={c.severity} />
                      <span className="muted">line {c.line}</span>
                    </div>
                    <p>{c.body}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
