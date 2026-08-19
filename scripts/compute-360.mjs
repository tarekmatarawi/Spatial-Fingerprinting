#!/usr/bin/env node
// Panoramic pilot — 360° isovist readings at the perceptual-survey vantage points.
//
//   npm run compute:360          compute and write
//   npm run compute:360 -- --dry inspect without writing anything
//
// PURELY ADDITIVE. This reads the 18 existing perceptual_120 records for their
// vantage points and appends 18 new perceptual_360 records alongside them. It
// never edits, reorders or removes an existing record of any layer; re-running
// it replaces only the perceptual_360 rows it wrote itself.
//
// What differs from the 120° reading is ONLY the angular range and ray count:
//   • 360° instead of 120°, at the same 1 ray/degree → 360 rays instead of 120
//   • same vantage point, same 200 m max range, same four formulas
//
// A note that matters for interpretation: a 360° isovist is DIRECTION-FREE. The
// stored heading is carried through for provenance and for the panorama's
// default view, but it cannot affect these metrics — test/isovist.test.js
// asserts that rotating the heading leaves every 360° metric unchanged.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { castIsovist, FOV_DEG, RAY_COUNT, MAX_RANGE_M } from '../src/lib/isovist.js'
import { METRICS, computeBounds, normalisedFingerprints, canonicalReadings } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const SOURCE_MODE = 'perceptual_120'
const TARGET_MODE = 'perceptual_360'

// Preserve the 120° layer's angular resolution exactly rather than hardcoding
// 360: if RAY_COUNT/FOV_DEG is ever changed, the panoramic layer follows it.
const RAYS_PER_DEGREE = RAY_COUNT / FOV_DEG
const PANO_FOV = 360
const PANO_RAYS = Math.round(PANO_FOV * RAYS_PER_DEGREE)

const dry = process.argv.includes('--dry')
const round = (v, dp) => Number(v.toFixed(dp))

function main() {
  const sites = read('src/data/sites.json')
  const readings = read('src/data/results.json')
  const siteIds = activeSites(sites).map((s) => s.id)
  const siteById = new Map(sites.map((s) => [s.id, s]))

  // Reuse the P5 selector so "which record is this site's reference" is decided
  // in exactly one place for every layer.
  const source = canonicalReadings(readings, siteIds, SOURCE_MODE)

  console.log(`Angular resolution ${RAYS_PER_DEGREE} ray/degree (from the ${FOV_DEG}° layer)`)
  console.log(`Casting ${PANO_FOV}° with ${PANO_RAYS} rays, ${MAX_RANGE_M} m range, at ${source.size} vantage points\n`)

  const fresh = []
  for (const siteId of siteIds) {
    const from = source.get(siteId)
    const { buildings } = projectSite(siteById.get(siteId))

    const m = castIsovist(
      { x: from.local_x, y: from.local_y },
      (from.direction_deg * Math.PI) / 180,
      buildings,
      { fov: PANO_FOV, rayCount: PANO_RAYS, range: MAX_RANGE_M }
    )

    fresh.push({
      id: `pano360-${siteId}`,
      site_id: siteId,
      site_name: from.site_name,
      // Same point, carried over verbatim from the 120° record.
      lat: from.lat,
      lng: from.lng,
      local_x: from.local_x,
      local_y: from.local_y,
      // Provenance only — a 360° isovist does not depend on heading.
      direction_deg: from.direction_deg,
      heading_is_informational: true,
      area_m2: round(m.area, 2),
      compactness: round(m.compactness, 4),
      occlusivity_m: round(m.occlusivity, 2),
      enclosure_ratio: round(m.enclosureRatio, 4),
      fov_mode: TARGET_MODE,
      fov_deg: PANO_FOV,
      ray_count: PANO_RAYS,
      range_m: MAX_RANGE_M,
      canonical: true,
      derived_from: from.id,
      saved_at: new Date().toISOString(),
    })

    const from120 = `${String(from.area_m2).padStart(9)}`
    console.log(
      `  ${siteId.slice(0, 32).padEnd(33)} area ${String(fresh.at(-1).area_m2).padStart(9)}  (120° was ${from120})`
    )
  }

  // Independent bounds for THIS layer only. Never reuse another layer's.
  const bySite = new Map(fresh.map((r) => [r.site_id, r]))
  const bounds = computeBounds(bySite)
  const normalised = normalisedFingerprints(bySite, bounds)

  console.log('\nIndependent min–max bounds for perceptual_360:')
  for (const m of METRICS) {
    const b = bounds[m]
    console.log(
      `  ${m.padEnd(13)} ${String(round(b.min, 3)).padStart(10)} (${b.minSite.slice(0, 22)})` +
        ` → ${String(round(b.max, 3)).padStart(10)} (${b.maxSite.slice(0, 22)})`
    )
  }

  if (dry) {
    console.log('\n--dry: nothing written.')
    return
  }

  // Drop only our own previous rows, keep every other record exactly as-is.
  const kept = readings.filter((r) => r.fov_mode !== TARGET_MODE)
  const removed = readings.length - kept.length
  writeJsonAtomic(path.join(root, 'src/data/results.json'), [...kept, ...fresh])

  writeJsonAtomic(path.join(root, 'src/data/fingerprints-360.json'), {
    fov_mode: TARGET_MODE,
    generated_at: new Date().toISOString(),
    note:
      'Independent min-max bounds for the perceptual_360 layer. These must never be ' +
      'shared with perceptual_120 or field_360 — the layers are non-interchangeable.',
    fov_deg: PANO_FOV,
    ray_count: PANO_RAYS,
    range_m: MAX_RANGE_M,
    rays_per_degree: RAYS_PER_DEGREE,
    metrics: METRICS,
    bounds,
    fingerprints: Object.fromEntries(normalised),
  })

  console.log(
    `\nWrote ${fresh.length} ${TARGET_MODE} records into src/data/results.json` +
      (removed ? ` (replacing ${removed} from a previous run)` : '') +
      `\nKept ${kept.length} existing records of other layers untouched.` +
      '\nWrote src/data/fingerprints-360.json'
  )
}

main()
