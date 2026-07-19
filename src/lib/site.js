import { createProjector } from './geo'

const FALLBACK_HEIGHT = 9

// A building's height comes from, in priority order: a manual pin
// (override_height_m), then the height fetched from OSM (osm_height_m), then
// the site's live default (default_height_m). This keeps the "live default"
// behaviour: buildings with no OSM height follow the site default until pinned.
export function effectiveHeight(building, site, fallback = FALLBACK_HEIGHT) {
  const override = building.override_height_m
  if (typeof override === 'number' && override > 0) return override
  const osm = building.osm_height_m
  if (typeof osm === 'number' && osm > 0) return osm
  const dflt = site?.default_height_m
  if (typeof dflt === 'number' && dflt > 0) return dflt
  return fallback
}

// Where the effective height came from — used to label rows in the admin list.
export function heightSource(building) {
  const override = building.override_height_m
  if (typeof override === 'number' && override > 0) return 'manual'
  const osm = building.osm_height_m
  if (typeof osm === 'number' && osm > 0) return 'osm'
  return 'default'
}

// Converts one raw site from sites.json into local-metre geometry that the
// 3D viewer can render directly: buildings as { footprint:[{x,y}], height },
// the plaza boundary as [{x,y}], plus framing metrics (centroid + radii) and
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
    // `manual` marks a footprint hand-drawn in the viewer (a building missing
    // from OSM), so the renderer can tint it and the thesis can report which
    // geometry was reconstructed by hand. The ray-caster ignores the flag.
    buildings.push({ footprint, height: effectiveHeight(b, site), manual: b.manual === true })
  }

  let boundary = null
  if (site.boundary?.coordinates?.[0]) {
    const ring = ringToLocal(projector, site.boundary.coordinates[0])
    if (ring.length >= 3) boundary = ring
  }

  // Frame the camera on the plaza itself (its boundary), falling back to all
  // buildings if no boundary is set.
  const focusPoints = boundary ?? buildings.flatMap((b) => b.footprint)
  const centroid = focusPoints.length ? averagePoint(focusPoints) : { x: 0, y: 0 }
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

// Ray-casting point-in-polygon test. point and polygon are in {x,y} local space.
export function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function ringToLocal(projector, ring) {
  const pts = ring.map(([lng, lat]) => projector.toLocal(lat, lng))
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (pts.length > 2 && first.x === last.x && first.y === last.y) pts.pop()
  return pts
}

function averagePoint(points) {
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

function maxDistance(center, points) {
  let max = 0
  for (const p of points) {
    const d = Math.hypot(p.x - center.x, p.y - center.y)
    if (d > max) max = d
  }
  return max
}
