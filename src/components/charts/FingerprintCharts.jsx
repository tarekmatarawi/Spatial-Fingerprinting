import { useMemo, useRef } from 'react'

import { Figure } from '@/components/Figure'
import { METRICS, METRIC_LABELS } from '@/lib/analysis/fingerprints'
import {
  classicalMDS,
  correlationMatrix,
  dimensionLoadings,
  histogram,
  kde,
  linearFit,
  nearestNeighbours,
  placeLabels,
} from '@/lib/analysis/projection'

// Figures for P5. Every one draws the same underlying object — the weighted
// four-dimensional space the model fits — from a different angle:
//
//   ParallelCoordinates   each plaza as a profile across the four dimensions
//   SimilarityMDS         all 18 laid out so true weighted distance is visible
//   DimensionLoadings     what the two MDS axes are actually made of
//   ScatterMatrix         all six pairwise relations, plus each distribution
//   PairedFoldChart       full model against area-only, fold by fold
//   ConcealmentComparison the H3 result: which metric tracks the percept
//   ConvergenceScatter    measured value against what people reported
//   MetricCorrelation     how far the four dimensions are actually independent
//
// Plain SVG throughout, no charting library: these are simple marks, and the
// export in Figure.jsx works by serialising the live DOM, which needs the
// drawing to be ours rather than a library's shadow DOM or canvas.
//
// SELECTION IS SHARED. One plaza is "selected" across every figure on the page,
// so a line in the profile chart, a dot on the map and a point in the matrix
// can be read as the same square. Hovering selects temporarily; clicking pins,
// which is what lets a reader hold a plaza still while looking at another
// figure — or take a screenshot of one.
//
// NEAREST-MARK HIT-TESTING, NOT PER-ELEMENT HOVER. Every interactive figure
// listens for pointer movement on the svg once and picks the closest mark.
// Attaching mouseenter/mouseleave to each dot looks simpler and is why the
// earlier versions flickered: with overlapping dots, labels and leaders, leave
// fires after the next enter, so the selection blinks off and on as the cursor
// crosses a boundary. Distance to the nearest mark has no boundaries to cross.

const INK = '#17191D'
const MUTED = '#5C6169'
const FAINT = '#9AA0A8'
const RULE = '#DCDCD5'
const GRID = '#ECEAE1'
const PAPER = '#FDFDFB'
const WASH = '#FBEDE4'

// Series blue and selection orange. Checked with the palette validator against
// the paper surface: both sit inside the lightness band, clear the chroma
// floor, and separate by ΔE 22.9 under protanopia — so the pairing survives
// colour-blind readers and a greyscale thesis print alike.
const COOL = '#1F5FAE'
const ACCENT = '#C2410C'
const NEG = '#A2382A'
const OK = '#2C6A4C'

const SANS = 'Inter, system-ui, sans-serif'
const MONO = "'JetBrains Mono', ui-monospace, monospace"

