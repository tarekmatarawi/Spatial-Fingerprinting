import { useMemo } from 'react'
import * as THREE from 'three'

// Renders the live output of castIsovist(): a flat teal polygon for the
// visible area (vantage point + ray endpoints, matching the fan used for the
// Area/Perimeter/Compactness/Occlusivity formulas), plus an amber ribbon that
// rises from the ground to each hit building's height along wall-hit rays,
// breaking wherever a ray is "open" (reaches 200m with no obstacle).
export function IsovistOverlay({ result }) {
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

  if (!result) return null

  return (
    <group>
      {isovistGeometry && (
        <mesh geometry={isovistGeometry}>
          <meshBasicMaterial
            color="#5748b8"
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {ribbonGeometry && (
        <mesh geometry={ribbonGeometry}>
          <meshBasicMaterial
            color="#c04030"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
