import { useMemo } from 'react'
import * as THREE from 'three'
import { STREET_WIDTH } from '@/lib/config'

// Draws every street as a flat ribbon (a quad per segment) sitting just
// above the ground plane, merged into a single geometry for performance.
export function Streets({ streets }) {
  const geometry = useMemo(() => {
    const positions = []
    const indices = []
    let vertexOffset = 0

    for (const street of streets) {
      const pts = street.points
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const len = Math.hypot(dx, dz)
        if (len < 1e-6) continue

        const nx = (-dz / len) * (STREET_WIDTH / 2)
        const nz = (dx / len) * (STREET_WIDTH / 2)

        positions.push(
          a.x + nx, 0.05, a.z + nz,
          a.x - nx, 0.05, a.z - nz,
          b.x - nx, 0.05, b.z - nz,
          b.x + nx, 0.05, b.z + nz
        )
        indices.push(
          vertexOffset, vertexOffset + 2, vertexOffset + 1,
          vertexOffset, vertexOffset + 3, vertexOffset + 2
        )
        vertexOffset += 4
      }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    return geom
  }, [streets])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#a7acb8" roughness={1} />
    </mesh>
  )
}
