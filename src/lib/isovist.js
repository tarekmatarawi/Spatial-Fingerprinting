// Flattens every building footprint into a list of 2D wall segments
// { x1, z1, x2, z2 } that isovist rays can be tested against.
export function buildEdges(buildings) {
  const edges = []
  for (const building of buildings) {
    const ring = building.footprint
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      edges.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z })
    }
  }
  return edges
}

// Casts `rayCount` rays in a full circle from `origin`, stopping each one at
// the nearest wall segment it hits or at `maxRadius`, and returns the hit
// points in angular order so they form a visibility polygon.
export function computeIsovist(origin, edges, { rayCount, maxRadius }) {
  const points = new Array(rayCount)

  // Cheap early-reject: skip edges whose bounding box can't possibly be
  // within range of the origin before doing the full intersection test.
  const relevantEdges = edges.filter((e) => {
    const minX = Math.min(e.x1, e.x2) - origin.x
    const maxX = Math.max(e.x1, e.x2) - origin.x
    const minZ = Math.min(e.z1, e.z2) - origin.z
    const maxZ = Math.max(e.z1, e.z2) - origin.z
    if (maxX < -maxRadius || minX > maxRadius) return false
    if (maxZ < -maxRadius || minZ > maxRadius) return false
    return true
  })

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)

    let nearest = maxRadius

    for (const edge of relevantEdges) {
      const t = raySegmentDistance(origin.x, origin.z, dx, dz, edge)
      if (t !== null && t < nearest) nearest = t
    }

    points[i] = { x: origin.x + dx * nearest, z: origin.z + dz * nearest }
  }

  return points
}

// Returns the ray parameter `t` (distance along the ray) where a ray from
// (ox, oz) in direction (dx, dz) hits the segment (x1,z1)-(x2,z2), or null.
function raySegmentDistance(ox, oz, dx, dz, { x1, z1, x2, z2 }) {
  const sx = x2 - x1
  const sz = z2 - z1

  const denom = dx * sz - dz * sx
  if (Math.abs(denom) < 1e-10) return null // ray parallel to segment

  const ex = x1 - ox
  const ez = z1 - oz

  const t = (ex * sz - ez * sx) / denom
  const u = (ex * dz - ez * dx) / denom

  if (t < 0 || u < 0 || u > 1) return null
  return t
}
