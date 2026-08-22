#!/usr/bin/env node
// Panoramic layer — recompute the frozen normalisation bounds for whatever
// perceptual_360 readings are currently saved.
//
//   npm run compute:360          read the saved readings and write the bounds
//   npm run compute:360 -- --dry inspect without writing
//
// The READINGS themselves are placed by hand in the 3D viewer: switch the
// measurement layer to 360°, click a point inside the plaza, save. This script
// does not create or move them — it reads what is there and regenerates
// src/data/fingerprints-360.json.
//
// It used to derive the 360° readings automatically from the 120° survey
// vantage points. That is no longer correct: the survey's panoramas are shot
// from points central to each plaza, not from the Street View camera position
// at the plaza edge, so each reading has to sit where its panorama was taken.
// Any record still carrying `derived_from` is one of those old auto-derived
// ones and is flagged below as needing replacement.
//
// A note that matters for interpretation: a 360° isovist is DIRECTION-FREE.
// Only the point matters — test/isovist.test.js asserts that rotating the
// heading leaves every 360° metric unchanged.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites } from '../src/lib/site.js'
import { METRICS, computeBounds, normalisedFingerprints } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const TARGET_MODE = 'perceptual_360'
const dry = process.argv.includes('--dry')
const round = (v, dp) => Number(v.toFixed(dp))

function main() {
  const sites = read('src/data/sites.json')
  const readings = read('src/data/results.json')
  const siteIds = activeSites(sites).map((s) => s.id)

  const bySite = new Map()
  for (const r of readings) {
    if (r.fov_mode !== TARGET_MODE || r.canonical !== true) continue
    if (!siteIds.includes(r.site_id)) continue
    bySite.set(r.site_id, r)
  }

  const stale = [...bySite.values()].filter((r) => r.derived_from)
  const placed = [...bySite.values()].filter((r) => !r.derived_from)
  const missing = siteIds.filter((id) => !bySite.has(id))

  console.log(`${bySite.size} of ${siteIds.length} active sites have a 360° reading`)
  console.log(`  hand-placed        ${placed.length}`)
  console.log(`  old auto-derived   ${stale.length}   (at the 120° vantage point — wrong for the survey)`)
  console.log(`  none at all        ${missing.length}`)

  if (stale.length) {
    console.log('')
    console.log('Still to re-place in the viewer:')
    for (const r of stale) console.log('  ! ' + r.site_id)
  }
  if (missing.length) {
    console.log('')
    console.log('No reading at all:')
    for (const id of missing) console.log('  - ' + id)
  }
  if (placed.length) {
    console.log('')
    console.log('Hand-placed:')
    for (const r of placed) {
      console.log(
        '  OK ' +
          r.site_id.slice(0, 32).padEnd(34) +
          'area ' +
          String(r.area_m2).padStart(10) +
          '   x ' +
          String(r.local_x).padStart(8) +
          '   y ' +
          String(r.local_y).padStart(8)
      )
    }
  }

  if (missing.length) {
    console.log('')
    console.log('Bounds not written — every active site needs a reading first.')
    process.exitCode = 1
    return
  }

  const bounds = computeBounds(bySite)
  const normalised = normalisedFingerprints(bySite, bounds)

  console.log('')
  console.log('Independent min-max bounds for ' + TARGET_MODE + ':')
  for (const m of METRICS) {
    const b = bounds[m]
    console.log(
      '  ' +
        m.padEnd(13) +
        String(round(b.min, 3)).padStart(10) +
        ' (' +
        b.minSite.slice(0, 22) +
        ')  ->  ' +
        String(round(b.max, 3)).padStart(10) +
        ' (' +
        b.maxSite.slice(0, 22) +
        ')'
    )
  }

  if (stale.length) {
    console.log('')
    console.log(`WARNING: ${stale.length} reading(s) are still at the old 120° vantage point.`)
    console.log('These bounds mix hand-placed and auto-derived points and should not be trusted')
    console.log('until every site has been re-placed.')
  }

  if (dry) {
    console.log('')
    console.log('--dry: nothing written.')
    return
  }

  writeJsonAtomic(path.join(root, 'src/data/fingerprints-360.json'), {
    fov_mode: TARGET_MODE,
    generated_at: new Date().toISOString(),
    note:
      'Independent min-max bounds for the perceptual_360 layer, computed from the ' +
      'hand-placed readings in results.json. Never share these with perceptual_120 ' +
      'or field_360 - the layers are non-interchangeable.',
    fov_deg: 360,
    ray_count: 360,
    range_m: 200,
    rays_per_degree: 1,
    sites_hand_placed: placed.length,
    sites_auto_derived: stale.length,
    metrics: METRICS,
    bounds,
    fingerprints: Object.fromEntries(normalised),
  })

  console.log('')
  console.log('Wrote src/data/fingerprints-360.json from ' + bySite.size + ' readings.')
}

main()
