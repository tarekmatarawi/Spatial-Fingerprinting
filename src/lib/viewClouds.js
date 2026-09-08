// P7 — assembling each plaza's view cloud, and the normalisation it lives in.
//
// A cloud is a set of 120° readings from one plaza. Two things go into it:
//
//   1. the plaza's CANONICAL fingerprint from results.json — the Street
//      View-matched vantage and heading that P3 showed and P5 fitted on
//   2. the markers the researcher placed on the P7 plan editor
//
// The canonical reading is composed in here at read time rather than copied
// into view-clouds.json. It is fixed by the capture protocol (docs/spec.md) and
// belongs to P5; duplicating it would create a second copy that could quietly
// disagree with the first after a re-measurement. So view-clouds.json stores
// ONLY placed markers, and view 1 of every cloud is always the live canonical
// reading. It is marked `locked` and cannot be deleted from this page.
//
// LAYER: perceptual_120, and nothing else may enter. The bounds come from the
// eighteen canonical 120° readings — the same frozen bounds P5's own layer
// uses — never from the 360° layer P6 works in, and never pooled over the
// markers themselves. Pooling over markers would move the scale every time a
// marker was added, so a distance computed on Monday would not mean the same
// thing on Tuesday.

import {
  METRICS,
  buildFingerprints,
  normaliseValue,
} from './analysis/fingerprints.js'

export const CLOUD_FOV_MODE = 'perceptual_120'
export const CLOUD_FOV_DEG = 120
export const CLOUD_RAY_COUNT = 120
export const CLOUD_RANGE_M = 200

// Eight views per plaza, the same everywhere.
//
// Equal counts, not counts proportional to plaza size, and the reason is the
// measures rather than tidiness: Chamfer is an average over each cloud's points,
// so a plaza sampled twice as densely is not penalised, but its neighbours are
// judged against twice as many chances to find a close match. Equal cardinality
// removes that asymmetry. Eight is also the smallest count that leaves a 4×4
// covariance with more points than dimensions, which the Gaussian measure needs
// to say anything at all.
export const TARGET_PER_SITE = 8

// results.json field names → the short metric names used across the analysis.
const SOURCE_KEYS = {
  area: 'area_m2',
  compactness: 'compactness',
  occlusivity: 'occlusivity_m',
  enclosure: 'enclosure_ratio',
}

export function metricVector(record) {
  return METRICS.map((m) => record[SOURCE_KEYS[m]])
}

// The empty file, so a fresh checkout and a saved file have the same shape.
export const EMPTY_CLOUD_FILE = {
  fov_mode: CLOUD_FOV_MODE,
  fov_deg: CLOUD_FOV_DEG,
  ray_count: CLOUD_RAY_COUNT,
  range_m: CLOUD_RANGE_M,
  target_per_site: TARGET_PER_SITE,
  updated_at: null,
  markers: [],
}

// Rejects anything that would corrupt the layer before it reaches disk. Called
// by the save endpoint, not only by the UI — a stray record written by hand
// should fail here rather than silently become a 360° reading inside a 120°
// comparison.
export function validateCloudFile(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new Error('Expected a view-cloud file object')
  }
  if (file.fov_mode !== CLOUD_FOV_MODE) {
    throw new Error(`View clouds are ${CLOUD_FOV_MODE} only, got "${file.fov_mode}"`)
  }
  if (!Array.isArray(file.markers)) throw new Error('Expected a markers array')
  for (const m of file.markers) {
    if (!m.site_id) throw new Error('A marker has no site_id')
    if (m.fov_mode !== CLOUD_FOV_MODE) {
      throw new Error(`Marker ${m.id} declares fov_mode "${m.fov_mode}" — must be ${CLOUD_FOV_MODE}`)
    }
    for (const k of ['local_x', 'local_y', 'direction_deg', ...Object.values(SOURCE_KEYS)]) {
      if (!Number.isFinite(m[k])) throw new Error(`Marker ${m.id} has non-finite ${k}`)
    }
  }
  return file
}

// site_id → { markers, points, outOfRange }, plus the bounds every cloud was
// scaled against.
//
//   markers  the readings themselves, canonical first, in placement order
//   points   the same readings as normalised 4-vectors — what the distance
//            measures actually consume
//
// `points` is deliberately NOT clipped to 0–1. A marker in a corner tighter
// than any surveyed vantage point genuinely sits below zero, and clamping it
// would move it onto the boundary alongside every other extreme view, making
// distinct positions read as identical. Out-of-range markers are counted so the
// extrapolation is visible instead of assumed away.
export function buildClouds(readings, placedMarkers, activeSiteIds) {
  const { bounds, raw } = buildFingerprints(readings, activeSiteIds, CLOUD_FOV_MODE)

  const clouds = new Map()
  for (const siteId of activeSiteIds) {
    const canonical = raw.get(siteId)
    clouds.set(siteId, {
      siteId,
      markers: [
        {
          ...canonical,
          locked: true,
          origin: 'canonical',
        },
      ],
    })
  }

  for (const marker of placedMarkers ?? []) {
    const cloud = clouds.get(marker.site_id)
    // A marker for an excluded or renamed site is skipped rather than thrown
    // on: excluding a site in the register should not break this page.
    if (!cloud) continue
    cloud.markers.push({ ...marker, locked: false, origin: 'placed' })
  }

  let outOfRangeTotal = 0
  let markerTotal = 0
  for (const cloud of clouds.values()) {
    cloud.points = cloud.markers.map((m) =>
      METRICS.map((k) => normaliseValue(m[SOURCE_KEYS[k]], bounds[k]))
    )
    cloud.outOfRange = cloud.points.filter((p) => p.some((v) => v < 0 || v > 1)).length
    outOfRangeTotal += cloud.outOfRange
    markerTotal += cloud.markers.length
  }

  return {
    fovMode: CLOUD_FOV_MODE,
    bounds,
    clouds,
    siteIds: activeSiteIds.filter((id) => clouds.has(id)),
    markerTotal,
    outOfRangeTotal,
  }
}

// How far each cloud is from the eight-view target — what the editor's progress
// readout and the "not yet comparable" warnings are built on.
export function cloudCoverage(built, target = TARGET_PER_SITE) {
  const rows = built.siteIds.map((id) => {
    const cloud = built.clouds.get(id)
    return { siteId: id, count: cloud.markers.length, placed: cloud.markers.length - 1 }
  })
  return {
    rows,
    target,
    complete: rows.filter((r) => r.count >= target).length,
    // Every cloud has to reach the target before the corpus-wide matrices mean
    // anything: a plaza with two views and a plaza with eight are not being
    // measured on equal terms, whatever the numbers say.
    ready: rows.length > 0 && rows.every((r) => r.count >= target),
    total: rows.length,
  }
}
