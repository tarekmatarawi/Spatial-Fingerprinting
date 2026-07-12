// Unified ray-casting engine (Phase 3): one shared ray pass produces both the
// isovist polygon and the enclosure ratio, per the "radiate" method (Benedikt
// 1979) matching the Decoding Spaces Grasshopper component.
//
// All points are in local metres on the Z-up ground plane (X = east, Y =
// north), the same space produced by projectSite(). Direction is a compass
// bearing in radians: 0 = north (+Y), increasing clockwise (90° = east).

export const FOV_DEG = 120
export const MAX_RANGE_M = 200
export const RAY_COUNT = 120 // 1 ray per degree across the 120° cone (confirmed: Grasshopper precision = 1 ray/degree)

// Bearing (radians, 0 = north, clockwise) from `from` towards `to`.
export function bearingTo(from, to) {
  return Math.atan2(to.x - from.x, to.y - from.y)
}

// Casts RAY_COUNT rays evenly across the FOV_DEG cone centered on
// `directionRad`, from `vantage`, against every building footprint edge.
// Returns the ray results plus the four Phase-3 metrics computed from them.
export function castIsovist(
  vantage,
  directionRad,
  buildings,
  { fov = FOV_DEG, range = MAX_RANGE_M, rayCount = RAY_COUNT } = {}
) {
  const edges = buildingEdges(buildings)
  const halfFov = ((fov * Math.PI) / 180) / 2

  const rays = []
  for (let i = 0; i < rayCount; i++) {
    const t = rayCount === 1 ? 0.5 : i / (rayCount - 1)
    const angle = directionRad - halfFov + t * (2 * halfFov)
    const dx = Math.sin(angle)
    const dy = Math.cos(angle)

    const hit = nearestIntersection(vantage, dx, dy, range, edges)
    rays.push(
      hit
        ? { angle, point: hit.point, distance: hit.distance, wall: true, height: hit.height }
        : {
            angle,
            point: { x: vantage.x + dx * range, y: vantage.y + dy * range },
            distance: range,
            wall: false,
            height: null,
          }
    )
  }

  return { vantage, direction: directionRad, rays, ...computeMetrics(vantage, rays) }
}

function buildingEdges(buildings) {
  const edges = []
  for (const b of buildings) {
    const ring = b.footprint
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      edges.push({ x1: a.x, y1: a.y, x2: c.x, y2: c.y, height: b.height })
    }
  }
  return edges
}

function nearestIntersection(origin, dx, dy, maxRange, edges) {
  let nearest = null
  for (const e of edges) {
    const t = raySegmentDistance(origin.x, origin.y, dx, dy, e.x1, e.y1, e.x2, e.y2)
    if (t != null && t <= maxRange && (!nearest || t < nearest.distance)) {
      nearest = {
        distance: t,
        point: { x: origin.x + dx * t, y: origin.y + dy * t },
        height: e.height,
      }
    }
  }
  return nearest
}

// Ray (origin + t*(dx,dy), t >= 0, (dx,dy) unit length) vs segment (x1,y1)-(x2,y2).
// Returns t (== distance) at the intersection, or null if none.
function raySegmentDistance(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1
  const sy = y2 - y1
  const denom = dx * sy - dy * sx
  if (Math.abs(denom) < 1e-12) return null
  const qpx = x1 - ox
  const qpy = y1 - oy
  const t = (qpx * sy - qpy * sx) / denom
  const u = (qpx * dy - qpy * dx) / denom
  if (t < 0 || u < 0 || u > 1) return null
  return t
}

// Builds the closed polygon (vantage point + ray endpoints), then computes
// Area (shoelace), Perimeter, Compactness, and Occlusivity (closed perimeter:
// the sum of edges whose both endpoints are wall hits — this excludes the two
// side edges that close the cone back to the vantage point, since the vantage
// vertex is never a wall hit).
function computeMetrics(vantage, rays) {
  const verts = [
    { x: 0, y: 0, wall: false },
    ...rays.map((r) => ({ x: r.point.x - vantage.x, y: r.point.y - vantage.y, wall: r.wall })),
  ]

  const n = verts.length
  let shoelace = 0
  let perimeter = 0
  let closedPerimeter = 0

  for (let i = 0; i < n; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % n]
    shoelace += a.x * b.y - b.x * a.y
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
    perimeter += edgeLen
    if (a.wall && b.wall) closedPerimeter += edgeLen
  }

  const area = Math.abs(shoelace) / 2
  const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0

  const wallRays = rays.filter((r) => r.wall && r.height > 0 && r.distance > 0)
  const enclosureRatio = wallRays.length
    ? wallRays.reduce((sum, r) => sum + r.height / r.distance, 0) / wallRays.length
    : 0

  return { area, perimeter, compactness, occlusivity: closedPerimeter, enclosureRatio }
}
