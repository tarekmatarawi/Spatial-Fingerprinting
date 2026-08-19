// Regression + correctness tests for the ray-casting engine (P2 — Spatial Analysis).
//
// Run with `npm test`. Uses Node's built-in test runner — no new dependencies.
//
// The suite guards two distinct things:
//
//   1. The 120° perceptual layer must not move. The 18 canonical readings in
//      src/data/results.json are the survey's ground truth; if the engine stops
//      reproducing them, every downstream weight, zone type and hypothesis test
//      is computed against different geometry than the one participants judged.
//      These tests recompute all 18 from source geometry and compare.
//
//   2. The 360° field layer must be geometrically correct. It has no committed
//      reference data yet, so it is tested against shapes whose isovists are
//      known analytically (open plane, square courtyard).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { castIsovist, FOV_DEG, MAX_RANGE_M, RAY_COUNT } from '../src/lib/isovist.js'
import { projectSite, activeSites } from '../src/lib/site.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const sites = readJson('src/data/sites.json')
// results.json now holds several FOV layers side by side. This suite is the
// 120° perceptual layer's regression lock, so it takes only those records —
// the panoramic 360° layer has its own vantage points' worth of rows there too.
const canonicalReadings = readJson('src/data/results.json').filter(
  (r) => r.fov_mode === 'perceptual_120'
)
const golden = readJson('test/fixtures/canonical-120.golden.json')
const siteById = new Map(sites.map((s) => [s.id, s]))

// Recompute one stored reading from the site's raw geometry, exactly as the
// viewer does when it saves.
function recompute(reading) {
  const site = siteById.get(reading.site_id)
  assert.ok(site, `results.json references unknown site "${reading.site_id}"`)
  const { buildings } = projectSite(site)
  return castIsovist(
    { x: reading.local_x, y: reading.local_y },
    (reading.direction_deg * Math.PI) / 180,
    buildings
  )
}

// A square ring of wall centred on the origin, as a single building footprint
// with a hole-free outer boundary would be too far away to hit; instead four
// long thin slabs are used so the enclosed void is a clean square of side 2a.
function courtyard(a, height = 10, thickness = 1) {
  const slab = (cx, cy, hw, hh) => ({
    footprint: [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ],
    height,
  })
  const t = thickness
  return [
    slab(0, a + t, a + 2 * t, t), // north
    slab(0, -(a + t), a + 2 * t, t), // south
    slab(a + t, 0, t, a + 2 * t), // east
    slab(-(a + t), 0, t, a + 2 * t), // west
  ]
}

