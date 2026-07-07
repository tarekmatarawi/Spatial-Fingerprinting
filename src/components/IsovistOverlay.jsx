import { useMemo } from 'react'
import * as THREE from 'three'

// Renders the isovist as a semi-transparent blue polygon: a triangle fan
// from the click origin out to each ray's hit point.
export function IsovistOverlay({ origin, points }) {
  const geometry = useMemo(() => {
    if (!origin || !points || points.length < 3) return null

    const positions = [origin.x, 0.15, origin.z]
    for (const p of points) positions.push(p.x, 0.15, p.z)

    const indices = []
    for (let i = 1; i <= points.length; i++) {
      const next = i === points.length ? 1 : i + 1
      indices.push(0, i, next)
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    return geom
  }, [origin, points])

  if (!geometry) return null

  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[origin.x, 0.2, origin.z]}>
        <cylinderGeometry args={[1.5, 1.5, 2, 16]} />
        <meshBasicMaterial color="#1d4ed8" />
      </mesh>
    </group>
  )
}
