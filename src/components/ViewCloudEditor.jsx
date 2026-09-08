import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuLock, LuTrash2, LuUndo2 } from 'react-icons/lu'

import { castIsovist, buildEdgeIndex, bearingTo } from '@/lib/isovist'
import { pointInPolygon } from '@/lib/site'
import { CLOUD_FOV_DEG, CLOUD_RAY_COUNT, CLOUD_RANGE_M, TARGET_PER_SITE } from '@/lib/viewClouds'

// P7's marker editor — a top-down plan of one plaza that you place 120° views on.
//
// WHY A PLAN AND NOT THE 3D VIEWER. The canonical fingerprints were captured in
// the 3D viewer, orbiting to match a Street View camera, and that is right for
// one careful reading per plaza. A view cloud needs eight per plaza across
// eighteen plazas, and the thing being judged is different: not "does this match
// a photograph" but "are these positions spread across the plaza the way a
// person moving through it would stand". That is a question about plan layout,
// and a plan is the drawing that answers it — you can see the whole distribution
// at once, which you cannot from inside a 3D scene.
//
// The measurement is identical either way: the same castIsovist, the same 120
// rays over 120°, the same 200 m range. Only the interface for choosing where
// to stand differs.

// A vantage point must be a place a person could actually be. Inside the plaza
// boundary, and not standing in a wall — the same 1 m facade clearance the P6
// grid uses, so the two layers agree about what counts as standable ground.
//
// This rule governs NEWLY PLACED markers only, and deliberately does not apply
// to the canonical reading composed in as view 1. Two of the eighteen canonical
// vantages (Marktplatz Heidelberg, Hauptmarkt Trier) sit just outside their
// plaza boundary, because the capture protocol put them where the Street View
// camera stood and a Street View camera stands in the street. Those readings
// are correct under their own protocol; retro-fitting this rule onto them would
// mean either moving a P5 fingerprint or dropping it from its own cloud.
const CLEARANCE_M = 1

