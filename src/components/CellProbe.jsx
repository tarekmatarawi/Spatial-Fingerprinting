import { zoneColour } from '@/lib/zones'

// The readout for one inspected cell, and the two layers that mark it on a plan.
//
// Kept in one file because the three must agree about what is being pointed at:
// a marker on the plan that drifted from the panel beside it would be worse
// than having neither, and the commonest way that happens is the two being
// written in different places against different props.

// ---------------------------------------------------------------- plan layers

// Where the probed cell is, drawn as a crosshair rather than a filled dot so
// the cell's own zone colour underneath stays readable — the reader is usually
// comparing the number in the panel against the colour on the map, and a marker
// that hides the colour defeats the comparison.
export function ProbeMarker({ cell, k = 1 }) {
  if (!cell) return null
  const r = 2.2 * k
  const arm = 4.5 * k
  return (
    <g className="stroke-redline" strokeWidth={0.7 * k} fill="none">
      <circle cx={cell.x} cy={-cell.y} r={r} />
      <line x1={cell.x - arm} y1={-cell.y} x2={cell.x - r * 1.6} y2={-cell.y} />
      <line x1={cell.x + r * 1.6} y1={-cell.y} x2={cell.x + arm} y2={-cell.y} />
      <line x1={cell.x} y1={-cell.y - arm} x2={cell.x} y2={-cell.y - r * 1.6} />
      <line x1={cell.x} y1={-cell.y + r * 1.6} x2={cell.x} y2={-cell.y + arm} />
    </g>
  )
}

// What can actually be seen from that cell.
//
// This is the layer that turns the panel from a table into an explanation. Every
// metric beside it is a property of THIS shape — area is its area, compactness
// its perimeter against that area, occlusivity the part of its edge that runs
// along continuous building. A reader who cannot see the shape has to take all
// four on trust.
//
// Rays that ended on a building are drawn solid and rays that ran to the 200 m
// limit are drawn faint, because "the view stops here because of a wall" and
// "the view stops here because we stopped looking" are different statements and
// one closed polygon cannot make both.
export function IsovistOutline({ isovist, k = 1 }) {
  if (!isovist?.outline?.length) return null
  const pts = isovist.outline

  const segments = []
  let run = null
  for (let i = 0; i < pts.length; i++) {
    const solid = isovist.wall[i] && isovist.wall[(i + 1) % pts.length]
    if (!run || run.solid !== solid) {
      run = { solid, pts: [pts[i]] }
      segments.push(run)
    }
    run.pts.push(pts[(i + 1) % pts.length])
  }

  return (
    <g pointerEvents="none">
      <polygon
        points={pts.map((p) => `${p.x},${-p.y}`).join(' ')}
        className="fill-primary"
        opacity="0.1"
      />
      {segments.map((s, i) => (
        <polyline
          key={i}
          points={s.pts.map((p) => `${p.x},${-p.y}`).join(' ')}
          fill="none"
          className="stroke-primary"
          strokeWidth={(s.solid ? 0.7 : 0.4) * k}
          opacity={s.solid ? 0.85 : 0.3}
          strokeDasharray={s.solid ? undefined : `${1.5 * k} ${1.5 * k}`}
        />
      ))}
    </g>
  )
}

// ------------------------------------------------------------------- the panel

export function CellProbePanel({ reading, before, onClear }) {
  if (!reading) return null

  const pct = (v) => `${(v * 100).toFixed(0)}%`
  const fmt = (m) =>
    m.raw == null
      ? '—'
      : `${m.raw.toLocaleString(undefined, {
          minimumFractionDigits: m.decimals,
          maximumFractionDigits: m.decimals,
        })}${m.unit}`

  // The change at THIS cell, when the page has a before to compare against.
  const delta = (m, i) => {
    if (!before) return null
    const b = before.metrics[i]
    if (b?.raw == null || m.raw == null || b.raw === 0) return null
    const d = ((m.raw - b.raw) / Math.abs(b.raw)) * 100
    return Math.abs(d) < 0.05 ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`
  }

  return (
    <div className="mt-4 rounded-lg border border-redline/40 bg-paper p-4">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-redline">
            Inspected cell
          </p>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            {reading.x.toFixed(1)}, {reading.y.toFixed(1)} m
          </p>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 font-mono text-[11px] text-ink-muted transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          clear
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: zoneColour(reading.zone) }}
        />
        <p className="text-sm text-ink">
          <span className="font-medium">{reading.zoneName}</span>
          {before && before.zone !== reading.zone && (
            <span className="text-ink-muted"> — was {before.zoneName}</span>
          )}
        </p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {reading.distance.toFixed(3)} from that type&rsquo;s centre in the weighted space
        {before && (
          <>
            {' '}
            (was {before.distance.toFixed(3)})
          </>
        )}
      </p>

      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            <th className="pb-1 font-normal">metric</th>
            <th className="pb-1 text-right font-normal">measured</th>
            <th className="pb-1 text-right font-normal">0–1</th>
            {before && <th className="pb-1 text-right font-normal">change</th>}
            <th className="pb-1 text-right font-normal" title="share of this cell's distance from its own type's centre">
              drives
            </th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {reading.metrics.map((m, i) => (
            <tr key={m.key} className="border-b border-line/60 last:border-0">
              <td className="py-1 font-sans text-ink-muted">{m.label}</td>
              <td className="py-1 text-right text-ink">{fmt(m)}</td>
              <td className="py-1 text-right text-ink-muted">{m.n?.toFixed(3) ?? '—'}</td>
              {before && (
                <td className="py-1 text-right text-ink">{delta(m, i) ?? '—'}</td>
              )}
              <td className="py-1 text-right text-ink-faint">
                {m.share == null ? '—' : pct(m.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {reading.p9.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-[11px]">
          {reading.p9.map((f) => (
            <div key={f.label} className="flex items-baseline gap-1.5">
              <dt className={f.muted ? 'text-ink-faint' : 'text-ink-muted'}>{f.label}</dt>
              <dd className={`font-mono tabular-nums ${f.muted ? 'text-ink-faint' : 'text-ink'}`}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-faint">
        These are the stored values for this cell, not a fresh measurement — the same numbers the
        map above is coloured from. <span className="text-ink-muted">Drives</span> is the share of
        this cell&rsquo;s distance from its own type&rsquo;s centre that each metric accounts for,
        which is what decides the type when two are close.
      </p>
    </div>
  )
}
