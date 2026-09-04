import { useMemo } from 'react'

import { Figure } from '@/components/Figure'
import { METRICS, METRIC_LABELS } from '@/lib/analysis/fingerprints'
import { classicalMDS, correlationMatrix, linearFit, pearson } from '@/lib/analysis/projection'

// Figures for P5. Every one draws the same underlying object — the weighted
// four-dimensional space the model fits — from a different angle:
//
//   ParallelCoordinates  each plaza as a profile across the four dimensions
//   SimilarityMap        all 18 arranged so weighted distance is visible
//   ConvergenceScatter   measured value against what people reported
//   CorrelationMatrix    how far the four dimensions are actually independent
//
// Plain SVG throughout, no charting library: these are simple marks, and the
// export in Figure.jsx works by serialising the live DOM, which needs the
// drawing to be ours rather than a library's shadow DOM or canvas.

const INK = '#17191D'
const MUTED = '#5C6169'
const FAINT = '#9AA0A8'
const RULE = '#DCDCD5'
const ACCENT = '#C2410C'
const COOL = '#27497E'

const fmt = (v, d = 2) => v.toFixed(d)

// Short column headers for the square matrix, where the full labels do not fit.
// Taking the last word of each label would render "Isovist area" as a
// lowercase "area" beside three capitalised neighbours.
const SHORT_LABEL = {
  area: 'Area',
  compactness: 'Compactness',
  occlusivity: 'Occlusivity',
  enclosure: 'Enclosure',
}

/* ------------------------------------------------ 1. parallel coordinates */

