import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Renders the live output of castIsovist(): a flat orange polygon for the
// visible area (vantage point + ray endpoints, matching the fan used for the
// Area/Perimeter/Compactness/Occlusivity formulas), a crisp outline along the
// isovist edge, plus a redline ribbon that rises from the ground to each hit
// building's height along wall-hit rays, breaking wherever a ray is "open"
// (reaches 200m with no obstacle).
//
// When a vantage point or direction is set, the whole figure sweeps into place
// across the view cone instead of popping in — implemented with drawRange on
// the shared ray ordering, so the animation is pure playback: no geometry is
// rebuilt per frame and the metrics never depend on it.
//
// `dim` renders a saved point's projection faintly (and statically), so several
// can be overlaid at once without drowning out the live (active) one.

const SWEEP_MS = 620
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function IsovistOverlay({ result, dim = false }) {
  const isovistOpacity = dim ? 0.12 : 0.26
  const ribbonOpacity = dim ? 0.18 : 0.38

  const rayCount = result?.rays.length ?? 0
  // A full sweep closes on itself: the last ray is one angular step short of the
  // first, and the figure has to be closed between them. A wedge instead closes
  // back through the vantage point along its two straight side edges. Getting
  // this wrong leaves a one-step notch in an otherwise complete ring — a 360°
  // isovist drawn as 359°.
  const closed = result != null && result.fov >= 360 - 1e-9

  const isovistGeometry = useMemo(() => {
    if (!result || result.rays.length < 2) return null
    const { vantage, rays } = result

    const positions = [vantage.x, vantage.y, 0.06]
    for (const r of rays) positions.push(r.point.x, r.point.y, 0.06)

    // Triangle fan from the vantage point. Index 0 is the vantage, 1..n the ray
    // endpoints in angular order.
    const indices = []
    for (let i = 1; i < rays.length; i++) indices.push(0, i, i + 1)
    // Closing triangle: last endpoint back round to the first. Only a full
    // sweep has one — a wedge ends at its final ray.
    if (closed) indices.push(0, rays.length, 1)

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    return geom
  }, [result, closed])

  // The isovist edge as a line strip: vantage → each ray endpoint → vantage.
  // Drawn crisply so the polygon reads as a measured figure, not a soft blob.
  const outlineGeometry = useMemo(() => {
    if (!result || result.rays.length < 2) return null
    const { vantage, rays } = result
    const pts = []
    // A wedge's outline runs out from the vantage, round the arc, and back —
    // those two radii are real edges of the figure and are counted in its
    // perimeter. A ring has no such edges: it is just the closed loop of
    // endpoints, so drawing spokes would invent boundary that isn't there.
    if (!closed) pts.push(new THREE.Vector3(vantage.x, vantage.y, 0.08))
    for (const r of rays) pts.push(new THREE.Vector3(r.point.x, r.point.y, 0.08))
    pts.push(
      closed
        ? new THREE.Vector3(rays[0].point.x, rays[0].point.y, 0.08)
        : new THREE.Vector3(vantage.x, vantage.y, 0.08)
    )
    const geom = new THREE.BufferGeometry()
    geom.setFromPoints(pts)
    return geom
  }, [result, closed])

  const ribbonGeometry = useMemo(() => {
    if (!result) return null
    const { rays } = result
    const positions = []

    // A ring wraps, so it has one more segment than a wedge: the pair spanning
    // the last ray back to the first.
    const segments = closed ? rays.length : rays.length - 1
    for (let i = 0; i < segments; i++) {
      const a = rays[i]
      const b = rays[(i + 1) % rays.length]
      if (!a.wall || !b.wall) continue

      const aBot = [a.point.x, a.point.y, 0]
      const aTop = [a.point.x, a.point.y, a.height]
      const bBot = [b.point.x, b.point.y, 0]
      const bTop = [b.point.x, b.point.y, b.height]

      positions.push(...aBot, ...bBot, ...bTop)
      positions.push(...aBot, ...bTop, ...aTop)
    }

    if (!positions.length) return null
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geom
  }, [result, closed])

  useEffect(
    () => () => {
      isovistGeometry?.dispose()
      outlineGeometry?.dispose()
      ribbonGeometry?.dispose()
    },
    [isovistGeometry, outlineGeometry, ribbonGeometry]
  )

  // ---- Sweep playback -------------------------------------------------------
  const sweep = useRef({ start: null, done: true })

  // A new result (fresh vantage or re-aim) restarts the sweep; saved (dim)
  // overlays and reduced-motion users get the completed figure immediately.
  useEffect(() => {
    if (!result) return
    if (dim || prefersReducedMotion()) {
      sweep.current = { start: null, done: true }
      applySweep(1, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount, closed)
      return
    }
    sweep.current = { start: null, done: false }
    applySweep(0, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount, closed)
  }, [result, dim, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount, closed])

  useFrame(() => {
    const s = sweep.current
    if (s.done) return
    if (s.start === null) s.start = performance.now()
    const t = Math.min((performance.now() - s.start) / SWEEP_MS, 1)
    const eased = 1 - (1 - t) ** 3
    applySweep(eased, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount, closed)
    if (t >= 1) s.done = true
  })

  if (!result) return null

  return (
    <group>
      {isovistGeometry && (
        <mesh geometry={isovistGeometry}>
          <meshBasicMaterial
            color="#ea580c"
            transparent
            opacity={isovistOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {outlineGeometry && (
        <line geometry={outlineGeometry}>
          <lineBasicMaterial
            color="#ea580c"
            transparent
            opacity={dim ? 0.18 : 0.65}
            depthWrite={false}
          />
        </line>
      )}
      {ribbonGeometry && (
        <mesh geometry={ribbonGeometry}>
          <meshBasicMaterial
            color="#b91c1c"
            transparent
            opacity={ribbonOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

// Maps sweep progress onto each geometry's drawRange along the shared ray
// order: fan triangles (3 indices per ray step), outline vertices, and ribbon
// quads (6 vertices per wall segment) all reveal together, left edge of the
// cone to the right.
function applySweep(t, fan, outline, ribbon, rayCount, closed = false) {
  if (fan) {
    // A ring has one triangle per ray (the last wraps); a wedge has one fewer.
    const steps = Math.max(closed ? rayCount : rayCount - 1, 0)
    fan.setDrawRange(0, t >= 1 ? Infinity : Math.floor(t * steps) * 3)
  }
  if (outline) {
    // Ring: rayCount endpoints + the repeated first. Wedge: a leading vantage
    // vertex as well, plus the trailing one.
    const total = closed ? rayCount + 1 : rayCount + 2
    outline.setDrawRange(0, t >= 1 ? Infinity : Math.floor(t * total))
  }
  if (ribbon) {
    const quads = ribbon.attributes.position.count / 6
    ribbon.setDrawRange(0, t >= 1 ? Infinity : Math.floor(t * quads) * 6)
  }
}
