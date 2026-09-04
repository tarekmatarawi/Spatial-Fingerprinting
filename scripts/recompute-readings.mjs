#!/usr/bin/env node
// Re-derives every stored reading from the current engine, after a deliberate
// change to how a metric is computed.
//
//   npm run recompute:readings -- --dry    show what would change, write nothing
//   npm run recompute:readings             rewrite results.json + the golden lock
//
// This is NOT routine maintenance. Stored readings are the study's measurements
// and two tests exist specifically to stop them drifting: the golden snapshot
// (test/fixtures/canonical-120.golden.json) and the "reachable within its own
// rounding window" check. Both fail loudly when engine output stops matching
// the file, which is exactly what should happen when someone changes the engine
// without meaning to. Running this script is the act of saying the change WAS
// meant, so it belongs in the same commit as the engine change that motivates
// it, with the reason recorded.
//
// It never moves a vantage point. Every reading is recast from the point and
// heading already stored for it, so the only thing that can differ is what the
// engine computes from that same pose.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { projectSite } from '../src/lib/site.js'
import { castIsovist } from '../src/lib/isovist.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const dry = process.argv.includes('--dry')

// Each layer recasts at its own settings — the range and field of view are part
// of what the layer IS, not incidental parameters.
const LAYERS = {
  perceptual_120: { fov: 120, rays: 120, range: 200, directional: true },
  perceptual_360: { fov: 360, rays: 360, range: 200, directional: false },
  perceptual_360_r100: { fov: 360, rays: 360, range: 100, directional: false },
  field_360: { fov: 360, rays: 360, range: 200, directional: false },
}

function main() {
  const sites = read('src/data/sites.json')
  const siteById = new Map(sites.map((s) => [s.id, s]))
  const readings = read('src/data/results.json')
  const projected = new Map()

  const next = []
  const changes = []

  for (const r of readings) {
    const layer = LAYERS[r.fov_mode]
    const site = siteById.get(r.site_id)
    if (!layer || !site) {
      next.push(r)
      continue
    }
    if (!projected.has(r.site_id)) projected.set(r.site_id, projectSite(site).buildings)

    const m = castIsovist(
      { x: r.local_x, y: r.local_y },
      layer.directional ? (r.direction_deg * Math.PI) / 180 : 0,
      projected.get(r.site_id),
      { fov: layer.fov, rayCount: layer.rays, range: layer.range }
    )

    changes.push({
      site: r.site_id.split('-')[0].slice(0, 17),
      mode: r.fov_mode,
      was: r.occlusivity_m,
      now: m.occlusivity,
      areaWas: r.area_m2,
      areaNow: m.area,
    })

    // ONLY the metrics whose definition actually changed are rewritten.
    //
    // Area and compactness are left exactly as captured. A reading was measured
    // at the researcher's true click position, and local_x/local_y are stored
    // rounded to 2 dp, so recasting from the file re-measures from a slightly
    // different pose than the one actually aimed — drift of up to ~1.7% in
    // compactness, on readings nobody intended to touch. That drift is real
    // measurement noise being introduced by bookkeeping, which is the opposite
    // of what a recompute is for. (This is the same rounding window the
    // "reachable within its own rounding window" test exists to bound: the
    // project's position is that the captured value stands and the file only
    // has to get close enough to prove it was not tampered with.)
    next.push({
      ...r,
      occlusivity_m: m.occlusivity,
      enclosure_ratio: m.enclosureRatio,
      recomputed_at: new Date().toISOString(),
    })
  }

  const pct = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100)
  const byLayer = {}
  for (const c of changes) (byLayer[c.mode] ??= []).push(c)

  for (const [mode, rows] of Object.entries(byLayer)) {
    console.log(`\n${mode} — ${rows.length} readings`)
    console.log(
      '  plaza'.padEnd(20) + 'occl was'.padStart(10) + 'occl now'.padStart(10) + 'change'.padStart(9) + '   area drift'
    )
    for (const c of rows) {
      console.log(
        ('  ' + c.site).padEnd(20) +
          c.was.toFixed(1).padStart(10) +
          c.now.toFixed(1).padStart(10) +
          `${pct(c.now, c.was).toFixed(0)}%`.padStart(9) +
          `   ${pct(c.areaNow, c.areaWas).toFixed(2)}%`
      )
    }
    const mean = rows.reduce((s, c) => s + pct(c.now, c.was), 0) / rows.length
    const areaMean = rows.reduce((s, c) => s + Math.abs(pct(c.areaNow, c.areaWas)), 0) / rows.length
    console.log(`  mean occlusivity change ${mean.toFixed(1)}%   mean |area drift| ${areaMean.toFixed(3)}%`)
  }

  if (dry) {
    console.log('\n--dry: nothing written.')
    return
  }

  writeJsonAtomic(path.join(root, 'src/data/results.json'), next)
  console.log(`\nWrote ${next.length} readings to src/data/results.json`)

  // The golden lock has to be re-cut from the same engine, or it would keep
  // asserting the behaviour that was just deliberately replaced.
  const goldenPath = 'test/fixtures/canonical-120.golden.json'
  const golden = read(goldenPath)
  golden.readings = golden.readings.map((g) => {
    if (!projected.has(g.site_id)) projected.set(g.site_id, projectSite(siteById.get(g.site_id)).buildings)
    const m = castIsovist(
      { x: g.local_x, y: g.local_y },
      (g.direction_deg * Math.PI) / 180,
      projected.get(g.site_id),
      { fov: golden.fov, rayCount: golden.rayCount, range: golden.rangeM }
    )
    return {
      ...g,
      area: m.area,
      perimeter: m.perimeter,
      compactness: m.compactness,
      occlusivity: m.occlusivity,
      enclosureRatio: m.enclosureRatio,
    }
  })
  golden.captured_at = new Date().toISOString()
  golden._comment =
    'Golden snapshot of the 120 deg engine output for the 18 canonical vantage points. ' +
    'Re-cut 2026-08-27 for two deliberate engine corrections, both leaving area, perimeter ' +
    'and compactness untouched. (1) OCCLUSIVITY now counts only edges running along ' +
    'continuous facade — both ends on the same building, or on two that meet — rather than ' +
    'any edge whose two ends both happened to hit a wall; the old rule counted the gap ' +
    'across a street opening as closed perimeter, inflating it ~50% and making it unstable ' +
    'to ray count and sub-degree rotation. (2) ENCLOSURE is now the mean subtended angle ' +
    'over ALL rays as a share of 90 deg, not the mean h/d over wall-hit rays only: openings ' +
    'contribute 0 instead of being excluded (they are the absence of enclosure, not missing ' +
    'data), and the arctangent bounds each direction so one tall near building cannot ' +
    'dominate the ring. Regenerate ONLY with a deliberate, reviewed engine change: ' +
    'npm run recompute:readings'
  writeJsonAtomic(path.join(root, goldenPath), golden)
  console.log(`Re-cut the golden lock at ${goldenPath}`)
}

main()
