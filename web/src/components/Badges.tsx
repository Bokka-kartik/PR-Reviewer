import type { Severity, Status } from '../api'

// Status and severity always pair a color with a glyph and a word, never color alone.
const STATUS: Record<Status, { glyph: string; label: string; className: string }> = {
  completed: { glyph: '✓', label: 'Completed', className: 'good' },
  failed: { glyph: '✕', label: 'Failed', className: 'critical' },
  skipped: { glyph: '–', label: 'Skipped', className: 'neutral' },
  running: { glyph: '…', label: 'Running', className: 'info' },
}

const SEVERITY: Record<Severity, { glyph: string; label: string; className: string }> = {
  critical: { glyph: '▲', label: 'Critical', className: 'critical' },
  warning: { glyph: '◆', label: 'Warning', className: 'warning' },
  suggestion: { glyph: '●', label: 'Suggestion', className: 'neutral' },
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <span className={`badge ${s.className}`}>
      <span aria-hidden="true">{s.glyph}</span> {s.label}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity]
  return (
    <span className={`badge ${s.className}`}>
      <span aria-hidden="true">{s.glyph}</span> {s.label}
    </span>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {hint && <span className="tile-hint">{hint}</span>}
    </div>
  )
}

export function BarList({ rows, empty }: { rows: { label: string; value: number; hint?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="muted">{empty}</p>
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="barlist-label" title={r.label}>
            {r.label}
          </span>
          <span className="barlist-track">
            <span className="barlist-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="barlist-value">
            {r.value}
            {r.hint && <span className="muted"> {r.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
