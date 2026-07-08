import { createProjector } from './geo'

const FALLBACK_HEIGHT = 9

// Converts one raw site from sites.json into local-meter geometry that the
// 3D viewer can render directly: buildings as { footprint:[{x,z}], height },
// the plaza boundary as [{x,z}], plus framing metrics (centroid + radii) and
// a projector for turning clicked local points back into lat/lon.
export function projectSite(site) {
  if (site.center_lat == null || site.center_lng == null) {
    throw new Error(
      `"${site.name || site.id}" has no center latitude/longitude set — add it on the Site Data page first.`
    )
  }

  const projector = createProjector(site.center_lat, site.center_lng)

  const buildings = []
  for (const b of site.buildings ?? []) {
    const ring = b.footprint?.coordinates?.[0]
    if (!ring || ring.length < 4) continue
    const footprint = ringToLocal(projector, ring)
    if (footprint.length < 3) continue
    buildings.push({
      footprint,
      height: typeof b.height_m === 'number' && b.height_m > 0 ? b.height_m : FALLBACK_HEIGHT,
    })
  }

  let boundary = null
  if (site.boundary?.coordinates?.[0]) {
    const ring = ringToLocal(projector, site.boundary.coordinates[0])
    if (ring.length >= 3) boundary = ring
  }

  // Frame the camera on the plaza itself (its boundary), falling back to all
  // buildings if no boundary is set.
  const focusPoints = boundary ?? buildings.flatMap((b) => b.footprint)
  const centroid = focusPoints.length ? averagePoint(focusPoints) : { x: 0, z: 0 }
  const boundaryRadius = maxDistance(centroid, focusPoints)
  const sceneRadius = Math.max(
    boundaryRadius,
    maxDistance(centroid, buildings.flatMap((b) => b.footprint))
  )

  return {
    buildings,
    boundary,
    centroid,
    boundaryRadius,
    sceneRadius,
    toLatLon: projector.toLatLon,
  }
}

// Ray-casting point-in-polygon test. point and polygon are in {x,z} local space.
export function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const zi = polygon[i].z
    const xj = polygon[j].x
    const zj = polygon[j].z
    const intersects =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function ringToLocal(projector, ring) {
  const pts = ring.map(([lng, lat]) => projector.toLocal(lat, lng))
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (pts.length > 2 && first.x === last.x && first.z === last.z) pts.pop()
  return pts
}

function averagePoint(points) {
  let sx = 0
  let sz = 0
  for (const p of points) {
    sx += p.x
    sz += p.z
  }
  return { x: sx / points.length, z: sz / points.length }
}

function maxDistance(center, points) {
  let max = 0
  for (const p of points) {
    const d = Math.hypot(p.x - center.x, p.z - center.z)
    if (d > max) max = d
  }
  return max
}
