// P5 — canonical perceptual fingerprints and their frozen normalisation bounds.
//
// A site's fingerprint is its single canonical 120° reading: the vantage point
// and heading matched to the Street View photograph that site was shown as in
// the P3 survey. Four metrics, min–max normalised across the 18 active sites.
//
// The bounds are FROZEN into analysis.json and reused by every later phase, so
// a P7 view cloud or a P9 intervention is measured on the same axes as the
// weights were fitted on. Each bound records the site that sets it: if that
// site's geometry is ever corrected the freeze is visibly invalidated rather
// than silently shifted.
//
// LAYER SEPARATION: everything here is perceptual_120. Field-layer (360°) data
// has its own bounds, computed in P6, and the two must never be mixed.

export const METRICS = ['area', 'compactness', 'occlusivity', 'enclosure']
export const FOV_MODE = 'perceptual_120'

// results.json key → the short metric name used throughout the analysis.
const SOURCE_KEYS = {
  area: 'area_m2',
  compactness: 'compactness',
  occlusivity: 'occlusivity_m',
  enclosure: 'enclosure_ratio',
}

// Human labels, for charts and methods disclosures.
export const METRIC_LABELS = {
  area: 'Isovist area',
  compactness: 'Compactness',
  occlusivity: 'Occlusivity',
  enclosure: 'Enclosure',
}

export const METRIC_UNITS = {
  area: 'm²',
  compactness: '',
  occlusivity: 'm',
  // A share of the 90 deg you could look up; multiply by 90 for the angle.
  enclosure: '',
}

// Every FOV layer this project computes. They are separate measurement systems
// producing non-interchangeable numbers, and each carries its own normalisation
// bounds. A value from one layer must never be normalised against, compared
// with, or averaged into another.
//
//   perceptual_120 — 120° directional, at the survey vantage/heading (P3/P5)
//   perceptual_360 — 360° omnidirectional, at those SAME vantage points, for
//                    the panoramic survey. Direction-independent by construction.
//   perceptual_360_r100
//                  — the SAME 360° vantage points cast to a 100 m sight-line
//                    limit instead of the toolchain's 200 m. Gehl's social
//                    field of vision — roughly the distance at which a person
//                    is still legible as a person — is the stated ground for
//                    100 m; the 200 m default was inherited from the Decoding
//                    Spaces Grasshopper component for comparability and has no
//                    perceptual justification behind it. Range changes what a
//                    metric counts (a 200 m cast folds long street vistas into
//                    a plaza's "area"), so it is a separate measurement system
//                    with its own bounds, not the same layer at a setting.
//   field_360      — 360° omnidirectional, on the P6 sampling grid
export const FOV_MODES = ['perceptual_120', 'perceptual_360', 'perceptual_360_r100', 'field_360']

// Pulls the canonical readings for one layer, and fails loudly on anything that
// would quietly corrupt a fit: a missing site, a second reading for one site, a
// record with no declared layer at all, a non-finite metric.
//
// Selection is BY LAYER. Records from other layers are skipped, never merged
// and never an error — results.json holds every layer side by side, and each
// analysis takes only its own.
export function canonicalReadings(readings, activeSiteIds, fovMode = FOV_MODE) {
  if (!FOV_MODES.includes(fovMode)) {
    throw new Error(`Unknown fov_mode "${fovMode}" — expected one of ${FOV_MODES.join(', ')}`)
  }
  const active = new Set(activeSiteIds)
  const bySite = new Map()

  for (const r of readings) {
    // A record with no declared layer is the one thing that is always an error:
    // it could belong to either system and there is no safe assumption.
    if (r.canonical === true && r.fov_mode == null) {
      throw new Error(
        `Canonical reading for "${r.site_id}" declares no fov_mode. Every metric record must ` +
          'name its layer — an ambiguous record cannot be normalised or compared safely.'
      )
    }
    if (r.canonical !== true) continue
    if (r.fov_mode !== fovMode) continue
    if (!active.has(r.site_id)) continue

    if (bySite.has(r.site_id)) {
      throw new Error(
        `Two canonical ${fovMode} readings for "${r.site_id}". Exactly one per site per layer is ` +
          "required — the fingerprint is meant to be that site's single reference for this layer."
      )
    }
    bySite.set(r.site_id, r)
  }

  for (const id of active) {
    if (!bySite.has(id)) throw new Error(`No canonical ${fovMode} reading for active site "${id}".`)
  }

  for (const [id, r] of bySite) {
    for (const m of METRICS) {
      const v = r[SOURCE_KEYS[m]]
      if (!Number.isFinite(v)) throw new Error(`Reading for "${id}" has non-finite ${m}: ${v}`)
    }
  }

  return bySite
}

// Min–max bounds per metric, each attributed to the site that sets it.
export function computeBounds(bySite) {
  const bounds = {}
  for (const m of METRICS) {
    let min = Infinity
    let max = -Infinity
    let minSite = null
    let maxSite = null
    for (const [id, r] of bySite) {
      const v = r[SOURCE_KEYS[m]]
      if (v < min) {
        min = v
        minSite = id
      }
      if (v > max) {
        max = v
        maxSite = id
      }
    }
    if (!(max > min)) {
      throw new Error(`Metric "${m}" has no spread across the sites (min ${min}, max ${max}).`)
    }
    bounds[m] = { min, max, minSite, maxSite }
  }
  return bounds
}

// Normalises one raw value onto its metric's frozen 0–1 scale.
//
// Deliberately NOT clamped. A P7 marker or a P9 intervention may fall outside
// the corpus range, and clamping would silently misrepresent it as sitting on
// the boundary. Out-of-range values are legitimate and are labelled as such
// where they are displayed.
export function normaliseValue(value, bound) {
  return (value - bound.min) / (bound.max - bound.min)
}

// site_id → [area, compactness, occlusivity, enclosure] on the 0–1 scale.
export function normalisedFingerprints(bySite, bounds) {
  const out = new Map()
  for (const [id, r] of bySite) {
    out.set(
      id,
      METRICS.map((m) => normaliseValue(r[SOURCE_KEYS[m]], bounds[m]))
    )
  }
  return out
}

// One call for the usual path: readings + active site ids → everything P5 needs.
export function buildFingerprints(readings, activeSiteIds, fovMode = FOV_MODE) {
  const bySite = canonicalReadings(readings, activeSiteIds, fovMode)
  const bounds = computeBounds(bySite)
  return {
    fovMode,
    bounds,
    fingerprints: normalisedFingerprints(bySite, bounds),
    siteIds: [...bySite.keys()].sort(),
    raw: bySite,
  }
}