export function ParallelCoordinates({ siteIds, names, fingerprints, weights, highlight, onHighlight }) {
  const W = 720
  const H = 360
  const pad = { top: 26, right: 130, bottom: 44, left: 54 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const axisX = (i) => pad.left + (plotW * i) / (METRICS.length - 1)
  const y = (v) => pad.top + plotH * (1 - Math.max(0, Math.min(1, v)))

  return (
    <Figure
      title="Plaza fingerprints"
      filename="fingerprints-parallel-coordinates"
      caption="Each line is one plaza traced across the four normalised dimensions. Lines that run together describe squares the model treats as alike; a line that crosses the others is a plaza that is high on one dimension and low on the next."
      note="Values are min–max normalised across the 18 plazas, so 0 and 1 are the corpus extremes rather than absolute limits. Axis order follows the fitted weights, heaviest first."
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }} role="img" aria-label="Parallel coordinates of plaza fingerprints">
        {METRICS.map((m, i) => (
          <g key={m}>
            <line x1={axisX(i)} y1={pad.top} x2={axisX(i)} y2={pad.top + plotH} stroke={RULE} strokeWidth={1} />
            <text x={axisX(i)} y={pad.top + plotH + 18} textAnchor="middle" fontSize={11} fill={MUTED} fontFamily="system-ui, sans-serif">
              {METRIC_LABELS[m]}
            </text>
            <text x={axisX(i)} y={pad.top + plotH + 32} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily="ui-monospace, monospace">
              w {weights[i].toFixed(3)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.left - 6} y1={y(t)} x2={pad.left} y2={y(t)} stroke={FAINT} strokeWidth={1} />
            <text x={pad.left - 9} y={y(t) + 3} textAnchor="end" fontSize={9} fill={FAINT} fontFamily="ui-monospace, monospace">
              {t}
            </text>
          </g>
        ))}

        {siteIds.map((id) => {
          const p = fingerprints.get(id)
          if (!p) return null
          const on = highlight === id
          const d = p.map((v, i) => `${i === 0 ? 'M' : 'L'}${axisX(i)},${y(v)}`).join(' ')
          return (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={on ? ACCENT : COOL}
              strokeWidth={on ? 2.4 : 1}
              opacity={highlight && !on ? 0.16 : on ? 1 : 0.5}
              onMouseEnter={() => onHighlight?.(id)}
              onMouseLeave={() => onHighlight?.(null)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}

        {/* Only the highlighted plaza is named — eighteen labels at once is a
            thicket, and the legend is the interaction rather than the ink. */}
        {highlight &&
          fingerprints.get(highlight) && (
            <text
              x={axisX(METRICS.length - 1) + 10}
              y={y(fingerprints.get(highlight)[METRICS.length - 1]) + 4}
              fontSize={12}
              fill={ACCENT}
              fontFamily="system-ui, sans-serif"
              fontWeight={600}
            >
              {names.get(highlight)}
            </text>
          )}
        <text x={pad.left} y={16} fontSize={10} fill={FAINT} fontFamily="ui-monospace, monospace">
          {siteIds.length} plazas · hover to isolate
        </text>
      </svg>
    </Figure>
  )
}

/* ---------------------------------------------------- 2. similarity map */

export function SimilarityMap({ siteIds, names, fingerprints, weights, highlight, onHighlight }) {
  const W = 720
  const H = 460
  const pad = 46

  const { coords, stress } = useMemo(
    () => classicalMDS(siteIds.map((id) => fingerprints.get(id)), weights),
    [siteIds, fingerprints, weights]
  )

  const xs = coords.map((c) => c[0])
  const ys = coords.map((c) => c[1])
  const bx = [Math.min(...xs), Math.max(...xs)]
  const by = [Math.min(...ys), Math.max(...ys)]
  const sx = (v) => pad + ((v - bx[0]) / (bx[1] - bx[0] || 1)) * (W - 2 * pad)
  const sy = (v) => H - pad - ((v - by[0]) / (by[1] - by[0] || 1)) * (H - 2 * pad)

  return (
    <Figure
      title="Similarity map"
      filename="similarity-map-mds"
      caption="The 18 plazas arranged so that distance on the page approximates weighted distance in the fitted space: squares near each other are ones the model predicts people will group together. Produced by classical multidimensional scaling — nothing is adjusted to tidy the picture."
      note={`Stress ${fmt(stress, 3)} — the share of the real distance structure lost by flattening four dimensions to two. Below 0.15 the picture is a fair summary; at this value it is a good guide to the broad grouping, but pairs that look close should be checked against the numbers before being called close.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }} role="img" aria-label="Multidimensional scaling map of plaza similarity">
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="none" stroke={RULE} strokeWidth={1} />
        {siteIds.map((id, i) => {
          const on = highlight === id
          const px = sx(coords[i][0])
          const py = sy(coords[i][1])
          // Labels sit to the right by default, and flip left in the right
          // third so they never run past the frame. Points that share a
          // horizontal band get nudged apart vertically — without it,
          // neighbours in the projection overprint each other and both become
          // unreadable, which is worse than either being slightly off.
          const flip = px > W * 0.66
          const crowded = siteIds.some((other, j) => {
            if (j >= i) return false
            return Math.abs(sx(coords[j][0]) - px) < 70 && Math.abs(sy(coords[j][1]) - py) < 11
          })
          return (
            <g
              key={id}
              onMouseEnter={() => onHighlight?.(id)}
              onMouseLeave={() => onHighlight?.(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={px}
                cy={py}
                r={on ? 7 : 4.5}
                fill={on ? ACCENT : COOL}
                opacity={highlight && !on ? 0.25 : 0.9}
              />
              <text
                x={px + (flip ? -1 : 1) * (on ? 11 : 8)}
                y={py + 4 + (crowded ? 12 : 0)}
                textAnchor={flip ? 'end' : 'start'}
                fontSize={on ? 12 : 10}
                fontWeight={on ? 600 : 400}
                fill={on ? ACCENT : MUTED}
                opacity={highlight && !on ? 0.3 : 1}
                fontFamily="system-ui, sans-serif"
              >
                {names.get(id)}
              </text>
            </g>
          )
        })}
        <text x={pad} y={H - 16} fontSize={10} fill={FAINT} fontFamily="ui-monospace, monospace">
          axes are arbitrary — only the distances carry meaning
        </text>
      </svg>
    </Figure>
  )
}

/* ------------------------------------------------ 3. convergence scatter */

export function ConvergenceScatter({ ratings }) {
  const CELL = 250
  const H = 240
  const pad = { top: 30, right: 14, bottom: 42, left: 46 }

  return (
    <Figure
      title="Measured against perceived"
      filename="convergence-measured-vs-perceived"
      caption="For each dimension, every plaza's computed value against the mean rating participants gave it. A dimension where the metric captures the percept shows points climbing a line; one where it does not shows a cloud."
      note="Correlations are aligned so positive always means agreement — occlusivity's scale runs backwards relative to its metric, so its raw sign is flipped to match. With 18 plazas, r must exceed about 0.47 to reach significance on its own."
    >
      <svg
        viewBox={`0 0 ${CELL * 4} ${H}`}
        className="w-full"
        style={{ minWidth: 780 }}
        role="img"
        aria-label="Scatter plots of computed value against mean rating for each dimension"
      >
        {ratings.scales.map((scale, panel) => {
          const ox = panel * CELL
          const pts = scale.per_site
          const xs = pts.map((p) => p.computed)
          const ys = pts.map((p) => p.mean_rating)
          const bx = [Math.min(...xs), Math.max(...xs)]
          const by = [1, 7]
          const sx = (v) => ox + pad.left + ((v - bx[0]) / (bx[1] - bx[0] || 1)) * (CELL - pad.left - pad.right)
          const sy = (v) => H - pad.bottom - ((v - by[0]) / (by[1] - by[0])) * (H - pad.top - pad.bottom)
          const fit = linearFit(xs, ys)
          const strong = scale.pearson_p_holm < 0.05 && scale.pearson_aligned > 0

          return (
            <g key={scale.metric}>
              <text x={ox + pad.left} y={16} fontSize={11} fontWeight={600} fill={INK} fontFamily="system-ui, sans-serif">
                {scale.label}
              </text>
              <text x={ox + pad.left} y={28} fontSize={10} fill={strong ? '#2C6A4C' : '#A2382A'} fontFamily="ui-monospace, monospace">
                r = {fmt(scale.pearson_aligned, 3)}
              </text>

              <line x1={ox + pad.left} y1={H - pad.bottom} x2={ox + CELL - pad.right} y2={H - pad.bottom} stroke={RULE} />
              <line x1={ox + pad.left} y1={pad.top} x2={ox + pad.left} y2={H - pad.bottom} stroke={RULE} />
              {[1, 4, 7].map((t) => (
                <text key={t} x={ox + pad.left - 7} y={sy(t) + 3} textAnchor="end" fontSize={9} fill={FAINT} fontFamily="ui-monospace, monospace">
                  {t}
                </text>
              ))}

              <line
                x1={sx(bx[0])}
                y1={sy(fit.intercept + fit.slope * bx[0])}
                x2={sx(bx[1])}
                y2={sy(fit.intercept + fit.slope * bx[1])}
                stroke={strong ? COOL : FAINT}
                strokeWidth={1.4}
                strokeDasharray={strong ? '' : '4 3'}
              />
              {pts.map((p) => (
                <circle key={p.site_id} cx={sx(p.computed)} cy={sy(p.mean_rating)} r={3.4} fill={strong ? COOL : MUTED} opacity={0.75} />
              ))}

              <text x={ox + CELL / 2} y={H - 22} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily="ui-monospace, monospace">
                computed →
              </text>
              <text x={ox + CELL / 2} y={H - 9} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily="ui-monospace, monospace">
                ↑ mean rating 1–7
              </text>
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

/* ------------------------------------------------ 4. correlation matrix */

export function MetricCorrelation({ siteIds, fingerprints }) {
  const points = useMemo(() => siteIds.map((id) => fingerprints.get(id)), [siteIds, fingerprints])
  const C = useMemo(() => correlationMatrix(points), [points])

  const CELL = 92
  const label = 118
  const W = label + CELL * METRICS.length + 12
  const H = 34 + CELL * METRICS.length + 12

  // Diverging ramp: blue for positive, red for negative, pale at zero. The
  // sign matters more than the magnitude here — a strong negative correlation
  // makes two dimensions as redundant as a strong positive one.
  const colour = (r) => {
    const t = Math.min(1, Math.abs(r))
    const [cr, cg, cb] = r >= 0 ? [39, 73, 126] : [162, 56, 42]
    const mix = (c) => Math.round(255 - (255 - c) * t)
    return `rgb(${mix(cr)}, ${mix(cg)}, ${mix(cb)})`
  }

  return (
    <Figure
      title="How independent are the four dimensions?"
      filename="metric-correlation-matrix"
      caption="Correlations between the metrics themselves across the 18 plazas. Strong values off the diagonal mean two dimensions are partly measuring the same thing — which is what limits how much the ensemble can add over its best single member."
      note="Area and enclosure at −0.64 is the consequential one: larger squares in this corpus are systematically less enclosed, so knowing one already tells you much about the other. That is a property of European urban form, not of the metrics."
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 560 }} role="img" aria-label="Correlation matrix between the four metrics">
        {METRICS.map((m, j) => (
          <text
            key={m}
            x={label + CELL * j + CELL / 2}
            y={24}
            textAnchor="middle"
            fontSize={10}
            fill={MUTED}
            fontFamily="system-ui, sans-serif"
          >
            {SHORT_LABEL[m] ?? METRIC_LABELS[m]}
          </text>
        ))}
        {METRICS.map((m, i) => (
          <g key={m}>
            <text x={label - 10} y={34 + CELL * i + CELL / 2 + 4} textAnchor="end" fontSize={10} fill={MUTED} fontFamily="system-ui, sans-serif">
              {METRIC_LABELS[m]}
            </text>
            {METRICS.map((n, j) => {
              const r = C[i][j]
              const same = i === j
              return (
                <g key={n}>
                  <rect
                    x={label + CELL * j}
                    y={34 + CELL * i}
                    width={CELL - 3}
                    height={CELL - 3}
                    fill={same ? '#EFEFEA' : colour(r)}
                    stroke={RULE}
                    strokeWidth={0.5}
                  />
                  <text
                    x={label + CELL * j + (CELL - 3) / 2}
                    y={34 + CELL * i + (CELL - 3) / 2 + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fontFamily="ui-monospace, monospace"
                    fill={same ? FAINT : Math.abs(r) > 0.55 ? '#FFFFFF' : INK}
                  >
                    {same ? '—' : fmt(r, 2)}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
    </Figure>
  )
}
