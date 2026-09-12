// P9 — inspecting one sampled cell.
//
// Everything else on the diagnose page is a MEAN OVER AN AREA, and means hide
// the thing a designer most needs to see. The same intervention raised
// enclosure 50% within 20 m of itself and 4.9% beyond it; a colonnade takes 30%
// off compactness plaza-wide while area moves 3%. Both of those are invisible
// in an aggregate and obvious at a point. Until now the only way to interrogate
// a single position was to write a script against the library, which is not a
// thing the page offers its reader.
//
// THE PROBE DOES NOT RE-MEASURE ANYTHING. It reads the metrics off the same
// point record the map coloured itself from — the stored field for the
// as-surveyed map, `recomputeField`'s output for the sandbox. That is the whole
// design: a readout that recomputed its own numbers could disagree with the
// cell it is pointing at, and a disagreement of that kind is unfalsifiable by
// eye and would discredit both. The only thing cast here is the outline, and
// that is for drawing, never for a number.
//
// LAYER: field_360 only. The 120° precedent probe is a different measurement in
// a different normalisation and deliberately does not share this surface — see
// the note in lib/precedent.js.

import { castIsovist, buildEdgeIndex } from './isovist.js'
import {
  HEIGHT_AWARE,
  SANDBOX_FOV_DEG,
  SANDBOX_RANGE_M,
  SANDBOX_RAY_COUNT,
  composeGeometry,
} from './sandbox.js'
import { decompose } from './zones.js'

// How far a click may land from a sampled position and still be taken to mean
// it. Slightly under the 2.5 m grid pitch's half-diagonal (1.77 m), so a click
// in the gap between four cells resolves to one of them rather than to nothing,
// but a click well outside the sampled area returns null instead of snapping to
// a distant cell the user was not pointing at.
export const PROBE_SNAP_M = 2.5

// The sampled cell nearest a clicked point, or null if the click is not on the
// sampled lattice at all.
//
// Linear scan: 967 points at Konstablerwache and 1,224 at the largest site, so
// an index would cost more to maintain than it saves, and this runs once per
// click rather than per frame.
export function findCell(point, points, maxDistance = PROBE_SNAP_M) {
  if (!point || !points?.length) return null
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - point.x, points[i].y - point.y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return bestD <= maxDistance ? { index: best, distance: bestD } : null
}

// The isovist outline at a cell, FOR DRAWING ONLY.
//
// Cast through the same composed geometry and in the same mode the numbers were
// produced in, so the shape a reader sees is the shape those numbers describe.
// Returns the ray endpoints in plaza-local metres; the caller turns them into a
// polygon. Nothing here is rounded or stored — a metric derived from this would
// be a second, competing measurement of a cell that already has one.
export function cellIsovist(cell, geometry, masses = []) {
  if (!cell || !geometry) return null
  const composed = composeGeometry(geometry, masses)
  const index = buildEdgeIndex(composed.buildings, { heightAware: HEIGHT_AWARE })
  const m = castIsovist({ x: cell.x, y: cell.y }, 0, composed.buildings, {
    fov: SANDBOX_FOV_DEG,
    rayCount: SANDBOX_RAY_COUNT,
    range: SANDBOX_RANGE_M,
    index,
    heightAware: HEIGHT_AWARE,
  })
  return {
    outline: m.rays.map((r) => ({ x: r.point.x, y: r.point.y })),
    // Which rays ended on something built. Drawn differently from the ones that
    // ran to the range limit, because "my view stops here because of a wall"
    // and "my view stops here because we stopped looking" are not the same
    // statement about a place, and a single closed polygon conflates them.
    wall: m.rays.map((r) => r.wall),
  }
}

// What to show for one cell: the four metrics as measured and as normalised,
// the type it was assigned, and how far it sits from that type's centre.
//
// `record` is the point as the map has it. Sandbox records carry three more
// fields than stored ones do; both are handled by reading what is present
// rather than by branching on which page called.
export function readCell(record, centres, weights, zoneNames) {
  if (!record) return null
  const zone = record.zone
  const own = decompose(record.n, centres[zone], weights)

  const metrics = [
    { key: 'area', label: 'Isovist area', raw: record.area_m2, unit: ' m²', decimals: 0 },
    { key: 'compactness', label: 'Compactness', raw: record.compactness, unit: '', decimals: 4 },
    { key: 'occlusivity', label: 'Occlusivity', raw: record.occlusivity_m, unit: ' m', decimals: 1 },
    { key: 'enclosure', label: 'Enclosure', raw: record.enclosure_ratio, unit: '', decimals: 4 },
  ].map((m, i) => ({
    ...m,
    n: record.n?.[i],
    // The share of this cell's distance from its own type's centre that this
    // metric accounts for. Says which number is doing the classifying, which is
    // the question a reader has the moment they see a type they did not expect.
    share: own.terms?.[i]?.share ?? null,
    gap: own.terms?.[i]?.gap ?? null,
  }))

  // Present only on a recomputed cell — the stored field predates them.
  const p9 = []
  if (record.solidity != null) p9.push({ label: 'Solidity', value: record.solidity.toFixed(4) })
  if (record.closed_share != null) {
    p9.push({ label: 'Closed share', value: record.closed_share.toFixed(4) })
  }
  if (record.solid_share != null) {
    p9.push({ label: 'Solid share', value: record.solid_share.toFixed(4), muted: true })
  }

  return {
    x: record.x,
    y: record.y,
    zone,
    zoneName: zoneNames?.[zone] ?? `type ${zone}`,
    distance: own.distance,
    metrics,
    p9,
  }
}
