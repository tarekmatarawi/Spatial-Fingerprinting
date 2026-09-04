#!/usr/bin/env node
// P6 — samples every plaza on a regular grid and casts a 360° isovist at each
// point, producing the field layer the zone typology is built from.
//
//   npm run fields                  compute every site, write the field files
//   npm run fields -- --dry         report the sample without writing
//   npm run fields -- --spacing=5   coarser grid (default 2.5 m)
//   npm run fields -- --site=Zeil   one site, for iterating
//
// WHAT A FIELD POINT IS. A P5 reading is a place a researcher chose to stand.
// A field point is not chosen at all — it is one cell of a regular lattice laid
// over the plaza, measured the same way every other cell is. The field answers
// "what is this location like", not "what did somebody see"; the grid is
// exhaustive precisely so no judgement enters where the samples fall.
//
// NORMALISATION IS NOT ITS OWN. Field points are scaled against P5's frozen
// perceptual_360 bounds rather than their own pooled range, because P5's fitted
// weights are what the typology clusters with and those weights only mean what
// they were fitted to mean on P5's axes. See docs/spec.md, "Layer separation".
// Points more extreme than any surveyed vantage point therefore fall outside
// 0–1; they are kept, not clipped, and the share outside range is reported.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { castIsovist, buildEdgeIndex } from '../src/lib/isovist.js'
import { METRICS, canonicalReadings, computeBounds } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f, d) => {
  const a = args.find((x) => x.startsWith(`${f}=`))
  return a ? a.split('=')[1] : d
}

const DRY = has('--dry')
const SPACING = Number(val('--spacing', '2.5'))
const ONLY = val('--site', null)

const FOV_MODE = 'field_360'
const RANGE_M = 200
const RAY_COUNT = 360

// How far a sample point must clear a facade. A point sitting on or inside a
// wall is not a place a person can stand, and its isovist is meaningless — but
// footprints and hand-drawn boundaries do not agree perfectly, so points do
// land inside buildings near the edges. 1 m is about half a pace: close enough
// to keep the sample dense against the facades that shape the space, far enough
// that a point is genuinely in open ground.
const CLEARANCE_M = 1.0

// ------------------------------------------------------------------ geometry

function pointInRing(ring, px, py) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// Shortest distance from a point to a segment — used for the clearance test,
// which needs proximity to a facade, not merely containment within a footprint.
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * vx + (py - y1) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy))
}

// A point is rejected if it sits inside any footprint or within CLEARANCE_M of
// any facade. The index makes this cheap: only edges in nearby cells are tested.
function blocked(px, py, buildings, index) {
  for (const b of buildings) {
    if (pointInRing(b.footprint, px, py)) return true
  }
  const edges = index.empty ? [] : index.edges
  for (const e of edges) {
    if (distanceToSegment(px, py, e.x1, e.y1, e.x2, e.y2) < CLEARANCE_M) return true
  }
  return false
}

// The lattice is anchored to absolute local coordinates rather than to each
// plaza's bounding box, so the grid does not shift when a boundary is redrawn —
// a point keeps its position across boundary edits and re-runs.
function gridPoints(boundary, buildings, index, spacing) {
  const xs = boundary.map((p) => p.x)
  const ys = boundary.map((p) => p.y)
  const x0 = Math.ceil(Math.min(...xs) / spacing) * spacing
  const x1 = Math.max(...xs)
  const y0 = Math.ceil(Math.min(...ys) / spacing) * spacing
  const y1 = Math.max(...ys)

  const kept = []
  let insideBoundary = 0
  for (let x = x0; x <= x1; x += spacing) {
    for (let y = y0; y <= y1; y += spacing) {
      if (!pointInRing(boundary, x, y)) continue
      insideBoundary++
      if (blocked(x, y, buildings, index)) continue
      kept.push({ x, y })
    }
  }
  return { kept, insideBoundary, rejected: insideBoundary - kept.length }
}

// ---------------------------------------------------------------------- main

