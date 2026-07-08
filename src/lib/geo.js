// Simple equirectangular projection: good enough for a 2km x 2km local area.
// (lon, lat) -> local metres (x, y) on a Z-up world, with the given center at
// (0, 0). x grows east, y grows north. Building height is the separate world
// +Z axis. Viewed from above (+Z looking down) this reproduces a standard map:
// east to the right, north up — no mirroring.

const METERS_PER_DEG_LAT = 110574

export function metersPerDegLon(atLat) {
  return 111320 * Math.cos((atLat * Math.PI) / 180)
}

export function createProjector(centerLat, centerLon) {
  const mPerLon = metersPerDegLon(centerLat)

  function toLocal(lat, lon) {
    const x = (lon - centerLon) * mPerLon
    const y = (lat - centerLat) * METERS_PER_DEG_LAT
    return { x, y }
  }

  // Inverse of toLocal: local metres (x, y) -> geographic (lat, lon).
  function toLatLon(x, y) {
    const lon = centerLon + x / mPerLon
    const lat = centerLat + y / METERS_PER_DEG_LAT
    return { lat, lon }
  }

  function bbox(halfMeters) {
    const dLat = halfMeters / METERS_PER_DEG_LAT
    const dLon = halfMeters / mPerLon
    return {
      south: centerLat - dLat,
      north: centerLat + dLat,
      west: centerLon - dLon,
      east: centerLon + dLon,
    }
  }

  return { toLocal, toLatLon, bbox }
}
