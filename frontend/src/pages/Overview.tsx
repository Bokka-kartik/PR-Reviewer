import { api } from '../api'
import { BarList, StatTile } from '../components/Badges'
import { DailyChart } from '../components/DailyChart'
import { compact, formatDuration } from '../format'
import { useApi } from '../useApi'

export function Overview({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data: stats, error, loading } = useApi(api.stats, [], onUnauthorized)

  if (loading && !stats) return <p className="muted">Loading…</p>
  if (error || !stats) return <p className="error">Could not load statistics: {error}</p>

  const { totals } = stats
  if (totals.reviews === 0) {
    return (
      <div className="card empty">
        <h2>No reviews yet</h2>
        <p className="muted">
          Open a pull request on a repository where the GitHub App is installed. Reviews appear here within a minute.
        </p>
      </div>
    )
  }

  const tokens = totals.inputTokens + totals.outputTokens
  return (
    <>
      <div className="tiles">
        <StatTile label="Reviews" value={compact(totals.reviews)} hint={`${totals.completed} completed`} />
        <StatTile
          label="Comments posted"
          value={compact(totals.commentsPosted)}
          hint={`across ${compact(totals.filesReviewed)} files`}
        />
        <StatTile label="Average review time" value={formatDuration(totals.avgDurationMs)} hint="completed reviews" />
        <StatTile
          label="Model tokens"
          value={compact(tokens)}
          hint={`${compact(totals.inputTokens)} in · ${compact(totals.outputTokens)} out`}
        />
        {totals.failed > 0 && (
          <StatTile label="Failed reviews" value={String(totals.failed)} hint="see the Reviews tab" />
        )}
      </div>

      <DailyChart days={stats.byDay} />

      <div className="grid-2">
        <div className="card">
          <h2>Comments by severity</h2>
          <BarList
            empty="No comments yet."
            rows={[
              { label: '▲ Critical', value: stats.bySeverity.critical },
              { label: '◆ Warning', value: stats.bySeverity.warning },
              { label: '● Suggestion', value: stats.bySeverity.suggestion },
            ]}
          />
        </div>
        <div className="card">
          <h2>Busiest repositories</h2>
          <BarList
            empty="No repositories yet."
            rows={stats.byRepo.map((r) => ({
              label: r.repo,
              value: r.reviews,
              hint: r.reviews === 1 ? 'review' : 'reviews',
            }))}
          />
        </div>
      </div>
    </>
  )
}