function main() {
  const sites = read('src/data/sites.json')
  const readings = read('src/data/results.json')
  const active = activeSites(sites)
  const siteIds = active.map((s) => s.id)

  // P5's frozen bounds — the axes the weights were fitted on.
  const bounds = computeBounds(canonicalReadings(readings, siteIds, 'perceptual_360'))

  const targets = ONLY
    ? active.filter((s) => s.id.toLowerCase().includes(ONLY.toLowerCase()) || s.name?.toLowerCase().includes(ONLY.toLowerCase()))
    : active
  if (!targets.length) {
    console.error(`No active site matches --site=${ONLY}`)
    process.exit(1)
  }

  console.log(`P6 field sampling — ${SPACING} m grid, ${RAY_COUNT} rays, ${RANGE_M} m range`)
  console.log(`Normalised against P5 perceptual_360 bounds; points outside 0–1 are kept.\n`)
  console.log(
    '  plaza'.padEnd(22) +
      'in bounds'.padStart(11) +
      'rejected'.padStart(10) +
      'sampled'.padStart(9) +
      'seconds'.padStart(9)
  )

  const perSite = []
  const outOfRange = Object.fromEntries(METRICS.map((m) => [m, 0]))
  let totalPoints = 0

  for (const site of targets) {
    const { buildings, boundary } = projectSite(site)
    if (!boundary) {
      console.log('  ' + (site.name ?? site.id).slice(0, 20).padEnd(22) + 'no boundary — skipped')
      continue
    }
    const index = buildEdgeIndex(buildings)
    const { kept, insideBoundary, rejected } = gridPoints(boundary, buildings, index, SPACING)

    const started = Date.now()
    const points = []
    for (const p of kept) {
      const m = castIsovist(p, 0, buildings, {
        fov: 360,
        rayCount: RAY_COUNT,
        range: RANGE_M,
        index,
      })
      const raw = {
        area: m.area,
        compactness: m.compactness,
        occlusivity: m.occlusivity,
        enclosure: m.enclosureRatio,
      }
      const normalised = METRICS.map((k) => {
        const b = bounds[k]
        const v = (raw[k] - b.min) / (b.max - b.min)
        if (v < 0 || v > 1) outOfRange[k]++
        return round(v, 5)
      })
      points.push({
        x: round(p.x, 2),
        y: round(p.y, 2),
        area_m2: round(raw.area, 2),
        compactness: round(raw.compactness, 5),
        occlusivity_m: round(raw.occlusivity, 2),
        enclosure_ratio: round(raw.enclosure, 5),
        n: normalised,
      })
    }
    const seconds = (Date.now() - started) / 1000
    totalPoints += points.length

    perSite.push({ site_id: site.id, name: site.name ?? site.id, points, insideBoundary, rejected })
    console.log(
      '  ' + (site.name ?? site.id).slice(0, 20).padEnd(22) +
        String(insideBoundary).padStart(11) +
        String(rejected).padStart(10) +
        String(points.length).padStart(9) +
        seconds.toFixed(1).padStart(9)
    )
  }

  console.log('  ' + 'TOTAL'.padEnd(22) + ''.padStart(11) + ''.padStart(10) + String(totalPoints).padStart(9))

  console.log('\n  Share of sampled points outside P5\'s 0–1 range (extrapolation, not error):')
  for (const m of METRICS) {
    const pct = totalPoints ? (outOfRange[m] / totalPoints) * 100 : 0
    console.log('    ' + m.padEnd(14) + `${pct.toFixed(1)}%`.padStart(7) + `   ${outOfRange[m]} of ${totalPoints}`)
  }

  if (DRY) {
    console.log('\n--dry: nothing written.')
    return
  }

  const outDir = path.join(root, 'src/data/fields')
  fs.mkdirSync(outDir, { recursive: true })

  // One file per site. The whole field is ~11,700 points; keeping it out of
  // results.json leaves that file what it has always been — the canonical
  // hand-placed readings — and lets the viewer load only the plaza on screen.
  for (const s of perSite) {
    writeJsonAtomic(path.join(outDir, `${slug(s.site_id)}.json`), {
      site_id: s.site_id,
      name: s.name,
      fov_mode: FOV_MODE,
      fov_deg: 360,
      ray_count: RAY_COUNT,
      range_m: RANGE_M,
      spacing_m: SPACING,
      clearance_m: CLEARANCE_M,
      normalisation_source: 'perceptual_360',
      metrics: METRICS,
      points_in_boundary: s.insideBoundary,
      points_rejected: s.rejected,
      point_count: s.points.length,
      generated_at: new Date().toISOString(),
      points: s.points,
    })
  }

  writeJsonAtomic(path.join(root, 'src/data/fields/index.json'), {
    generated_at: new Date().toISOString(),
    fov_mode: FOV_MODE,
    spacing_m: SPACING,
    range_m: RANGE_M,
    clearance_m: CLEARANCE_M,
    normalisation_source: 'perceptual_360',
    bounds,
    metrics: METRICS,
    total_points: totalPoints,
    out_of_range: outOfRange,
    sites: perSite.map((s) => ({
      site_id: s.site_id,
      name: s.name,
      file: `${slug(s.site_id)}.json`,
      point_count: s.points.length,
      points_rejected: s.rejected,
    })),
  })

  console.log(`\nWrote ${perSite.length} site files + index.json to src/data/fields/`)
}

const round = (v, d) => Number(v.toFixed(d))
const slug = (id) => id.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

main()
