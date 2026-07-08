import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Extrudes each building footprint into a solid, then merges every building
// into a single mesh (and a single outline) so the whole city is drawn in
// just two draw calls instead of thousands.
export function Buildings({ buildings }) {
  const { fillGeometry, edgeGeometry } = useMemo(() => {
    const fillGeoms = []
    const edgeGeoms = []

    for (const building of buildings) {
      // The footprint's z is negated here, and undone again by rotateX below,
      // so the final mesh lines up with streets/ground without a mirror flip.
      const shape = new THREE.Shape(
        building.footprint.map((p) => new THREE.Vector2(p.x, -p.z))
      )
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: building.height,
        bevelEnabled: false,
      })
      geometry.rotateX(-Math.PI / 2)
      fillGeoms.push(geometry)
      edgeGeoms.push(new THREE.EdgesGeometry(geometry, 25))
    }

    const fillGeometry = fillGeoms.length ? mergeGeometries(fillGeoms, false) : null
    const edgeGeometry = edgeGeoms.length ? mergeGeometries(edgeGeoms, false) : null

    fillGeoms.forEach((g) => g.dispose())
    edgeGeoms.forEach((g) => g.dispose())

    return { fillGeometry, edgeGeometry }
  }, [buildings])

  if (!fillGeometry) return null

  return (
    <group>
      <mesh geometry={fillGeometry}>
        <meshStandardMaterial color="#dfe4ec" roughness={0.85} metalness={0} />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color="#475569" />
      </lineSegments>
    </group>
  )
}
