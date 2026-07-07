import { OVERPASS_URL, DEFAULT_BUILDING_HEIGHT, LEVEL_HEIGHT } from './config'

// Fetches building footprints and street centerlines for a bounding box from
// the Overpass API (a query service for OpenStreetMap data), and projects
// every coordinate to local meters using the given projector.
export async function fetchCityData(bbox, projector) {
  const query = `
    [out:json][timeout:60];
    (
      way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `.trim()

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  })

  if (!response.ok) {
    throw new Error(
      `Overpass API request failed (${response.status} ${response.statusText})`
    )
  }

  const data = await response.json()

  const buildings = []
  const streets = []

  for (const element of data.elements) {
    if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) {
      continue
    }

    const points = element.geometry.map((node) => projector.toLocal(node.lat, node.lon))

    if (element.tags?.building) {
      // Drop the duplicated closing point (first === last) OSM uses for closed ways
      const first = points[0]
      const last = points[points.length - 1]
      const ring =
        points.length > 2 && first.x === last.x && first.z === last.z
          ? points.slice(0, -1)
          : points

      if (ring.length < 3) continue

      buildings.push({
        id: element.id,
        footprint: ring,
        height: estimateHeight(element.tags),
      })
    } else if (element.tags?.highway) {
      streets.push({
        id: element.id,
        points,
      })
    }
  }

  return { buildings, streets }
}

function estimateHeight(tags) {
  if (tags.height) {
    const parsed = parseFloat(tags.height)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  if (tags['building:levels']) {
    const levels = parseFloat(tags['building:levels'])
    if (!Number.isNaN(levels) && levels > 0) return levels * LEVEL_HEIGHT
  }
  return DEFAULT_BUILDING_HEIGHT
}
