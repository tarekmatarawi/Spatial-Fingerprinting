import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Extrudes each building footprint (in the X/Y ground plane) upward along +Z
// by its height, then merges every building into a single mesh (and a single
// outline) so the whole city is drawn in just a couple of draw calls instead of
// thousands. Footprint winding is normalised to counter-clockwise so extrusion
// normals always face outward regardless of how the OSM polygon was wound.
//
// OSM buildings and hand-drawn ("manual") ones are merged separately so the
// latter can carry a distinct, warmer material — a visible marker that they
// were reconstructed by hand rather than sourced from OSM.
export function Buildings({ buildings }) {
  const { osm, manual } = useMemo(() => {
    const osmBuildings = buildings.filter((b) => !b.manual)
    const manualBuildings = buildings.filter((b) => b.manual)
    return { osm: mergeBuildings(osmBuildings), manual: mergeBuildings(manualBuildings) }
  }, [buildings])

  if (!osm.fillGeometry && !manual.fillGeometry) return null

  return (
    <group>
      {/* Museum-board model: warm near-white volumes with ink lineweight edges */}
      {osm.fillGeometry && (
        <mesh geometry={osm.fillGeometry}>
          <meshStandardMaterial color="#faf8f2" roughness={0.9} metalness={0} />
        </mesh>
      )}
      {osm.edgeGeometry && (
        <lineSegments geometry={osm.edgeGeometry}>
          <lineBasicMaterial color="#44403c" />
        </lineSegments>
      )}

      {/* Hand-drawn fill-ins: a warm orange-tinted board so they read as
          reconstructed geometry, with the same ink lineweight edges. */}
      {manual.fillGeometry && (
        <mesh geometry={manual.fillGeometry}>
          <meshStandardMaterial color="#f6e2cf" roughness={0.9} metalness={0} />
        </mesh>
      )}
      {manual.edgeGeometry && (
        <lineSegments geometry={manual.edgeGeometry}>
          <lineBasicMaterial color="#7c3a12" />
        </lineSegments>
      )}
    </group>
  )
}

// Extrudes and merges a set of buildings into one fill geometry and one edge
// geometry (or nulls when the set is empty).
function mergeBuildings(buildings) {
  const fillGeoms = []
  const edgeGeoms = []

  for (const building of buildings) {
    let ring = building.footprint
    if (signedArea(ring) < 0) ring = ring.slice().reverse()

    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)))
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: building.height,
      bevelEnabled: false,
    })
    fillGeoms.push(geometry)
    edgeGeoms.push(new THREE.EdgesGeometry(geometry, 25))
  }

  const fillGeometry = fillGeoms.length ? mergeGeometries(fillGeoms, false) : null
  const edgeGeometry = edgeGeoms.length ? mergeGeometries(edgeGeoms, false) : null

  fillGeoms.forEach((g) => g.dispose())
  edgeGeoms.forEach((g) => g.dispose())

  return { fillGeometry, edgeGeometry }
}

// Signed area of a ring in the X/Y plane; positive = counter-clockwise.
function signedArea(ring) {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}