const fmt = (v, d = 2) => v.toFixed(d)
const pctStr = (v, d = 1) => `${(v * 100).toFixed(d)}%`
const signed = (v, d = 3) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`

// Short column headers for square matrices, where the full labels do not fit.
// Taking the last word of each label would render "Isovist area" as a
// lowercase "area" beside three capitalised neighbours.
const SHORT_LABEL = {
  area: 'Area',
  compactness: 'Compactness',
  occlusivity: 'Occlusivity',
  enclosure: 'Enclosure',
}

/* --------------------------------------------------------------- helpers */

// Pointer position in viewBox units. The svg is drawn at width 100% with a
// viewBox and no explicit height, so the scale is uniform and one ratio
// converts both axes.
function viewBoxPoint(event, svg, W) {
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (!rect.width) return null
  const k = W / rect.width
  return { x: (event.clientX - rect.left) * k, y: (event.clientY - rect.top) * k }
}

// Round axis step near a target tick count — 1, 2 or 5 times a power of ten,
// so tick labels read as numbers a person would have chosen.
function niceStep(span, target = 5) {
  if (!(span > 0)) return 1
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
}

function ticksFor(lo, hi, target = 5) {
  const step = niceStep(hi - lo, target)
  const out = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
    out.push(Math.abs(t) < step / 1e6 ? 0 : t)
  }
  return out
}

// Distance from a point to a segment — used to hit-test the slope chart, where
// the mark a reader aims at is the line, not its endpoints.
function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Text with a paper-coloured outline behind it, so a value label stays readable
// where it crosses a line or another mark. Cheaper and more robust in an
// exported SVG than a filled backing rectangle, which would have to be sized.
function HaloText({ children, halo = PAPER, haloWidth = 3, ...rest }) {
  return (
    <>
      <text {...rest} stroke={halo} strokeWidth={haloWidth} strokeLinejoin="round" fill={halo}>
        {children}
      </text>
      <text {...rest}>{children}</text>
    </>
  )
}

// The one-line instruction every interactive figure carries, so the
// click-to-pin affordance is discoverable without reading a caption.
function PinHint({ x, y, pinned, name, verb = 'a plaza' }) {
  return (
    <text x={x} y={y} fontSize={10} fill={pinned ? ACCENT : FAINT} fontFamily={MONO}>
      {pinned
        ? `pinned: ${name} · click again to release`
        : `hover to highlight · click ${verb} to pin it across every figure`}
    </text>
  )
}

/* ------------------------------------------------ 1. parallel coordinates */

export function ParallelCoordinates({
  siteIds,
  names,
  fingerprints,
  weights,
  selected,
  pinned,
  onHover,
  onPin,
}) {
  const W = 900
  const H = 452
  const pad = { top: 40, right: 214, bottom: 62, left: 66 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const axisX = (i) => pad.left + (plotW * i) / (METRICS.length - 1)
  const y = (v) => pad.top + plotH * (1 - Math.max(0, Math.min(1, v)))

  // The legend doubles as a ranking: ordering it by the heaviest-weighted
  // dimension makes the list itself informative, rather than eighteen names in
  // alphabetical order.
  const legend = useMemo(
    () =>
      [...siteIds]
        .filter((id) => fingerprints.get(id))
        .sort((a, b) => fingerprints.get(b)[0] - fingerprints.get(a)[0]),
    [siteIds, fingerprints]
  )

  const path = (p) => p.map((v, i) => `${i === 0 ? 'M' : 'L'}${axisX(i)},${y(v)}`).join(' ')
  const sel = selected && fingerprints.get(selected) ? selected : null
  const svgRef = useRef(null)

  // Nearest line under the cursor, measured segment by segment. Invisible fat
  // hit-strokes would be simpler, but they only fire on enter: the highlight
  // then sticks to the last line touched even after the cursor has left the
  // bundle. Distance releases as soon as nothing is near.
  function pick(event) {
    const p = viewBoxPoint(event, svgRef.current, W)
    // The legend column runs its own hover; picking a line there would fight it.
    if (!p || p.x > W - pad.right) return undefined
    let best = null
    for (const id of legend) {
      const f = fingerprints.get(id)
      for (let i = 0; i < f.length - 1; i++) {
        const d = pointSegmentDistance(p.x, p.y, axisX(i), y(f[i]), axisX(i + 1), y(f[i + 1]))
        if (best === null || d < best.d) best = { d, id }
      }
    }
    return best && best.d < 8 ? best.id : null
  }

  return (
    <Figure
      title="Plaza fingerprints — profiles across the four fitted dimensions"
      filename="fingerprints-parallel-coordinates"
      caption="Each line is one plaza traced across the four normalised dimensions, axes ordered by fitted weight. Lines that run together describe squares the model treats as alike; a line that crosses the others is a plaza that is high on one dimension and low on the next."
      note="Values are min–max normalised across the 18 plazas, so 0 and 1 are the corpus extremes rather than absolute limits. Hovering highlights a plaza in every figure on this page; clicking pins it, so it stays highlighted while you read the others."
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 620 }}
        role="img"
        aria-label="Parallel coordinates of the eighteen plaza fingerprints across four normalised metrics"
        onMouseMove={(e) => {
          const id = pick(e)
          // undefined means "the legend owns this pointer" — leave it alone.
          if (id !== undefined) onHover?.(id)
        }}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          const id = pick(e)
          if (id) onPin?.(id)
        }}
      >
        {/* Recessive horizontal grid — hairlines one shade off the paper. */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={pad.left}
            y1={y(t)}
            x2={pad.left + plotW}
            y2={y(t)}
            stroke={t === 0 || t === 1 ? RULE : GRID}
            strokeWidth={1}
          />
        ))}
        {[0, 0.5, 1].map((t) => (
          <text
            key={t}
            x={pad.left - 10}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize={9.5}
            fill={FAINT}
            fontFamily={MONO}
          >
            {t.toFixed(1)}
          </text>
        ))}
        <text
          transform={`translate(20 ${pad.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10}
          fill={MUTED}
          fontFamily={SANS}
        >
          normalised value (0 = corpus minimum, 1 = maximum)
        </text>

        {/* Axes, labelled with the weight each carries in the fitted model. */}
        {METRICS.map((m, i) => (
          <g key={m}>
            <line
              x1={axisX(i)}
              y1={pad.top}
              x2={axisX(i)}
              y2={pad.top + plotH}
              stroke={RULE}
              strokeWidth={1.25}
            />
            <text
              x={axisX(i)}
              y={pad.top + plotH + 20}
              textAnchor="middle"
              fontSize={11.5}
              fill={INK}
              fontFamily={SANS}
              fontWeight={500}
            >
              {METRIC_LABELS[m]}
            </text>
            <text
              x={axisX(i)}
              y={pad.top + plotH + 35}
              textAnchor="middle"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              weight {weights[i].toFixed(3)}
            </text>
          </g>
        ))}

        {/* Every plaza, then the selected one redrawn on top with a paper halo
            so it reads clearly where it crosses the others. */}
        {legend.map((id) => {
          if (sel === id) return null
          return (
            <path
              key={id}
              d={path(fingerprints.get(id))}
              fill="none"
              stroke={COOL}
              strokeWidth={1.1}
              opacity={sel ? 0.13 : 0.42}
            />
          )
        })}
        {sel && (
          <g>
            <path
              d={path(fingerprints.get(sel))}
              fill="none"
              stroke={PAPER}
              strokeWidth={5.5}
              strokeLinejoin="round"
            />
            <path
              d={path(fingerprints.get(sel))}
              fill="none"
              stroke={ACCENT}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
            {fingerprints.get(sel).map((v, i) => {
              // A value near the corpus maximum places the point right under
              // the header text; the label's default position above the point
              // would sit on top of it. Below the point is always clear, since
              // nothing else is drawn there.
              const below = y(v) - pad.top < 22
              return (
                <g key={i}>
                  <circle cx={axisX(i)} cy={y(v)} r={3.6} fill={ACCENT} stroke={PAPER} strokeWidth={1.6} />
                  <HaloText
                    x={axisX(i)}
                    y={y(v) + (below ? 16 : -10)}
                    textAnchor="middle"
                    fontSize={10}
                    fill={ACCENT}
                    fontFamily={MONO}
                    fontWeight={600}
                  >
                    {fmt(v, 2)}
                  </HaloText>
                </g>
              )
            })}
          </g>
        )}

        {/* Legend, ranked by the heaviest dimension and clickable. */}
        <text x={W - pad.right + 26} y={pad.top - 12} fontSize={9.5} fill={FAINT} fontFamily={MONO}>
          ranked by isovist area ↓
        </text>
        {legend.map((id, i) => {
          const on = sel === id
          const ry = pad.top + 4 + i * 17.5
          return (
            <g
              key={`legend-${id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover?.(id)}
              onClick={() => onPin?.(id)}
            >
              <rect
                x={W - pad.right + 20}
                y={ry - 10}
                width={pad.right - 26}
                height={16}
                rx={3}
                fill={on ? WASH : 'transparent'}
              />
              <rect
                x={W - pad.right + 26}
                y={ry - 4.5}
                width={12}
                height={3}
                rx={1.5}
                fill={on ? ACCENT : COOL}
                opacity={on ? 1 : 0.55}
              />
              <text
                x={W - pad.right + 44}
                y={ry + 2}
                fontSize={10.5}
                fill={on ? ACCENT : MUTED}
                fontWeight={on ? 600 : 400}
                fontFamily={SANS}
              >
                {names.get(id)}
              </text>
              <text
                x={W - 12}
                y={ry + 2}
                textAnchor="end"
                fontSize={9.5}
                fill={on ? ACCENT : FAINT}
                fontFamily={MONO}
              >
                {fmt(fingerprints.get(id)[0], 2)}
              </text>
            </g>
          )
        })}

        <text x={pad.left} y={20} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          {siteIds.length} plazas · four normalised isovist dimensions
        </text>
        <PinHint
          x={pad.left}
          y={H - 8}
          pinned={pinned}
          name={pinned ? names.get(pinned) : ''}
          verb="a line or a name"
        />
      </svg>
    </Figure>
  )
}

/* ------------------------------------------------------ 2. the MDS layout */

export function SimilarityMDS({
  siteIds,
  names,
  fingerprints,
  weights,
  selected,
  pinned,
  onHover,
  onPin,
}) {
  const W = 900
  const H = 620
  const pad = { top: 54, right: 34, bottom: 78, left: 74 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const svgRef = useRef(null)

  const points = useMemo(() => siteIds.map((id) => fingerprints.get(id)), [siteIds, fingerprints])
  const { coords, stress, distances } = useMemo(
    () => classicalMDS(points, weights),
    [points, weights]
  )

  // EQUAL ASPECT. Both axes are drawn at the same units-per-pixel, which is the
  // whole claim of the figure: a centimetre across means the same amount of
  // dissimilarity as a centimetre up. Stretching each axis to fill the frame —
  // the obvious thing, and what this figure used to do — silently distorts
  // every distance on the page and makes the map say something the model does
  // not.
  const geometry = useMemo(() => {
    const xs = coords.map((c) => c[0])
    const ys = coords.map((c) => c[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const spanX = Math.max(...xs) - Math.min(...xs) || 1
    const spanY = Math.max(...ys) - Math.min(...ys) || 1
    // 0.86 leaves the margin the labels need outside the outermost dots.
    const scale = Math.min(plotW / spanX, plotH / spanY) * 0.86
    return {
      scale,
      sx: (v) => pad.left + plotW / 2 + (v - cx) * scale,
      sy: (v) => pad.top + plotH / 2 - (v - cy) * scale,
      xDomain: [cx - plotW / 2 / scale, cx + plotW / 2 / scale],
      yDomain: [cy - plotH / 2 / scale, cy + plotH / 2 / scale],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, plotW, plotH])

  const { sx, sy, scale } = geometry
  const screen = useMemo(() => coords.map((c) => ({ x: sx(c[0]), y: sy(c[1]) })), [coords, sx, sy])

  // Deterministic non-overlapping labels: all 18 named, none printed over
  // another and none over a dot.
  const labels = useMemo(
    () =>
      placeLabels(
        screen.map((p, i) => ({ x: p.x, y: p.y, text: names.get(siteIds[i]) ?? siteIds[i] })),
        {
          width: W - 8,
          height: pad.top + plotH + 10,
          charWidth: 5.5,
          lineHeight: 11.5,
          gap: 9.5,
          markerRadius: 7,
        }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen, names, siteIds, plotH]
  )

  const selIndex = selected ? siteIds.indexOf(selected) : -1
  const neighbours = useMemo(
    () => (selIndex >= 0 ? nearestNeighbours(distances, selIndex, 3) : []),
    [distances, selIndex]
  )

  function pick(event) {
    const p = viewBoxPoint(event, svgRef.current, W)
    if (!p) return null
    let best = null
    for (let i = 0; i < screen.length; i++) {
      const d = Math.hypot(p.x - screen[i].x, p.y - screen[i].y)
      if (best === null || d < best.d) best = { d, i }
    }
    // A generous radius: the hit target is the dot's neighbourhood, not the
    // 5px dot, and nothing else on the plot competes for the cursor.
    return best && best.d < 46 ? siteIds[best.i] : null
  }

  const xTicks = ticksFor(geometry.xDomain[0], geometry.xDomain[1], 6)
  const yTicks = ticksFor(geometry.yDomain[0], geometry.yDomain[1], 5)
  const barUnits = niceStep((geometry.xDomain[1] - geometry.xDomain[0]) / 2, 2)

  return (
    <Figure
      title="Multidimensional scaling (MDS) of the weighted fingerprint space"
      filename="mds-similarity-map"
      caption="Closer distance indicates higher overall spatial similarity across all 4 metrics. The 18 plazas are placed by classical (Torgerson) multidimensional scaling, so that straight-line distance on the page reproduces the fitted weighted distance between plazas as closely as two dimensions allow. Nothing is adjusted to tidy the picture."
      note={`Both axes are drawn at the same scale, so distance is comparable in every direction — the axes carry weighted-distance units and the scale bar sets them. Kruskal stress-1 is ${fmt(stress, 3)}: the share of the real distance structure lost in flattening four dimensions to two. Below 0.15 the picture is a fair summary; at this value it is a reliable guide to the broad grouping, but a pair that looks close should be checked against the true distance — which is what the leaders drawn from a pinned plaza report.`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 620 }}
        role="img"
        aria-label="Multidimensional scaling map of the eighteen plazas, with both axes at equal scale"
        onMouseMove={(e) => onHover?.(pick(e))}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          const id = pick(e)
          if (id) onPin?.(id)
        }}
      >
        <text x={pad.left} y={22} fontSize={11.5} fill={INK} fontFamily={SANS} fontWeight={600}>
          True Euclidean distance in the fitted four-metric space
        </text>
        <text x={pad.left} y={38} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          Closer distance indicates higher overall spatial similarity across all 4 metrics.
        </text>

        <rect
          x={pad.left}
          y={pad.top}
          width={plotW}
          height={plotH}
          fill={PAPER}
          stroke={RULE}
          strokeWidth={1}
        />
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={sx(t)}
              y1={pad.top}
              x2={sx(t)}
              y2={pad.top + plotH}
              stroke={t === 0 ? RULE : GRID}
              strokeWidth={1}
            />
            <text
              x={sx(t)}
              y={pad.top + plotH + 16}
              textAnchor="middle"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={pad.left}
              y1={sy(t)}
              x2={pad.left + plotW}
              y2={sy(t)}
              stroke={t === 0 ? RULE : GRID}
              strokeWidth={1}
            />
            <text
              x={pad.left - 9}
              y={sy(t) + 3.5}
              textAnchor="end"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        <text
          x={pad.left + plotW / 2}
          y={H - 40}
          textAnchor="middle"
          fontSize={11.5}
          fill={INK}
          fontFamily={SANS}
          fontWeight={500}
        >
          Dimension 1 (Relative Similarity)
        </text>
        <text
          transform={`translate(24 ${pad.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={11.5}
          fill={INK}
          fontFamily={SANS}
          fontWeight={500}
        >
          Dimension 2 (Relative Similarity)
        </text>

        {/* Leaders to the three nearest plazas — measured in the true weighted
            space, not in the flattened picture, so a reader can see where the
            projection has moved something. */}
        {selIndex >= 0 &&
          neighbours.map((nb) => {
            const a = screen[selIndex]
            const b = screen[nb.index]
            return (
              <g key={`leader-${nb.index}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={ACCENT}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <HaloText
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={ACCENT}
                  fontFamily={MONO}
                >
                  {`d ${fmt(nb.distance, 3)}`}
                </HaloText>
              </g>
            )
          })}

        {siteIds.map((id, i) => {
          const on = selected === id
          const dim = selected && !on
          return (
            <g key={id}>
              <circle
                cx={screen[i].x}
                cy={screen[i].y}
                r={on ? 7 : 5}
                fill={on ? ACCENT : COOL}
                stroke={PAPER}
                strokeWidth={1.8}
                opacity={dim ? 0.3 : 1}
              />
              <text
                x={labels[i].x}
                y={labels[i].y}
                textAnchor={labels[i].anchor}
                fontSize={on ? 11.5 : 10}
                fontWeight={on ? 600 : 400}
                fill={on ? ACCENT : MUTED}
                opacity={dim ? 0.34 : 1}
                fontFamily={SANS}
                style={{ pointerEvents: 'none' }}
              >
                {names.get(id)}
              </text>
            </g>
          )
        })}

        {/* Scale bar: the figure's units made concrete. */}
        <g>
          <line
            x1={pad.left + 14}
            y1={pad.top + plotH - 16}
            x2={pad.left + 14 + barUnits * scale}
            y2={pad.top + plotH - 16}
            stroke={INK}
            strokeWidth={2}
          />
          <line
            x1={pad.left + 14}
            y1={pad.top + plotH - 20}
            x2={pad.left + 14}
            y2={pad.top + plotH - 12}
            stroke={INK}
            strokeWidth={1.5}
          />
          <line
            x1={pad.left + 14 + barUnits * scale}
            y1={pad.top + plotH - 20}
            x2={pad.left + 14 + barUnits * scale}
            y2={pad.top + plotH - 12}
            stroke={INK}
            strokeWidth={1.5}
          />
          <text
            x={pad.left + 14}
            y={pad.top + plotH - 24}
            fontSize={9.5}
            fill={MUTED}
            fontFamily={MONO}
          >
            {barUnits} weighted-distance units
          </text>
        </g>

        <text
          x={W - pad.right}
          y={pad.top - 8}
          textAnchor="end"
          fontSize={9.5}
          fill={FAINT}
          fontFamily={MONO}
        >
          stress-1 {fmt(stress, 3)} · equal aspect
        </text>
        <PinHint
          x={pad.left}
          y={H - 12}
          pinned={pinned}
          name={pinned ? names.get(pinned) : ''}
          verb="a point"
        />
      </svg>
    </Figure>
  )
}

/* --------------------------------------- 3. what the MDS axes are made of */

export function DimensionLoadings({ siteIds, fingerprints, weights }) {
  const points = useMemo(() => siteIds.map((id) => fingerprints.get(id)), [siteIds, fingerprints])
  const { coords, eigenvalues } = useMemo(() => classicalMDS(points, weights), [points, weights])
  const loadings = useMemo(() => dimensionLoadings(points, coords), [points, coords])

  const total = eigenvalues.reduce((a, b) => a + b, 0) || 1
  const W = 760
  const ROW = 13
  const GROUP = 2 * ROW + 4
  const pad = { top: 66, right: 92, bottom: 54, left: 148 }
  const plotW = W - pad.left - pad.right
  const H = pad.top + METRICS.length * GROUP + (METRICS.length - 1) * 15 + pad.bottom
  const x = (r) => pad.left + ((r + 1) / 2) * plotW

  return (
    <Figure
      title="What the two MDS dimensions represent"
      filename="mds-dimension-loadings"
      caption="Pearson correlation between each original metric and each MDS dimension, across the 18 plazas. Classical MDS returns axes that are mathematically defined but unnamed — they are simply the directions of greatest spread. Correlating the measured metrics against them is what makes the axes interpretable."
      note="A correlation near ±1 means that axis is largely that metric; a value near 0 means the metric loads on the other axis instead, or is split between them. Sign is arbitrary in MDS — an axis can be reflected without changing any distance — so read the magnitude and the pattern, not the direction."
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 560 }}
        role="img"
        aria-label="Correlation of each metric with the two MDS dimensions"
      >
        <text x={20} y={24} fontSize={11.5} fill={INK} fontFamily={SANS} fontWeight={600}>
          Metric–dimension correlation (r)
        </text>
        <text x={20} y={41} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          Dimension 1 carries {((eigenvalues[0] / total) * 100).toFixed(1)}% of the projected
          spread, Dimension 2 {((eigenvalues[1] / total) * 100).toFixed(1)}%.
        </text>

        {ticksFor(-1, 1, 4).map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              y1={pad.top - 14}
              x2={x(t)}
              y2={H - pad.bottom + 6}
              stroke={t === 0 ? RULE : GRID}
              strokeWidth={t === 0 ? 1.25 : 1}
            />
            <text
              x={x(t)}
              y={H - pad.bottom + 20}
              textAnchor="middle"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <text
          x={pad.left + plotW / 2}
          y={H - 14}
          textAnchor="middle"
          fontSize={10.5}
          fill={MUTED}
          fontFamily={SANS}
        >
          Pearson r with the dimension (n = {siteIds.length} plazas)
        </text>

        {METRICS.map((m, i) => {
          const top = pad.top + i * (GROUP + 15)
          return (
            <g key={m}>
              <text
                x={pad.left - 40}
                y={top + GROUP / 2 + 1}
                textAnchor="end"
                fontSize={11.5}
                fill={INK}
                fontFamily={SANS}
                fontWeight={500}
              >
                {METRIC_LABELS[m]}
              </text>
              {[0, 1].map((d) => {
                const r = loadings[i][d]
                const yTop = top + d * (ROW + 4)
                const zero = x(0)
                const end = x(r)
                return (
                  <g key={d}>
                    {/* The left gutter carries the row identity, so the two bars
                        in a group never rely on colour to be told apart. */}
                    <text
                      x={pad.left - 12}
                      y={yTop + ROW - 2.5}
                      textAnchor="end"
                      fontSize={9.5}
                      fill={FAINT}
                      fontFamily={MONO}
                    >
                      {d === 0 ? 'D1' : 'D2'}
                    </text>
                    <rect
                      x={Math.min(zero, end)}
                      y={yTop}
                      width={Math.max(1.5, Math.abs(end - zero))}
                      height={ROW}
                      rx={2}
                      fill={r >= 0 ? COOL : NEG}
                      opacity={0.25 + 0.75 * Math.min(1, Math.abs(r))}
                    />
                    <text
                      x={end + (r >= 0 ? 8 : -8)}
                      y={yTop + ROW - 2.5}
                      textAnchor={r >= 0 ? 'start' : 'end'}
                      fontSize={10}
                      fill={MUTED}
                      fontFamily={MONO}
                    >
                      {signed(r, 2)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

/* ------------------------------------------- 4. scatterplot matrix (SPLOM) */

export function ScatterMatrix({ siteIds, names, fingerprints, selected, pinned, onHover, onPin }) {
  const CELL = 152
  const INSET = 12
  const GUT_L = 104
  // 58 put the column headers 12px under the subtitle — two lines of text
  // nearly touching. The header sits just above the grid, so the gap it needs
  // comes from moving the grid down, not the header up.
  const GUT_T = 78
  const PAD_R = 16
  const PAD_B = 64
  const W = GUT_L + CELL * METRICS.length + PAD_R
  const H = GUT_T + CELL * METRICS.length + PAD_B
  const inner = CELL - 2 * INSET
  const svgRef = useRef(null)

  const points = useMemo(() => siteIds.map((id) => fingerprints.get(id)), [siteIds, fingerprints])
  const C = useMemo(() => correlationMatrix(points), [points])
  const columns = useMemo(() => METRICS.map((_, k) => points.map((p) => p[k])), [points])

  const cellX = (j) => GUT_L + j * CELL
  const cellY = (i) => GUT_T + i * CELL
  const px = (j, v) => cellX(j) + INSET + v * inner
  const py = (i, v) => cellY(i) + CELL - INSET - v * inner

  // Nearest point across every off-diagonal cell at once — one hit test for
  // sixteen panels, so crossing a cell boundary never drops the selection.
  function pick(event) {
    const p = viewBoxPoint(event, svgRef.current, W)
    if (!p) return null
    let best = null
    for (let i = 0; i < METRICS.length; i++) {
      for (let j = 0; j < METRICS.length; j++) {
        if (i === j) continue
        for (let k = 0; k < points.length; k++) {
          const d = Math.hypot(p.x - px(j, points[k][j]), p.y - py(i, points[k][i]))
          if (best === null || d < best.d) best = { d, k }
        }
      }
    }
    return best && best.d < 16 ? siteIds[best.k] : null
  }

  const selIdx = selected ? siteIds.indexOf(selected) : -1

  return (
    <Figure
      title="Scatterplot matrix — all six pairwise relations at once"
      filename="scatterplot-matrix"
      caption="Every pair of metrics plotted against each other across the 18 plazas, with the least-squares trend and the Pearson r in each panel. The diagonal shows how the plazas are distributed along each single metric: a histogram with a kernel density curve over it. Reading the matrix answers the redundancy question directly, without a dimensionality-reduction step in between."
      note="Values are min–max normalised, so every panel spans 0–1 on both axes and panels are directly comparable. The matrix is symmetric by construction: a panel above the diagonal is the one below it with the axes swapped, which is what lets a relation be read from either metric's row. The kernel density curve is bandwidth-smoothed by Silverman's rule and drawn over the histogram because 18 observations in 6 bins is a shape that moves when the bin edges move — where the two disagree, neither is a finding."
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 620 }}
        role="img"
        aria-label="Four by four scatterplot matrix of the metrics, with distributions on the diagonal"
        onMouseMove={(e) => onHover?.(pick(e))}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          const id = pick(e)
          if (id) onPin?.(id)
        }}
      >
        <text x={GUT_L} y={22} fontSize={11.5} fill={INK} fontFamily={SANS} fontWeight={600}>
          Pairwise structure of the four isovist metrics
        </text>
        <text x={GUT_L} y={38} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          {siteIds.length} plazas · off-diagonal: two metrics against each other · diagonal: the
          distribution of that one metric
        </text>

        {METRICS.map((m, j) => (
          <text
            key={`col-${m}`}
            x={cellX(j) + CELL / 2}
            y={GUT_T - 8}
            textAnchor="middle"
            fontSize={11}
            fill={INK}
            fontFamily={SANS}
            fontWeight={500}
          >
            {SHORT_LABEL[m]}
          </text>
        ))}
        {METRICS.map((m, i) => (
          <text
            key={`row-${m}`}
            transform={`translate(${GUT_L - 16} ${cellY(i) + CELL / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill={INK}
            fontFamily={SANS}
            fontWeight={500}
          >
            {SHORT_LABEL[m]}
          </text>
        ))}

        {METRICS.map((rowMetric, i) =>
          METRICS.map((colMetric, j) => {
            const x0 = cellX(j)
            const y0 = cellY(i)
            const key = `${i}-${j}`

            if (i === j) {
              const values = columns[i]
              const bins = histogram(values, { bins: 6 })
              const binWidth = bins[0].x1 - bins[0].x0
              const curve = kde(values, { samples: 60 })
              const peak = Math.max(
                ...bins.map((b) => b.count / (values.length * binWidth)),
                ...curve.map((c) => c.density)
              )
              const dy = (density) => y0 + CELL - INSET - (density / (peak || 1)) * (inner - 22)
              const line = curve
                .map((c, k) => `${k === 0 ? 'M' : 'L'}${px(j, c.x)},${dy(c.density)}`)
                .join(' ')
              return (
                <g key={key}>
                  <rect
                    x={x0}
                    y={y0}
                    width={CELL - 2}
                    height={CELL - 2}
                    fill="#F7F5EF"
                    stroke={RULE}
                    strokeWidth={0.75}
                  />
                  {bins.map((b, k) => {
                    const density = b.count / (values.length * binWidth)
                    const top = dy(density)
                    // A 2px paper gap between neighbouring bars rather than a
                    // stroke drawn around each one.
                    return (
                      <rect
                        key={k}
                        x={px(j, b.x0) + 1}
                        y={top}
                        width={Math.max(0, inner / bins.length - 2)}
                        height={y0 + CELL - INSET - top}
                        fill={COOL}
                        opacity={0.22}
                      />
                    )
                  })}
                  <path d={line} fill="none" stroke={COOL} strokeWidth={1.6} opacity={0.85} />
                  {/* Rug: where the eighteen actually fall, under the smoothing. */}
                  {values.map((v, k) => (
                    <line
                      key={`rug-${k}`}
                      x1={px(j, v)}
                      y1={y0 + CELL - INSET}
                      x2={px(j, v)}
                      y2={y0 + CELL - INSET - (siteIds[k] === selected ? 12 : 6)}
                      stroke={siteIds[k] === selected ? ACCENT : MUTED}
                      strokeWidth={siteIds[k] === selected ? 1.8 : 1}
                      opacity={siteIds[k] === selected ? 1 : 0.5}
                    />
                  ))}
                  <text
                    x={x0 + CELL / 2}
                    y={y0 + 18}
                    textAnchor="middle"
                    fontSize={10}
                    fill={MUTED}
                    fontFamily={SANS}
                  >
                    {SHORT_LABEL[rowMetric]} distribution
                  </text>
                </g>
              )
            }

            const fit = linearFit(columns[j], columns[i])
            const r = C[i][j]
            const strong = Math.abs(r) >= 0.47
            const clamp = (v) => Math.max(-0.1, Math.min(1.1, v))
            return (
              <g key={key}>
                <rect
                  x={x0}
                  y={y0}
                  width={CELL - 2}
                  height={CELL - 2}
                  fill={PAPER}
                  stroke={RULE}
                  strokeWidth={0.75}
                />
                <line
                  x1={px(j, 0)}
                  y1={py(i, clamp(fit.intercept))}
                  x2={px(j, 1)}
                  y2={py(i, clamp(fit.intercept + fit.slope))}
                  stroke={strong ? (r >= 0 ? COOL : NEG) : FAINT}
                  strokeWidth={strong ? 1.4 : 1}
                  strokeDasharray={strong ? '' : '4 3'}
                  opacity={0.7}
                />
                {points.map((p, k) => {
                  if (siteIds[k] === selected) return null
                  return (
                    <circle
                      key={k}
                      cx={px(j, p[j])}
                      cy={py(i, p[i])}
                      r={3.2}
                      fill={COOL}
                      stroke={PAPER}
                      strokeWidth={1}
                      opacity={selected ? 0.28 : 0.72}
                    />
                  )
                })}
                {selIdx >= 0 && (
                  <circle
                    cx={px(j, points[selIdx][j])}
                    cy={py(i, points[selIdx][i])}
                    r={5}
                    fill={ACCENT}
                    stroke={PAPER}
                    strokeWidth={1.8}
                  />
                )}
                <HaloText
                  x={x0 + CELL - 10}
                  y={y0 + 16}
                  textAnchor="end"
                  fontSize={10.5}
                  fontFamily={MONO}
                  fontWeight={strong ? 600 : 400}
                  fill={strong ? (r >= 0 ? COOL : NEG) : FAINT}
                >
                  {`r ${signed(r, 2)}`}
                </HaloText>
              </g>
            )
          })
        )}

        {/* Outer axis ticks only — 0 and 1 on the left column and bottom row. */}
        {[0, 1].map((t) => (
          <g key={`tick-${t}`}>
            <text
              x={GUT_L - 4}
              y={py(METRICS.length - 1, t) + 3.5}
              textAnchor="end"
              fontSize={9}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t}
            </text>
            <text
              x={px(0, t)}
              y={H - PAD_B + 16}
              textAnchor="middle"
              fontSize={9}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t}
            </text>
          </g>
        ))}
        {/* Two lines, stacked with an explicit gap rather than one derived
            from PAD_B — the derived position is what had them landing on top
            of each other before. */}
        <text
          x={GUT_L + (CELL * METRICS.length) / 2}
          y={H - 30}
          textAnchor="middle"
          fontSize={10.5}
          fill={MUTED}
          fontFamily={SANS}
        >
          all axes: min–max normalised across the {siteIds.length} plazas (0 = corpus minimum, 1 =
          maximum)
        </text>
        <PinHint
          x={GUT_L}
          y={H - 12}
          pinned={pinned}
          name={pinned ? names.get(pinned) : ''}
          verb="a point"
        />
      </svg>
    </Figure>
  )
}

/* ------------------------------------- 5. leave-one-plaza-out, fold by fold */

export function PairedFoldChart({ crossval, names, selected, pinned, onHover, onPin }) {
  const W = 900
  const H = 540
  // top carries four stacked bands — title, subtitle, the line-reading legend,
  // then the column headers — and needs enough height that none of them touch;
  // 92 put the column headers directly on top of the legend's third row.
  const pad = { top: 124, right: 158, bottom: 62, left: 86 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const svgRef = useRef(null)

  const folds = crossval.paired.perFold
  const nBySite = useMemo(
    () => new Map(crossval.per_fold.map((f) => [f.site, f.n])),
    [crossval]
  )

  // A fixed window rather than a data-driven one: it must contain the chance
  // line, or the figure's central comparison — both models against 33.3% —
  // would be off the page.
  const lo = 0.3
  const hi = 0.66
  const y = (v) => pad.top + plotH * (1 - (v - lo) / (hi - lo))
  const xA = pad.left + plotW * 0.26
  const xB = pad.left + plotW * 0.74

  function pick(event) {
    const p = viewBoxPoint(event, svgRef.current, W)
    if (!p) return null
    let best = null
    for (const f of folds) {
      const d = pointSegmentDistance(p.x, p.y, xA, y(f.full), xB, y(f.baseline))
      if (best === null || d < best.d) best = { d, site: f.site }
    }
    return best && best.d < 9 ? best.site : null
  }

  const active = folds.find((f) => f.site === selected) ?? null
  const strokeFor = (delta) => (delta > 0 ? COOL : delta < 0 ? NEG : FAINT)
  const foldN = crossval.per_fold.map((f) => f.n)

  return (
    <Figure
      title="Leave-one-plaza-out validation — full model against area alone"
      filename="crossval-paired-folds"
      caption="Every fold shown, not just the two means. Each line joins the accuracy of the four-metric model to the accuracy of the isovist-area-only baseline on the SAME held-out plaza, so the pairing the sign test uses is visible directly. Both models sit well above chance; neither is reliably above the other."
      note={`Accuracy is leave-one-plaza-out: one plaza is removed, the weights are refitted on the remaining ${folds.length - 1}, and the model then predicts judgements about the plaza it never saw. Chance is 33.3% because each triplet offers three possible pairs. The full model wins ${crossval.paired.wins} of the ${crossval.paired.wins + crossval.paired.losses} decided folds (${crossval.paired.ties} tied), sign test p = ${crossval.paired.signTestP.toFixed(3)} — indistinguishable from a coin flip. Each fold rests on between ${Math.min(...foldN)} and ${Math.max(...foldN)} judgements, which is why individual folds swing so much more widely than the two means.`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 620 }}
        role="img"
        aria-label="Paired accuracy plot of the full model against the area-only baseline for each leave-one-plaza-out fold"
        onMouseMove={(e) => onHover?.(pick(e))}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          const id = pick(e)
          if (id) onPin?.(id)
        }}
      >
        <text x={26} y={24} fontSize={11.5} fill={INK} fontFamily={SANS} fontWeight={600}>
          Held-out accuracy, {folds.length} folds
        </text>
        <text x={26} y={41} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          One line per plaza, joining the two models scored on the same held-out judgements.
        </text>

        {/* Legend — the slope of a line is the reading, so the slope is what
            the legend explains. */}
        {[
          { c: COOL, t: `rises → full model better (${crossval.paired.wins})` },
          { c: NEG, t: `falls → area-only better (${crossval.paired.losses})` },
          { c: FAINT, t: `flat → tie (${crossval.paired.ties})` },
        ].map((item, i) => (
          <g key={item.t}>
            <line
              x1={W - 306}
              y1={20 + i * 15}
              x2={W - 288}
              y2={20 + i * 15}
              stroke={item.c}
              strokeWidth={2}
            />
            <text x={W - 282} y={23.5 + i * 15} fontSize={10} fill={MUTED} fontFamily={SANS}>
              {item.t}
            </text>
          </g>
        ))}

        <rect
          x={pad.left}
          y={pad.top}
          width={plotW}
          height={plotH}
          fill={PAPER}
          stroke={RULE}
          strokeWidth={1}
        />
        {ticksFor(lo, hi, 7).map((t) => (
          <g key={t}>
            <line x1={pad.left} y1={y(t)} x2={pad.left + plotW} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text
              x={pad.left - 10}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <text
          transform={`translate(30 ${pad.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={11.5}
          fill={INK}
          fontFamily={SANS}
          fontWeight={500}
        >
          held-out accuracy
        </text>

        {/* Chance, drawn heavier than the grid so it reads as a threshold. */}
        <line
          x1={pad.left}
          y1={y(crossval.chance)}
          x2={pad.left + plotW}
          y2={y(crossval.chance)}
          stroke={MUTED}
          strokeWidth={1.5}
        />
        <text
          x={pad.left + plotW + 8}
          y={y(crossval.chance) + 3.5}
          fontSize={10}
          fill={MUTED}
          fontFamily={MONO}
        >
          chance {pctStr(crossval.chance)}
        </text>

        {[
          { x: xA, title: 'Full four-metric model' },
          { x: xB, title: 'Isovist area only' },
        ].map((col) => (
          <g key={col.title}>
            <text
              x={col.x}
              y={pad.top - 40}
              textAnchor="middle"
              fontSize={11.5}
              fill={INK}
              fontFamily={SANS}
              fontWeight={600}
            >
              {col.title}
            </text>
            <line x1={col.x} y1={pad.top} x2={col.x} y2={pad.top + plotH} stroke={RULE} strokeWidth={1} />
          </g>
        ))}

        {folds.map((f) => {
          const on = selected === f.site
          const dim = selected && !on
          return (
            <g key={f.site}>
              <line
                x1={xA}
                y1={y(f.full)}
                x2={xB}
                y2={y(f.baseline)}
                stroke={strokeFor(f.delta)}
                strokeWidth={on ? 2.6 : 1.3}
                opacity={dim ? 0.12 : on ? 1 : 0.55}
              />
              <circle
                cx={xA}
                cy={y(f.full)}
                r={on ? 5 : 3.4}
                fill={strokeFor(f.delta)}
                stroke={PAPER}
                strokeWidth={1.4}
                opacity={dim ? 0.12 : 1}
              />
              <circle
                cx={xB}
                cy={y(f.baseline)}
                r={on ? 5 : 3.4}
                fill={strokeFor(f.delta)}
                stroke={PAPER}
                strokeWidth={1.4}
                opacity={dim ? 0.12 : 1}
              />
            </g>
          )
        })}

        {/* The two means, drawn last so they sit above the folds. */}
        {[
          { x: xA, mean: crossval.mean_accuracy, anchor: 'start', dx: -60 },
          { x: xB, mean: crossval.area_only.mean_accuracy, anchor: 'end', dx: 60 },
        ].map((col) => (
          <g key={col.anchor}>
            <line x1={col.x - 54} y1={y(col.mean)} x2={col.x + 54} y2={y(col.mean)} stroke={PAPER} strokeWidth={5} />
            <line x1={col.x - 54} y1={y(col.mean)} x2={col.x + 54} y2={y(col.mean)} stroke={INK} strokeWidth={2.4} />
            <HaloText
              x={col.x + col.dx}
              y={y(col.mean) - 9}
              textAnchor={col.anchor}
              fontSize={11}
              fill={INK}
              fontFamily={MONO}
              fontWeight={600}
            >
              {`mean ${pctStr(col.mean)}`}
            </HaloText>
          </g>
        ))}

        {/* Read-out panel, parked in the right margin rather than floating over
            the plot: it never covers the lines, it cannot be chased off the
            edge by the cursor, and it exports with the figure. */}
        <g>
          <rect
            x={W - 152}
            y={pad.top + 8}
            width={140}
            height={110}
            rx={4}
            fill="#F7F5EF"
            stroke={RULE}
            strokeWidth={1}
          />
          {active ? (
            <>
              <text x={W - 140} y={pad.top + 28} fontSize={11.5} fill={ACCENT} fontFamily={SANS} fontWeight={600}>
                {names.get(active.site) ?? active.site}
              </text>
              <text x={W - 140} y={pad.top + 47} fontSize={10} fill={MUTED} fontFamily={MONO}>
                full {pctStr(active.full)}
              </text>
              <text x={W - 140} y={pad.top + 62} fontSize={10} fill={MUTED} fontFamily={MONO}>
                area {pctStr(active.baseline)}
              </text>
              <text
                x={W - 140}
                y={pad.top + 81}
                fontSize={11}
                fill={strokeFor(active.delta)}
                fontFamily={MONO}
                fontWeight={600}
              >
                Δ {active.delta >= 0 ? '+' : '−'}
                {Math.abs(active.delta * 100).toFixed(1)} pp
              </text>
              <text x={W - 140} y={pad.top + 99} fontSize={9.5} fill={FAINT} fontFamily={MONO}>
                {nBySite.get(active.site)} judgements
              </text>
            </>
          ) : (
            <text x={W - 140} y={pad.top + 32} fontSize={10} fill={FAINT} fontFamily={SANS}>
              <tspan x={W - 140} dy={0}>
                Hover a line for
              </tspan>
              <tspan x={W - 140} dy={15}>
                the plaza, both
              </tspan>
              <tspan x={W - 140} dy={15}>
                accuracies, and
              </tspan>
              <tspan x={W - 140} dy={15}>
                the difference in
              </tspan>
              <tspan x={W - 140} dy={15}>
                percentage points.
              </tspan>
            </text>
          )}
        </g>

        <PinHint
          x={pad.left}
          y={H - 14}
          pinned={pinned}
          name={pinned ? names.get(pinned) : ''}
          verb="a line"
        />
      </svg>
    </Figure>
  )
}

/* --------------------------------------- 6. H3 — the concealment comparison */

export function ConcealmentComparison({ rows, significanceThreshold = 0.47 }) {
  const W = 760
  const ROW = 26
  const GAP = 22
  const pad = { top: 82, right: 176, bottom: 62, left: 168 }
  const plotW = W - pad.left - pad.right
  const H = pad.top + rows.length * (ROW + GAP) + pad.bottom
  const MAX = 0.6
  const x = (v) => pad.left + (v / MAX) * plotW

  return (
    <Figure
      title="H3 — which measured dimension tracks perceived concealment?"
      filename="h3-perceived-concealment"
      caption="All four metrics correlated against the same percept: how concealing participants judged each plaza to be. This is the comparison the hypothesis needs — not each metric against its own scale, but every metric against this one scale, so they can be ranked against each other."
      note="Correlations across the 18 plazas between the metric and the reversed occlusivity rating (the “clear sightlines, nothing hidden” end becomes low concealment). Bars show strength, |r|; the exact signed value is printed beside each, and the direction is named in the row label. An association is not causal evidence and none is claimed: these are 18 squares, geometry and ratings were collected on the same plazas, and nothing was manipulated."
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 560 }}
        role="img"
        aria-label="Correlation of each metric with perceived concealment, ranked by strength"
      >
        <text x={20} y={24} fontSize={11.5} fill={INK} fontFamily={SANS} fontWeight={600}>
          Correlation with perceived concealment, strongest first
        </text>
        <text x={20} y={41} fontSize={10.5} fill={MUTED} fontFamily={SANS}>
          The metric named “occlusivity” is not the closest account of the percept it was named for.
        </text>

        {ticksFor(0, MAX, 6).map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              y1={pad.top - 16}
              x2={x(t)}
              y2={H - pad.bottom + 4}
              stroke={t === 0 ? RULE : GRID}
              strokeWidth={t === 0 ? 1.25 : 1}
            />
            <text
              x={x(t)}
              y={H - pad.bottom + 18}
              textAnchor="middle"
              fontSize={9.5}
              fill={FAINT}
              fontFamily={MONO}
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <text
          x={pad.left + plotW / 2}
          y={H - 26}
          textAnchor="middle"
          fontSize={10.5}
          fill={MUTED}
          fontFamily={SANS}
        >
          strength of association |r| across the 18 plazas
        </text>

        {/* The bar every one of them falls short of. */}
        <line
          x1={x(significanceThreshold)}
          y1={pad.top - 22}
          x2={x(significanceThreshold)}
          y2={H - pad.bottom + 4}
          stroke={MUTED}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text
          x={x(significanceThreshold)}
          y={pad.top - 28}
          textAnchor="middle"
          fontSize={9.5}
          fill={MUTED}
          fontFamily={MONO}
        >
          |r| ≈ {significanceThreshold} needed for p &lt; 0.05 at n = 18
        </text>

        {rows.map((row, i) => {
          const top = pad.top + i * (ROW + GAP)
          const focus = row.metric === 'occlusivity'
          return (
            <g key={row.metric}>
              <text
                x={pad.left - 16}
                y={top + ROW / 2 - 1}
                textAnchor="end"
                fontSize={12}
                fill={INK}
                fontFamily={SANS}
                fontWeight={focus ? 600 : 500}
              >
                {row.label}
              </text>
              <text
                x={pad.left - 16}
                y={top + ROW / 2 + 13}
                textAnchor="end"
                fontSize={9.5}
                fill={FAINT}
                fontFamily={MONO}
              >
                more → felt {row.direction === 'more concealing' ? 'more concealing' : 'more open'}
              </text>
              {focus && (
                <rect x={pad.left} y={top - 5} width={plotW} height={ROW + 10} fill={WASH} opacity={0.7} />
              )}
              <rect
                x={pad.left}
                y={top}
                width={Math.max(2, x(row.aligned) - pad.left)}
                height={ROW}
                rx={3}
                fill={focus ? ACCENT : COOL}
                opacity={focus ? 0.95 : 0.85}
              />
              <text
                x={x(row.aligned) + 12}
                y={top + ROW / 2 + 4.5}
                fontSize={12}
                fill={INK}
                fontFamily={MONO}
                fontWeight={600}
              >
                r = {signed(row.r, 3)}
              </text>
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

/* ------------------------------------------------ 7. convergence scatter */

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
          const sx = (v) =>
            ox + pad.left + ((v - bx[0]) / (bx[1] - bx[0] || 1)) * (CELL - pad.left - pad.right)
          const sy = (v) =>
            H - pad.bottom - ((v - by[0]) / (by[1] - by[0])) * (H - pad.top - pad.bottom)
          const fit = linearFit(xs, ys)
          const strong = scale.pearson_p_holm < 0.05 && scale.pearson_aligned > 0

          return (
            <g key={scale.metric}>
              <text x={ox + pad.left} y={16} fontSize={11} fontWeight={600} fill={INK} fontFamily={SANS}>
                {scale.label}
              </text>
              <text x={ox + pad.left} y={28} fontSize={10} fill={strong ? OK : NEG} fontFamily={MONO}>
                r = {fmt(scale.pearson_aligned, 3)}
              </text>

              <line
                x1={ox + pad.left}
                y1={H - pad.bottom}
                x2={ox + CELL - pad.right}
                y2={H - pad.bottom}
                stroke={RULE}
              />
              <line x1={ox + pad.left} y1={pad.top} x2={ox + pad.left} y2={H - pad.bottom} stroke={RULE} />
              {[1, 4, 7].map((t) => (
                <text
                  key={t}
                  x={ox + pad.left - 7}
                  y={sy(t) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={FAINT}
                  fontFamily={MONO}
                >
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
                <circle
                  key={p.site_id}
                  cx={sx(p.computed)}
                  cy={sy(p.mean_rating)}
                  r={3.4}
                  fill={strong ? COOL : MUTED}
                  stroke={PAPER}
                  strokeWidth={0.9}
                  opacity={0.8}
                />
              ))}

              <text
                x={ox + CELL / 2}
                y={H - 22}
                textAnchor="middle"
                fontSize={9}
                fill={FAINT}
                fontFamily={MONO}
              >
                computed →
              </text>
              <text
                x={ox + CELL / 2}
                y={H - 9}
                textAnchor="middle"
                fontSize={9}
                fill={FAINT}
                fontFamily={MONO}
              >
                ↑ mean rating 1–7
              </text>
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

/* ------------------------------------------------ 8. correlation matrix */

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
    const [cr, cg, cb] = r >= 0 ? [31, 95, 174] : [162, 56, 42]
    const mix = (c) => Math.round(255 - (255 - c) * t)
    return `rgb(${mix(cr)}, ${mix(cg)}, ${mix(cb)})`
  }

  return (
    <Figure
      title="How independent are the four dimensions?"
      filename="metric-correlation-matrix"
      caption="Correlations between the metrics themselves across the 18 plazas — the scatterplot matrix above, reduced to one number per pair. Strong values off the diagonal mean two dimensions are partly measuring the same thing, which is what limits how much the ensemble can add over its best single member."
      note="Area and enclosure at −0.64 is the consequential one: larger squares in this corpus are systematically less enclosed, so knowing one already tells you much about the other. That is a property of European urban form, not of the metrics."
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxWidth: 560 }}
        role="img"
        aria-label="Correlation matrix between the four metrics"
      >
        {METRICS.map((m, j) => (
          <text
            key={m}
            x={label + CELL * j + CELL / 2}
            y={24}
            textAnchor="middle"
            fontSize={10}
            fill={MUTED}
            fontFamily={SANS}
          >
            {SHORT_LABEL[m] ?? METRIC_LABELS[m]}
          </text>
        ))}
        {METRICS.map((m, i) => (
          <g key={m}>
            <text
              x={label - 10}
              y={34 + CELL * i + CELL / 2 + 4}
              textAnchor="end"
              fontSize={10}
              fill={MUTED}
              fontFamily={SANS}
            >
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
                    fontFamily={MONO}
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