export function ViewCloudEditor({
  site,
  geometry,
  markers,
  windowRadius,
  onPlace,
  onDelete,
  readOnly = false,
}) {
  const svgRef = useRef(null)
  // 'vantage' — the next click drops a point; 'aim' — it sets that point's heading.
  const [pending, setPending] = useState(null)
  const [hover, setHover] = useState(null)
  const [fitToPlaza, setFitToPlaza] = useState(false)

  // Placing a point is only half a reading; leaving the plaza mid-placement
  // should not leave a half-marker behind.
  useEffect(() => {
    setPending(null)
    setHover(null)
  }, [site?.id])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Built once per plaza and reused for every ray cast on it. Without this the
  // live cone preview re-scans every building edge on every mouse move; with it
  // a cast walks only the grid cells the ray crosses. Same hits either way —
  // test/isovist.test.js asserts the indexed and brute-force paths agree
  // exactly — so this is purely what makes the preview follow the cursor.
  const index = useMemo(
    () => (geometry ? buildEdgeIndex(geometry.buildings) : null),
    [geometry]
  )

  // The same fixed window P6's field maps use, so a plaza is the same size here
  // as it is there and a line weight means the same thing on both pages. Only
  // the centre moves between sites.
  //
  // The tradeoff is that a small square sits small in the frame, which makes
  // precise clicking harder — hence the "fit plaza" toggle, which crops to this
  // plaza for placement only. Corpus scale is the default because that is what
  // a figure should be exported at.
  const view = useMemo(() => {
    if (!geometry) return null
    const r = fitToPlaza ? geometry.boundaryRadius + 30 : windowRadius
    const { x, y } = geometry.centroid
    return { minX: x - r, minY: y - r, size: r * 2 }
  }, [geometry, fitToPlaza, windowRadius])

  // Marks and labels are sized in map units, so at corpus scale they must not
  // be the same numbers that suited a tight crop — a 1.4 m dot is legible on a
  // 60 m window and invisible on a 230 m one. Everything decorative scales with
  // the window; the geometry itself, of course, does not.
  const k = view ? view.size / 230 : 1

  // Client coordinates → plaza-local metres. Goes through the SVG's own screen
  // matrix rather than arithmetic on getBoundingClientRect: the viewBox may be
  // letterboxed inside the element, and only the matrix accounts for that.
  const toLocal = useCallback((event) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = pt.matrixTransform(ctm.inverse())
    // The drawing negates y so north is up; undo that on the way back in.
    return { x: p.x, y: -p.y }
  }, [])

  const standable = useCallback(
    (point) => {
      if (!geometry) return false
      if (geometry.boundary && !pointInPolygon(point, geometry.boundary)) return false
      for (const b of geometry.buildings) {
        if (pointInPolygon(point, b.footprint)) return false
        if (distanceToRing(point, b.footprint) < CLEARANCE_M) return false
      }
      return true
    },
    [geometry]
  )

  // The live 120° wedge, either for the marker being aimed or for a hover
  // preview at the cursor. Recomputed as the cursor moves — 120 rays through the
  // edge index, which is fast enough to feel like a shadow rather than a lag.
  const preview = useMemo(() => {
    if (!geometry) return null
    if (pending && hover) {
      const heading = bearingTo(pending, hover)
      return {
        vantage: pending,
        heading,
        result: castIsovist(pending, heading, geometry.buildings, {
          fov: CLOUD_FOV_DEG,
          rayCount: CLOUD_RAY_COUNT,
          range: CLOUD_RANGE_M,
          index,
        }),
      }
    }
    return null
  }, [pending, hover, geometry, index])

  function handleClick(event) {
    if (readOnly || !geometry) return
    const point = toLocal(event)
    if (!point) return

    if (pending) {
      const heading = bearingTo(pending, point)
      const result = castIsovist(pending, heading, geometry.buildings, {
        fov: CLOUD_FOV_DEG,
        rayCount: CLOUD_RAY_COUNT,
        range: CLOUD_RANGE_M,
        index,
      })
      onPlace(pending, heading, result)
      setPending(null)
      return
    }

    if (!standable(point)) return
    setPending(point)
  }

  if (!geometry || !view) {
    return <p className="font-mono text-xs text-ink-faint">No geometry for this plaza.</p>
  }

  const placed = markers.length
  const remaining = Math.max(0, TARGET_PER_SITE - placed)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <figure className="rounded-lg border border-line bg-paper p-3">
        <svg
          ref={svgRef}
          viewBox={`${view.minX} ${-(view.minY + view.size)} ${view.size} ${view.size}`}
          className={`w-full ${readOnly ? '' : 'cursor-crosshair'}`}
          style={{ aspectRatio: '1 / 1' }}
          onClick={handleClick}
          onMouseMove={(e) => setHover(toLocal(e))}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${site.name} plan — ${placed} of ${TARGET_PER_SITE} views placed`}
        >
          {/* y negated throughout so north sits at the top, as on any map. */}
          {geometry.buildings.map((b, i) => (
            <polygon
              key={i}
              points={b.footprint.map((p) => `${p.x},${-p.y}`).join(' ')}
              className="fill-surface stroke-line-strong"
              strokeWidth={0.4 * k}
            />
          ))}
          {geometry.boundary && (
            <polygon
              points={geometry.boundary.map((p) => `${p.x},${-p.y}`).join(' ')}
              fill="none"
              className="stroke-redline"
              strokeWidth={0.8 * k}
              strokeDasharray={`${3 * k} ${2 * k}`}
            />
          )}

          {/* Saved views: the isovist wedge is not redrawn for each (eight
              overlapping fans is an unreadable smear) — a short heading tick
              carries the direction instead, which is what the eye needs to
              judge whether the cloud actually looks around the plaza. */}
          {markers.map((m, i) => (
            <SavedMarker key={m.id ?? i} marker={m} n={i + 1} k={k} />
          ))}

          {preview && (
            <>
              <polygon
                points={wedgePoints(preview.result)}
                fill="var(--color-accent)"
                opacity={0.22}
                pointerEvents="none"
              />
              <polyline
                points={wedgePoints(preview.result)}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={0.4 * k}
                pointerEvents="none"
              />
            </>
          )}

          {pending && (
            <circle
              cx={pending.x}
              cy={-pending.y}
              r={1.6 * k}
              fill="var(--color-redline)"
              pointerEvents="none"
            />
          )}
        </svg>
        <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-faint">
          <span>
            {site.name} · {placed}/{TARGET_PER_SITE} views · 120° at {CLOUD_RANGE_M} m
          </span>
          <button
            type="button"
            onClick={() => setFitToPlaza((v) => !v)}
            className="rounded border border-line px-1.5 py-0.5 text-ink-faint transition-colors hover:border-line-strong hover:text-ink"
            title={
              fitToPlaza
                ? 'Cropped to this plaza — easier to click, not comparable with other plazas'
                : 'Same scale as every other plaza map, including P6'
            }
          >
            {fitToPlaza ? 'fit plaza' : 'corpus scale'}
          </button>
          <span className={pending ? 'text-primary' : ''}>
            {readOnly
              ? 'read-only — run npm run dev to place views'
              : pending
                ? 'click again to aim · Esc to cancel'
                : 'click inside the plaza to place a view'}
          </span>
        </figcaption>
      </figure>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h3 className="text-sm font-semibold text-ink">Views in this cloud</h3>
          <span className="font-mono text-xs text-ink-faint">
            {remaining > 0 ? `${remaining} to go` : 'complete'}
          </span>
        </div>
        <ol className="mt-2 space-y-1">
          {markers.map((m, i) => (
            <li
              key={m.id ?? i}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 font-mono text-[11px] text-ink-muted odd:bg-surface/60"
            >
              <span className="w-4 shrink-0 text-ink-faint">{i + 1}</span>
              <span className="w-9 shrink-0 tabular-nums">
                {Math.round(m.direction_deg)}°
              </span>
              <span className="flex-1 truncate tabular-nums">
                {Math.round(m.area_m2).toLocaleString()} m²
              </span>
              {m.locked ? (
                <LuLock
                  aria-label="canonical reading — fixed by the P5 capture protocol"
                  className="h-3 w-3 shrink-0 text-ink-faint"
                />
              ) : (
                !readOnly && (
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    aria-label={`Delete view ${i + 1}`}
                    className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-redline-wash hover:text-redline"
                  >
                    <LuTrash2 className="h-3 w-3" />
                  </button>
                )
              )}
            </li>
          ))}
        </ol>

        {pending && (
          <button
            type="button"
            onClick={() => setPending(null)}
            className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-ink-faint hover:text-ink"
          >
            <LuUndo2 className="h-3 w-3" /> cancel this placement
          </button>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          View 1 is the canonical fingerprint — the Street View-matched reading P5 was fitted on. It
          is read live from <code className="font-mono">results.json</code> and cannot be edited
          here. At a few plazas it sits just outside the boundary, where the Street View camera
          stood; new views must be placed inside.
        </p>
      </div>
    </div>
  )
}

// A saved view: a dot at the vantage with a tick showing where it faces, and its
// number, so the list beside the plan and the plan itself refer to each other.
function SavedMarker({ marker, n, k = 1 }) {
  const rad = (marker.direction_deg * Math.PI) / 180
  const len = 7 * k
  const x2 = marker.local_x + Math.sin(rad) * len
  const y2 = marker.local_y + Math.cos(rad) * len
  const colour = marker.locked ? 'var(--color-redline)' : 'var(--color-primary)'
  return (
    <g pointerEvents="none">
      <line
        x1={marker.local_x}
        y1={-marker.local_y}
        x2={x2}
        y2={-y2}
        stroke={colour}
        strokeWidth={0.6 * k}
      />
      <circle cx={marker.local_x} cy={-marker.local_y} r={1.4 * k} fill={colour} />
      <text
        x={marker.local_x + 2.2 * k}
        y={-marker.local_y - 2 * k}
        fill={colour}
        fontSize={4 * k}
        fontFamily="var(--font-mono, monospace)"
      >
        {n}
      </text>
    </g>
  )
}

// The isovist wedge as SVG points. A 120° cast is an open fan, so the polygon
// closes back through the vantage point — the ray endpoints alone are not a
// loop. (The 360° case, which is already closed, does not arise on this page.)
function wedgePoints(result) {
  const pts = result.rays.map((r) => `${r.point.x},${-r.point.y}`)
  return [`${result.vantage.x},${-result.vantage.y}`, ...pts].join(' ')
}

// Shortest distance from a point to a closed polygon's edges. Used for the
// facade clearance test — a point can sit outside every footprint and still be
// standing in a doorway, which is not a place to measure a plaza from.
function distanceToRing(point, ring) {
  let min = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distanceToSegment(point, ring[j], ring[i])
    if (d < min) min = d
  }
  return min
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
