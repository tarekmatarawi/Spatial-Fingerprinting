// Parses pasted GeoJSON text into a flat list of building polygons.
// Accepts a bare Polygon/MultiPolygon geometry, a single Feature, or a whole
// FeatureCollection (e.g. an overpass-turbo export). If a feature carries an
// OSM height tag it is used; otherwise height_m is null and the admin page's
// default height applies.

const LEVEL_HEIGHT = 3.2

export function parseBuildingGeoJSON(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not valid JSON — paste the GeoJSON exactly as exported.')
  }

  const polygons = []
  collect(data, null, polygons)

  if (polygons.length === 0) {
    throw new Error(
      'No polygons found. Expected a GeoJSON Polygon, MultiPolygon, Feature, or FeatureCollection containing polygons.'
    )
  }
  return polygons
}

// Parses a pasted GeoJSON that should contain exactly one polygon (the plaza boundary).
export function parseBoundaryGeoJSON(text) {
  const polygons = parseBuildingGeoJSON(text)
  if (polygons.length > 1) {
    throw new Error(
      `Expected a single polygon for the boundary but found ${polygons.length}.`
    )
  }
  return polygons[0].footprint
}

function collect(node, properties, out) {
  if (!node || typeof node !== 'object') return

  switch (node.type) {
    case 'FeatureCollection':
      for (const feature of node.features ?? []) collect(feature, null, out)
      break
    case 'Feature':
      collect(node.geometry, node.properties ?? null, out)
      break
    case 'GeometryCollection':
      for (const geom of node.geometries ?? []) collect(geom, properties, out)
      break
    case 'Polygon':
      out.push({
        footprint: { type: 'Polygon', coordinates: node.coordinates },
        height_m: heightFromProperties(properties),
      })
      break
    case 'MultiPolygon':
      for (const coords of node.coordinates ?? []) {
        out.push({
          footprint: { type: 'Polygon', coordinates: coords },
          height_m: heightFromProperties(properties),
        })
      }
      break
    default:
      break // points, lines etc. are silently skipped
  }
}

function heightFromProperties(props) {
  if (!props) return null
  const height = parseFloat(props.height ?? props['building:height'])
  if (!Number.isNaN(height) && height > 0) return round1(height)
  const levels = parseFloat(props['building:levels'] ?? props.levels)
  if (!Number.isNaN(levels) && levels > 0) return round1(levels * LEVEL_HEIGHT)
  return null
}

function round1(n) {
  return Math.round(n * 10) / 10
}