describe('120° perceptual layer — regression against committed canonical readings', () => {
  test('results.json holds exactly one reading per active site (18)', () => {
    const active = activeSites(sites)
    assert.equal(active.length, 18, 'expected 18 active (non-excluded) sites')
    assert.equal(canonicalReadings.length, 18)
    const seen = new Set(canonicalReadings.map((r) => r.site_id))
    assert.equal(seen.size, 18, 'a site has more than one canonical reading')
    for (const s of active) {
      assert.ok(seen.has(s.id), `no canonical reading for active site "${s.id}"`)
    }
  })

  // The regression lock proper. The golden fixture is full-precision engine
  // output at the 18 canonical vantage points, byte-verified identical either
  // side of the 360° fix. Any change here means the perceptual layer moved, and
  // that must be a deliberate, reviewed decision — not a side effect.
  test('the engine reproduces the golden snapshot exactly', () => {
    assert.equal(golden.readings.length, 18)
    for (const g of golden.readings) {
      const m = recompute(g)
      for (const key of ['area', 'perimeter', 'compactness', 'occlusivity', 'enclosureRatio']) {
        assert.equal(
          m[key],
          g[key],
          `${g.site_id} ${key} moved — the 120° perceptual layer must not change silently`
        )
      }
    }
  })

  // The committed readings are correct as captured, but they are not exactly
  // reproducible from the file: the viewer stores direction_deg to 1 dp and
  // local_x/y to 2 dp, so recomputing re-casts from a very slightly different
  // pose than the one the researcher actually aimed. At sites with street
  // openings a sub-degree rotation can flip a single ray between a near facade
  // and a 200 m escape, which moves area by ~2% and occlusivity by ~12%.
  //
  // So the check is: does the stored reading lie somewhere inside the pose
  // window that rounding leaves open? If yes, the reading is sound. If no,
  // something other than rounding has changed and it needs a human.
  test('every stored reading is reachable within its own rounding window', () => {
    const unreachable = []
    for (const reading of canonicalReadings) {
      const site = siteById.get(reading.site_id)
      const { buildings } = projectSite(site)
      let bestErr = Infinity
      // The window is whatever this record's own stored precision leaves open:
      // half a unit in the last decimal place it was saved with. Readings
      // captured at 1 dp get ±0.05°; ones saved since the viewer moved to 2 dp
      // get ±0.005° and are held to the tighter standard automatically.
      const dp = (String(reading.direction_deg).split('.')[1] || '').length
      const halfStep = 0.5 * 10 ** -dp
      for (let dd = -halfStep; dd <= halfStep * 1.001; dd += halfStep / 4) {
        for (const dx of [-0.005, 0, 0.005]) {
          for (const dy of [-0.005, 0, 0.005]) {
            const m = castIsovist(
              { x: reading.local_x + dx, y: reading.local_y + dy },
              ((reading.direction_deg + dd) * Math.PI) / 180,
              buildings
            )
            const err = Math.max(
              Math.abs(m.area - reading.area_m2) / reading.area_m2,
              Math.abs(m.occlusivity - reading.occlusivity_m) /
                Math.max(reading.occlusivity_m, 1e-9)
            )
            if (err < bestErr) bestErr = err
          }
        }
      }
      if (bestErr > 0.005) {
        unreachable.push(`${reading.site_id} (best match still ${(bestErr * 100).toFixed(2)}% off)`)
      }
    }
    assert.deepEqual(
      unreachable,
      [],
      'these readings cannot be reproduced from any pose within their stored precision, ' +
        'so the site geometry has changed since capture and they need re-saving:\n  ' +
        unreachable.join('\n  ')
    )
  })

  // Documents the sensitivity above so it cannot be forgotten at writing-up
  // time, and fails if it ever becomes much worse than measured.
  test('metric sensitivity to sub-degree heading is bounded and known', () => {
    const { buildings } = projectSite(siteById.get('Herderplatz-Weimar'))
    const at = { x: 5.8, y: -4.15 }
    const areas = []
    const occs = []
    for (let d = 89.0; d <= 90.2; d += 0.1) {
      const m = castIsovist(at, (d * Math.PI) / 180, buildings)
      areas.push(m.area)
      occs.push(m.occlusivity)
    }
    const spread = (v) => (Math.max(...v) - Math.min(...v)) / (Math.min(...v) || 1)
    // Measured 2026-08-17: area ~3.9%, occlusivity ~27% across a 1.2° sweep.
    // Real geometry (rays escaping down side streets), not an engine fault —
    // but it is why occlusivity's fitted weight deserves a caveat in P5.
    assert.ok(spread(areas) < 0.08, `area spread ${spread(areas)} unexpectedly large`)
    assert.ok(spread(occs) < 0.40, `occlusivity spread ${spread(occs)} unexpectedly large`)
    assert.ok(spread(occs) > spread(areas), 'occlusivity is expected to be the volatile metric')
  })

  test('Gendarmenmarkt sits in the right order of magnitude vs the Grasshopper reference', () => {
    // Soft sanity check only — per docs/spec.md the original Grasshopper vantage
    // point and heading were never recorded, so the canonical reading is at a
    // different (Street-View-matched) point and an exact match is not expected.
    // This asserts the engine is in the same world as the reference, nothing more.
    const m = recompute(canonicalReadings.find((r) => r.site_id === 'Gendarmenmarkt-Berlin'))
    assert.ok(m.area > 8000 && m.area < 18000, `area ${m.area} far from reference 12437.9 m²`)
    assert.ok(m.occlusivity > 150 && m.occlusivity < 600, `occlusivity ${m.occlusivity} implausible`)
    assert.ok(m.enclosureRatio > 0.1 && m.enclosureRatio < 0.8, `enclosure ${m.enclosureRatio}`)
    assert.ok(m.compactness > 0 && m.compactness <= 1, `compactness ${m.compactness} out of range`)
  })

  test('the wedge still closes through the vantage point', () => {
    // 120° over open ground is a circular sector: area = (fov/360)·πr², and the
    // perimeter includes the two straight radii back to the vantage point.
    const m = castIsovist({ x: 0, y: 0 }, 0, [])
    const r = MAX_RANGE_M
    const expectedArea = (FOV_DEG / 360) * Math.PI * r * r
    assert.ok(
      Math.abs(m.area - expectedArea) / expectedArea < 0.01,
      `sector area ${m.area} vs expected ${expectedArea}`
    )
    const expectedPerimeter = 2 * r + (FOV_DEG / 360) * 2 * Math.PI * r
    assert.ok(
      Math.abs(m.perimeter - expectedPerimeter) / expectedPerimeter < 0.01,
      `sector perimeter ${m.perimeter} vs expected ${expectedPerimeter} (the two radii must be included)`
    )
    assert.equal(m.occlusivity, 0, 'open ground has no wall-to-wall edges')
    assert.equal(m.enclosureRatio, 0, 'open ground has no wall hits')
  })

  test('ray bearings span the wedge inclusively, first to last', () => {
    const m = castIsovist({ x: 0, y: 0 }, 0, [])
    assert.equal(m.rays.length, RAY_COUNT)
    const half = (FOV_DEG * Math.PI) / 180 / 2
    assert.ok(Math.abs(m.rays[0].angle - -half) < 1e-9, 'first ray should sit on the cone edge')
    assert.ok(
      Math.abs(m.rays[m.rays.length - 1].angle - half) < 1e-9,
      'last ray should sit on the opposite cone edge'
    )
  })
})

