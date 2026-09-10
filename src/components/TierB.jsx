import { LuInfo } from 'react-icons/lu'

import { FAINT, INK, MONO, MUTED, RULE, TYPE } from '@/components/charts/tokens'
import { ZONE_COLOURS } from '@/lib/zones'

// P9 Tier B's panels and figures.
//
// Split out of DiagnosePage because the page had grown past the point where the
// diagnosis and the sandbox could be read in one sitting. Everything here is
// presentation: it is handed a finished recompute and a finished diff and draws
// them. No measurement, no assignment, no distance — those belong to
// lib/sandbox.js and lib/zones.js, where they are tested.

// Before / after / only-what-changed, flipped in place rather than shown side
// by side. Two plans next to each other make the reader's eye travel to compare
// a patch of colour with the same patch 400 px away; flipping the same drawing
// puts the difference where change blindness cannot hide it.
export function ViewToggle({ value, onChange, disabled, changedCount }) {
  const options = [
    { id: 'before', label: 'as built' },
    { id: 'after', label: 'with intervention' },
    { id: 'changed', label: `changed (${changedCount})` },
  ]
  return (
    <span className="inline-flex overflow-hidden rounded border border-line">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`px-2 py-0.5 transition-colors duration-150 disabled:opacity-40 ${
            value === o.id && !disabled ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

// Freehand drawing: a height, and the controls for placing corners.
//
// IT NO LONGER LISTS WHAT IS IN THE SANDBOX. It used to, and it read
// `m.footprint.length` off every element to do it — which is true of a
// freehand mass and of nothing else. Once the library and the recess tool
// existed, opening this panel with a preset placed crashed the page on an
// undefined footprint, and kept crashing after a reload because the presets
// were restored from storage. The sandbox contents belong to ElementList,
// which knows about every kind; this panel is about drawing one.
export function MassPanel({
  drawing,
  massHeight,
  computing,
  sandbox,
  onHeightChange,
  onStartDrawing,
  onCancelDrawing,
  onUndoVertex,
  onFinish,
  error,
}) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-4">
      <div className="border-b border-line pb-2">
        <h3 className="text-sm font-semibold text-ink">Draw a mass by hand</h3>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 text-xs text-ink">
        <span>Height</span>
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={3}
            max={60}
            step={1}
            value={massHeight}
            onChange={(e) => onHeightChange(Number(e.target.value))}
            className="w-28"
            style={{ accentColor: 'var(--color-redline)' }}
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums">{massHeight} m</span>
        </span>
      </label>
      {/* Enclosure is an ANGLE, so a height only means something against the
          heights already around it. Naming the eaves line turns the slider from
          a number into a judgement a designer can make. */}
      <p className="mt-1 font-mono text-[10px] text-ink-faint">
        {massHeight < 12
          ? 'below the surrounding eaves line'
          : massHeight < 25
            ? 'about the height of the surrounding blocks'
            : 'above the surrounding blocks'}
      </p>

      {!drawing ? (
        <button
          type="button"
          onClick={onStartDrawing}
          className="mt-3 w-full rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-bg transition-colors duration-150 hover:bg-primary-deep outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          Draw a mass
        </button>
      ) : (
        <div className="mt-3 rounded-md border border-redline/40 bg-redline-wash p-2.5">
          <p className="font-mono text-[11px] text-ink">
            {drawing.vertices.length} corner{drawing.vertices.length === 1 ? '' : 's'} placed
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-muted">
            Click the plan to place each corner. Three or more closes a footprint.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onFinish}
              disabled={drawing.vertices.length < 3}
              className="rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] text-bg disabled:opacity-30"
            >
              build it
            </button>
            <button
              type="button"
              onClick={onUndoVertex}
              disabled={!drawing.vertices.length}
              className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[11px] text-ink-muted disabled:opacity-30"
            >
              undo corner
            </button>
            <button
              type="button"
              onClick={onCancelDrawing}
              className="rounded-full px-2.5 py-1 font-mono text-[11px] text-ink-faint hover:text-ink"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] leading-snug text-redline">{error}</p>}

      {computing && (
        <p className="mt-3 font-mono text-[11px] text-primary">
          <span className="animate-pulse">measuring every sampled point at 360°…</span>
        </p>
      )}

      {sandbox && !computing && (
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">points re-measured</dt>
            <dd className="tabular-nums text-ink">{sandbox.result.pointCount}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">changed type</dt>
            <dd className="tabular-nums text-ink">{sandbox.diff.changedCount}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-faint">built over</dt>
            <dd className="tabular-nums text-ink">{sandbox.diff.droppedCount}</dd>
          </div>
        </dl>
      )}

    </div>
  )
}

// The composition before and after, as paired bars.
//
// Paired rather than stacked: a stacked bar shows the shares adding to 100% but
// makes the CHANGE in any one share something the reader has to estimate from
// two differently-offset segments. The question here is how far each type
// moved, so each type gets its own baseline and the two states share it.
export function CompositionDelta({ diff, zoneNames }) {
  const W = 900
  const ROW_H = 46
  const TOP = 26
  const H = TOP + zoneNames.length * ROW_H + 34
  const LABEL_W = 200
  const BAR_X = LABEL_W + 16
  const BAR_MAX = 420

  // Scaled to the largest share present rather than to 100%, so the smaller
  // types are still readable — a zone at 3% would be an invisible sliver on a
  // full-range axis, and its change is exactly what an intervention moves.
  const peak = Math.max(...diff.beforeShares, ...diff.afterShares, 0.05)
  const scale = BAR_MAX / peak

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <text x={BAR_X} y={14} {...TYPE.annotation}>
        share of the plaza&rsquo;s sampled points
      </text>
      <text x={W} y={14} {...TYPE.annotation} textAnchor="end">
        change
      </text>

      {zoneNames.map((name, i) => {
        const y = TOP + i * ROW_H
        const before = diff.beforeShares[i]
        const after = diff.afterShares[i]
        const delta = after - before
        const colour = ZONE_COLOURS[i % ZONE_COLOURS.length]

        return (
          <g key={i}>
            {i > 0 && <line x1={0} y1={y - 6} x2={W} y2={y - 6} stroke={RULE} strokeWidth={0.75} />}
            <rect x={0} y={y + 8} width={9} height={9} fill={colour} rx={1.5} />
            <text x={16} y={y + 16} {...TYPE.axisTitle}>
              {name}
            </text>

            {/* as built — hollow, because it is the reference the other is read against */}
            <rect
              x={BAR_X}
              y={y + 2}
              width={Math.max(0.5, before * scale)}
              height={12}
              fill="none"
              stroke={colour}
              strokeWidth={1}
            />
            <text
              x={BAR_X + before * scale + 6}
              y={y + 12}
              fontSize={9}
              fontFamily={MONO}
              fill={FAINT}
            >
              {(before * 100).toFixed(1)}%
            </text>

            {/* with the intervention — solid */}
            <rect
              x={BAR_X}
              y={y + 17}
              width={Math.max(0.5, after * scale)}
              height={12}
              fill={colour}
              opacity={0.9}
            />
            <text
              x={BAR_X + after * scale + 6}
              y={y + 27}
              fontSize={9}
              fontFamily={MONO}
              fill={MUTED}
            >
              {(after * 100).toFixed(1)}%
            </text>

            <text
              x={W}
              y={y + 20}
              fontSize={11.5}
              fontFamily={MONO}
              fill={Math.abs(delta) < 0.005 ? FAINT : INK}
              textAnchor="end"
            >
              {delta >= 0 ? '+' : '−'}
              {Math.abs(delta * 100).toFixed(1)} pp
            </text>
          </g>
        )
      })}

      <text x={BAR_X} y={H - 12} {...TYPE.annotation}>
        hollow bar = as built · solid bar = with the intervention
      </text>
    </svg>
  )
}

// Did the intervention actually close the gap the diagnosis named?
//
// The question the whole phase exists to answer, so it gets its own panel
// rather than being left for a reader to work out by comparing two figures in
// different sections.
export function SandboxDiagnosisCompare({ before, after, zoneNames, targetZone }) {
  const closed = before.distance - after.distance
  const gained = after.onTargetShare - before.onTargetShare
  const helped = closed > 0.001

  return (
    <div className="mt-8 rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Did it close the gap at your selected area?</h3>
      <p className="mt-1 text-sm text-ink-muted">
        The same selection, re-diagnosed against{' '}
        <span className="text-ink">{zoneNames[targetZone]}</span> with the intervention standing.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-paper p-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            weighted distance
          </p>
          <p className="mt-1 font-mono text-base tabular-nums text-ink">
            {before.distance.toFixed(3)} → {after.distance.toFixed(3)}
          </p>
          <p className={`mt-0.5 font-mono text-[11px] ${helped ? 'text-ok' : 'text-redline'}`}>
            {closed >= 0 ? '−' : '+'}
            {Math.abs(closed).toFixed(3)} {helped ? 'closer' : 'further away'}
          </p>
        </div>

        <div className="rounded-md border border-line bg-paper p-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            points on target
          </p>
          <p className="mt-1 font-mono text-base tabular-nums text-ink">
            {before.onTarget} → {after.onTarget}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
            {(before.onTargetShare * 100).toFixed(0)}% → {(after.onTargetShare * 100).toFixed(0)}%
            {gained !== 0 && (
              <span className={gained > 0 ? ' text-ok' : ' text-redline'}>
                {' '}
                ({gained > 0 ? '+' : '−'}
                {Math.abs(gained * 100).toFixed(0)} pp)
              </span>
            )}
          </p>
        </div>

        <div className="rounded-md border border-line bg-paper p-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            driving dimension
          </p>
          <p className="mt-1 text-sm text-ink">{after.driving[0].label}</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
            was {before.driving[0].label}
            {before.driving[0].metric === after.driving[0].metric ? ' — unchanged' : ''}
          </p>
        </div>
      </div>

      {after.swallowed > 0 && (
        <p className="mt-3 flex gap-1.5 text-[11px] leading-snug text-warn">
          <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          {after.swallowed} of the selected points are now inside the intervention and have left the
          sample. The comparison above is over the {after.n} that remain standable, so an apparent
          improvement may partly be the disappearance of the worst positions rather than the
          improvement of them.
        </p>
      )}
    </div>
  )
}

// What the intervention did to the four numbers, at the selected area.
//
// ADDED 2026-09-10, after a real failure of the page rather than of the engine.
// A colonnade raises enclosure sharply nearby — measured at Konstablerwache,
// +19% within 5 m at only 3 m of column height, every point in the band rising
// — and there was NOWHERE ON THIS PAGE THAT SAID SO. The metric decomposition
// figure above reads from P6's stored field, so it shows the plaza as surveyed
// and never moves when something is drawn; the sandbox comparison beside this
// reports one weighted distance and the name of the driving dimension, but not
// a single metric value. Someone testing colonnades from 3 m to 8 m could
// therefore watch the correct answer being computed and thrown away, and
// reasonably conclude the tool was broken.
//
// So this shows the plain thing: each metric, as built, with the intervention,
// and the change. Raw units, because a designer checks a number against a
// drawing, not against a 0–1 scale.
//
// IT DOES NOT NEED AN INTENDED ZONE TYPE. "What did this do to enclosure here"
// is a question about geometry and has an answer whether or not an intention
// has been stated — gating it behind the zone picker, as the comparison beside
// it is gated, is part of what made the answer unreachable.
export function MetricEffect({ effect }) {
  if (!effect) return null

  return (
    <div className="mt-8 rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">
        What it did to the numbers at your selected area
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        The {effect.n} selected point{effect.n === 1 ? '' : 's'} measured again with the
        intervention standing, in the units each metric is measured in.
        {effect.swallowed > 0 && (
          <>
            {' '}
            <span className="text-warn">
              {effect.swallowed} more {effect.swallowed === 1 ? 'point is' : 'points are'} now
              inside it and left the sample
            </span>
            , so both columns are the average over the {effect.n} that remain standable.
          </>
        )}
      </p>

      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="pb-1.5 font-mono text-[10px] font-normal uppercase tracking-wider text-ink-faint">
              metric
            </th>
            <th className="pb-1.5 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-ink-faint">
              as built
            </th>
            <th className="pb-1.5 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-ink-faint">
              with intervention
            </th>
            <th className="pb-1.5 text-right font-mono text-[10px] font-normal uppercase tracking-wider text-ink-faint">
              change
            </th>
          </tr>
        </thead>
        <tbody>
          {effect.rows.map((row) => (
            <tr key={row.key} className="border-b border-line/60 last:border-0">
              <td className="py-1.5">
                <span className={row.diagnostic === false ? 'text-ink-muted' : 'text-ink'}>
                  {row.label}
                </span>
                {row.diagnostic === false && (
                  <span className="ml-1.5 font-mono text-[10px] text-warn">sign only</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                {row.format(row.before)}
              </td>
              <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-ink">
                {row.format(row.after)}
              </td>
              <td
                className={`py-1.5 text-right font-mono text-[12px] tabular-nums ${
                  Math.abs(row.pct) < 0.5
                    ? 'text-ink-faint'
                    : row.pct > 0
                      ? 'text-ok'
                      : 'text-redline'
                }`}
              >
                {/* A change under half a per cent is printed as "—" rather than
                    "+0.2%". At this grid a fraction of a per cent is not a
                    result, and printing it invites it to be read as one. */}
                {Math.abs(row.pct) < 0.5
                  ? '—'
                  : `${row.pct > 0 ? '+' : '−'}${Math.abs(row.pct).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2.5 flex gap-1.5 border-t border-line pt-2 text-[11px] leading-snug text-ink-faint">
        <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
        Both columns are cast height-aware at 360°, so the &ldquo;as built&rdquo; figures here are
        re-measured rather than read from the stored field — the difference is the intervention
        and nothing else. The decomposition figure and Tier A curves further up the page always
        describe the plaza <span className="text-ink-muted">as surveyed</span>, whatever is
        standing in the sandbox.
      </p>
    </div>
  )
}
