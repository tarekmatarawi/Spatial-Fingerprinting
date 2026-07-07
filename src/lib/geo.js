// Simple equirectangular projection: good enough for a 2km x 2km local area.
// (lon, lat) -> local meters (x, z), with the given center at (0, 0).
// x grows east, z grows south (so buildings north of center get negative z).

const METERS_PER_DEG_LAT = 110574

export function metersPerDegLon(atLat) {
  return 111320 * Math.cos((atLat * Math.PI) / 180)
}

export function createProjector(centerLat, centerLon) {
  const mPerLon = metersPerDegLon(centerLat)

  function toLocal(lat, lon) {
    const x = (lon - centerLon) * mPerLon
    const z = (lat - centerLat) * METERS_PER_DEG_LAT
    return { x, z }
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

  return { toLocal, bbox }
}