describe('360° field layer — geometric correctness', () => {
  const full = { fov: 360, rayCount: 360 }

  test('360 rays sample 360 distinct bearings (no duplicated first/last)', () => {
    const m = castIsovist({ x: 0, y: 0 }, 0, [], full)
    assert.equal(m.rays.length, 360)
    const norm = (a) => Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 1e6)
    assert.equal(new Set(m.rays.map((r) => norm(r.angle))).size, 360, 'a bearing is sampled twice')
  })

  test('open plane: area = πr² and compactness ≈ 1 (no vantage-point spoke)', () => {
    const m = castIsovist({ x: 0, y: 0 }, 0, [], full)
    const r = MAX_RANGE_M
    const expectedArea = Math.PI * r * r
    assert.ok(
      Math.abs(m.area - expectedArea) / expectedArea < 0.001,
      `area ${m.area} vs πr² ${expectedArea}`
    )
    // The bug being guarded: including the vantage point added ~2r (400 m) to a
    // ~1257 m circumference, dragging compactness from ~1.0 to ~0.58.
    const expectedPerimeter = 2 * Math.PI * r
    assert.ok(
      Math.abs(m.perimeter - expectedPerimeter) / expectedPerimeter < 0.001,
      `perimeter ${m.perimeter} vs 2πr ${expectedPerimeter} — a spoke through the vantage point is being counted`
    )
    assert.ok(m.compactness > 0.99, `compactness ${m.compactness} — a full circle must be ≈ 1`)
  })

  test('square courtyard: area matches the enclosed square', () => {
    const a = 40 // half-width of the void → 80 m × 80 m square
    const m = castIsovist({ x: 0, y: 0 }, 0, courtyard(a), { fov: 360, rayCount: 1440 })
    const expectedArea = (2 * a) ** 2
    assert.ok(
      Math.abs(m.area - expectedArea) / expectedArea < 0.01,
      `area ${m.area} vs square ${expectedArea}`
    )
    assert.ok(
      m.rays.every((r) => r.wall),
      'every ray in a closed courtyard must hit a wall'
    )
    // Fully enclosed: every adjacent vertex pair is wall-to-wall, so the closed
    // perimeter equals the whole perimeter — including the wrap-around edge.
    assert.ok(
      Math.abs(m.occlusivity - m.perimeter) < 1e-6,
      `occlusivity ${m.occlusivity} should equal perimeter ${m.perimeter} when fully enclosed`
    )
  })

  test('square courtyard: enclosure ratio matches the analytic mean of h/d', () => {
    const a = 40
    const height = 20
    const rayCount = 1440
    const m = castIsovist({ x: 0, y: 0 }, 0, courtyard(a, height), { fov: 360, rayCount })
    let expected = 0
    for (let i = 0; i < rayCount; i++) {
      const angle = -Math.PI + (i / rayCount) * 2 * Math.PI
      // Distance from centre to the wall of a square of half-width a.
      const d = a / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle)))
      expected += height / d
    }
    expected /= rayCount
    assert.ok(
      Math.abs(m.enclosureRatio - expected) / expected < 0.01,
      `enclosure ${m.enclosureRatio} vs analytic ${expected}`
    )
  })

  test('rotating the heading does not change any 360° metric', () => {
    // An omnidirectional isovist is a property of the location alone. If the
    // heading leaks into it, the field layer is not direction-free and the whole
    // layer separation is unsound.
    const buildings = courtyard(35, 15)
    const at = { x: 4, y: -7 } // deliberately off-centre
    const base = castIsovist(at, 0, buildings, full)
    for (const deg of [37, 90, 180, 271]) {
      const m = castIsovist(at, (deg * Math.PI) / 180, buildings, full)
      for (const key of ['area', 'perimeter', 'compactness', 'occlusivity', 'enclosureRatio']) {
        assert.ok(
          Math.abs(m[key] - base[key]) / Math.max(Math.abs(base[key]), 1e-9) < 0.02,
          `${key} moved by heading ${deg}°: ${m[key]} vs ${base[key]}`
        )
      }
    }
  })

  test('the two layers report their own fov, so records can never be ambiguous', () => {
    assert.equal(castIsovist({ x: 0, y: 0 }, 0, []).fov, 120)
    assert.equal(castIsovist({ x: 0, y: 0 }, 0, [], full).fov, 360)
  })
})
