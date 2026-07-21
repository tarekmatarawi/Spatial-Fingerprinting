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

  const isovistGeometry = useMemo(() => {
    if (!result || result.rays.length < 2) return null
    const { vantage, rays } = result

    const positions = [vantage.x, vantage.y, 0.06]
    for (const r of rays) positions.push(r.point.x, r.point.y, 0.06)

    const indices = []
    for (let i = 1; i < rays.length; i++) indices.push(0, i, i + 1)

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    return geom
  }, [result])

  // The isovist edge as a line strip: vantage → each ray endpoint → vantage.
  // Drawn crisply so the polygon reads as a measured figure, not a soft blob.
  const outlineGeometry = useMemo(() => {
    if (!result || result.rays.length < 2) return null
    const { vantage, rays } = result
    const pts = [new THREE.Vector3(vantage.x, vantage.y, 0.08)]
    for (const r of rays) pts.push(new THREE.Vector3(r.point.x, r.point.y, 0.08))
    pts.push(new THREE.Vector3(vantage.x, vantage.y, 0.08))
    const geom = new THREE.BufferGeometry()
    geom.setFromPoints(pts)
    return geom
  }, [result])

  const ribbonGeometry = useMemo(() => {
    if (!result) return null
    const { rays } = result
    const positions = []

    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i]
      const b = rays[i + 1]
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
  }, [result])

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
      applySweep(1, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount)
      return
    }
    sweep.current = { start: null, done: false }
    applySweep(0, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount)
  }, [result, dim, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount])

  useFrame(() => {
    const s = sweep.current
    if (s.done) return
    if (s.start === null) s.start = performance.now()
    const t = Math.min((performance.now() - s.start) / SWEEP_MS, 1)
    const eased = 1 - (1 - t) ** 3
    applySweep(eased, isovistGeometry, outlineGeometry, ribbonGeometry, rayCount)
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
function applySweep(t, fan, outline, ribbon, rayCount) {
  if (fan) {
    const steps = Math.max(rayCount - 1, 0)
    fan.setDrawRange(0, t >= 1 ? Infinity : Math.floor(t * steps) * 3)
  }
  if (outline) {
    // vantage + rayCount endpoints + closing vantage vertex
    outline.setDrawRange(0, t >= 1 ? Infinity : 1 + Math.floor(t * (rayCount + 1)))
  }
  if (ribbon) {
    const quads = ribbon.attributes.position.count / 6
    ribbon.setDrawRange(0, t >= 1 ? Infinity : Math.floor(t * quads) * 6)
  }
}
