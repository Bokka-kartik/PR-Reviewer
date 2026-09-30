import { useEffect, useRef, useState } from 'react'
import type { Stats } from '../api'
import { niceMax, shortDate, ticks } from '../format'

type Day = Stats['byDay'][number]

const HEIGHT = 220
const MARGIN = { top: 12, right: 8, bottom: 26, left: 34 }
const MAX_BAR = 24
const CORNER = 4

/** A column with a rounded top and a square base, so it sits flat on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(CORNER, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || 640)
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Reviews per day. One series, so no legend: the card title says what is plotted. */
export function DailyChart({ days }: { days: Day[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const peak = Math.max(0, ...days.map((d) => d.reviews))
  const max = niceMax(peak)
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const slot = innerW / Math.max(days.length, 1)
  const barW = Math.min(MAX_BAR, Math.max(slot - 6, 2))
  const y = (v: number) => MARGIN.top + innerH - (v / max) * innerH
  const labelEvery = slot < 44 ? 3 : slot < 64 ? 2 : 1
  const peakIndex = peak > 0 ? days.findIndex((d) => d.reviews === peak) : -1
  const total = days.reduce((sum, d) => sum + d.reviews, 0)

  const active = hover !== null ? days[hover] : undefined
  const tooltipLeft = hover !== null ? MARGIN.left + slot * hover + slot / 2 : 0

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Reviews per day</h2>
          <p className="muted">
            Last {days.length} days · {total} total
          </p>
        </div>
        <button type="button" className="link-btn" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <table className="plain">
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Reviews</th>
              <th className="num">Comments</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{shortDate(d.date)}</td>
                <td className="num">{d.reviews}</td>
                <td className="num">{d.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Bar chart of reviews per day, ${total} in total over ${days.length} days. A table view is available.`}
          >
            {ticks(max).map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'axis' : 'grid'}
                />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">
                  {t}
                </text>
              </g>
            ))}

            {days.map((d, i) => {
              const cx = MARGIN.left + slot * i + slot / 2
              const h = innerH - (y(d.reviews) - MARGIN.top)
              return (
                <g key={d.date}>
                  {d.reviews > 0 && (
                    <path
                      d={columnPath(cx - barW / 2, y(d.reviews), barW, h)}
                      className={hover === i ? 'bar bar-active' : 'bar'}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="tick">
                      {shortDate(d.date)}
                    </text>
                  )}
                  {i === peakIndex && (
                    <text x={cx} y={y(d.reviews) - 6} textAnchor="middle" className="value-label">
                      {d.reviews}
                    </text>
                  )}
                  {/* Full-height hit area, much larger than the bar itself. */}
                  <rect
                    x={MARGIN.left + slot * i}
                    y={MARGIN.top}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${shortDate(d.date)}: ${d.reviews} reviews, ${d.comments} comments`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="hit"
                  />
                </g>
              )
            })}
          </svg>

          {active && (
            <div className="tooltip" style={{ left: Math.min(Math.max(tooltipLeft, 70), width - 70) }} role="status">
              <strong>{shortDate(active.date)}</strong>
              <span>
                {active.reviews} {active.reviews === 1 ? 'review' : 'reviews'}
              </span>
              <span>
                {active.comments} {active.comments === 1 ? 'comment' : 'comments'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
