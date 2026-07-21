import { useMemo } from 'react'
import { projectSite } from '@/lib/site'
import { castIsovist, bearingTo } from '@/lib/isovist'

// The landing hero: a figure-ground plan of a real site from sites.json with a
// live isovist computed by the actual Phase-3 ray-casting engine — the drawing
// is the research, not an illustration of it. Rays sweep across the view cone
// on load (per-ray animation delay), then the visible-area fan washes in.
//
// Rendered as plain SVG in plan convention: north up (the projected +Y axis is
// flipped, since SVG y grows downward), hairline strokes, ink on paper.
export function FigureGround({ site, radius = 240, className = '' }) {
  const drawing = useMemo(() => {
    try {
      const data = projectSite(site)
      const c = data.centroid

      // Keep only buildings near the plaza so the SVG stays light; footprints
      // become path strings in local metres, recentered on the plaza.
      const buildings = []
      for (const b of data.buildings) {
        const near = b.footprint.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= radius)
        if (!near) continue
        buildings.push(
          b.footprint.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x - c.x)} ${r1(p.y - c.y)}`).join('') + 'Z'
        )
      }

      const boundary = data.boundary
        ? data.boundary
            .map((p, i) => `${i ? 'L' : 'M'}${r1(p.x - c.x)} ${r1(p.y - c.y)}`)
            .join('') + 'Z'
        : null

      // A real reading: stand at the plaza centre, face its long axis.
      const vantage = { x: c.x, y: c.y }
      const direction = data.boundary
        ? bearingTo(vantage, farthestPoint(vantage, data.boundary))
        : 0
      const iso = castIsovist(vantage, direction, data.buildings)

      const fan =
        'M0 0' +
        iso.rays.map((r) => `L${r1(r.point.x - c.x)} ${r1(r.point.y - c.y)}`).join('') +
        'Z'
      const rays = iso.rays
        .filter((_, i) => i % 3 === 0)
        .map((r) => ({ x: r1(r.point.x - c.x), y: r1(r.point.y - c.y), wall: r.wall }))

      return { buildings, boundary, fan, rays }
    } catch {
      return null // site not projectable yet (no centre set) — render nothing
    }
  }, [site, radius])

  if (!drawing) return null

  const R = radius
  const gridLines = []
  for (let v = -200; v <= 200; v += 50) gridLines.push(v)

  return (
    <svg
      viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
      className={className}
      role="img"
      aria-label={`Figure-ground plan of ${site.name}, ${site.city}, with a computed isovist field`}
    >
      {/* Plan space: flip Y so projected north points up */}
      <g transform="scale(1,-1)">
        {/* Drafting-sheet grid, 50 m module */}
        <g stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke">
          {gridLines.map((v) => (
            <g key={v}>
              <line x1={v} y1={-R} x2={v} y2={R} vectorEffect="non-scaling-stroke" />
              <line x1={-R} y1={v} x2={R} y2={v} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>

        {/* Plaza boundary — redline markup */}
        {drawing.boundary && (
          <path
            d={drawing.boundary}
            fill="var(--color-accent)"
            fillOpacity="0.06"
            stroke="var(--color-accent)"
            strokeWidth="1.25"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Building mass — the figure of the figure-ground */}
        <g fill="var(--color-ink)" fillOpacity="0.92">
          {drawing.buildings.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        {/* Isovist: sweeping rays, then the visible-area fan */}
        <g stroke="var(--color-accent)" strokeWidth="0.75" strokeOpacity="0.5">
          {drawing.rays.map((r, i) => (
            <line
              key={i}
              x1="0"
              y1="0"
              x2={r.x}
              y2={r.y}
              pathLength="1"
              vectorEffect="non-scaling-stroke"
              className="hero-ray"
              style={{ animationDelay: `${120 + i * 14}ms` }}
            />
          ))}
        </g>
        <path d={drawing.fan} className="hero-fan" fill="var(--color-accent)" fillOpacity="0.2" />

        {/* Vantage point */}
        <circle className="hero-vantage" cx="0" cy="0" r="4" fill="var(--color-redline)" />
      </g>

      {/* Annotations live outside the flipped group so text reads upright */}
      <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--color-ink-muted)">
        {/* North arrow */}
        <g transform={`translate(${R - 26}, ${-R + 30})`}>
          <line x1="0" y1="12" x2="0" y2="-10" stroke="var(--color-ink-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d="M0 -14 L4 -5 L-4 -5 Z" fill="var(--color-redline)" />
          <text x="8" y="-4">N</text>
        </g>
        {/* Scale bar: 100 m in two 50 m bays */}
        <g transform={`translate(${-R + 20}, ${R - 24})`}>
          <rect x="0" y="0" width="50" height="4" fill="var(--color-ink)" />
          <rect x="50" y="0" width="50" height="4" fill="none" stroke="var(--color-ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x="0" y="16">0</text>
          <text x="44" y="16">50</text>
          <text x="90" y="16">100 m</text>
        </g>
      </g>
    </svg>
  )
}

function farthestPoint(from, ring) {
  let best = ring[0]
  let bestD = -1
  for (const p of ring) {
    const d = Math.hypot(p.x - from.x, p.y - from.y)
    if (d > bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

function r1(v) {
  return Math.round(v * 10) / 10
}
