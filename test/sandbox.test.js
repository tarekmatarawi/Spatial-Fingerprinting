// P9 Tier B's gate.
//
// docs/spec.md states it as: "an edit changes the local zone map and
// composition profile; nothing persists to sites.json." Both halves are tested
// here against the real Konstablerwache field, not a fixture — the claim is
// about this plaza's actual geometry, and a constructed one could satisfy the
// arithmetic while saying nothing about the case the thesis presents.
//
// The first test is the more important one and is not in the spec: with NO
// masses, the sandbox must reproduce P6's stored field. Everything the phase
// reports is a before/after difference, so if the "after" path disagreed with
// the "before" data even slightly, every edit would show phantom changes that
// are really just two different code paths measuring the same plaza.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  composeGeometry,
  diffField,
  makeMass,
  polygonArea,
  recomputeField,
  validateMass,
} from '../src/lib/sandbox.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { assignZone } from '../src/lib/zones.js'
import {
  blockingParts,
  defaultParams,
  elementParts,
  makeDemolition,
  makeRecessElement,
} from '../src/lib/presets.js'
import { METRICS } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const CASE_SITE_ID = 'Konstablerwache-Frankfurt am Main'
const zones = read('src/data/zones.json')
const fieldIndex = read('src/data/fields/index.json')
const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')
const sites = read('src/data/sites.json')

const site = activeSites(sites).find((s) => s.id === CASE_SITE_ID)
const geometry = projectSite(site)
const CENTRES = zones.centres
const WEIGHTS = zones.weighted_by.weights
const BOUNDS = fieldIndex.bounds

// A mass in the open middle of the plaza. Placed where the field is densest so
// the edit has something to change, and kept clear of the boundary so the test
// is about the intervention rather than about clipping.
const CENTRAL_MASS = makeMass(
  [
    { x: -30, y: -10 },
    { x: -10, y: -10 },
    { x: -10, y: 10 },
    { x: -30, y: 10 },
  ],
  24,
  'test-mass'
)

describe('sandbox — reproducing the field it edits', () => {
  test('with no masses, the recompute returns P6’s stored readings', () => {
    const out = recomputeField({
      points: field.points,
      geometry,
      masses: [],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })

    assert.equal(out.points.length, field.points.length, 'no point may be dropped by an empty edit')
    assert.equal(out.dropped.length, 0)

    let worstMetric = 0
    for (let i = 0; i < out.points.length; i++) {
      const got = out.points[i]
      const stored = field.points[i]
      assert.equal(got.x, stored.x)
      assert.equal(got.y, stored.y)
      for (const [, key] of [
        ['area', 'area_m2'],
        ['compactness', 'compactness'],
        ['occlusivity', 'occlusivity_m'],
        ['enclosure', 'enclosure_ratio'],
      ]) {
        const relative = Math.abs(got[key] - stored[key]) / Math.max(Math.abs(stored[key]), 1e-6)
        worstMetric = Math.max(worstMetric, relative)
      }
    }
    // Storage rounds to 2–5 places, so exact equality is not available; what
    // matters is that the difference is at the rounding scale and not at the
    // scale of a geometry or convention difference.
    assert.ok(worstMetric < 1e-4, `worst relative metric difference ${worstMetric}`)
  })

  test('and re-assigns every point to the zone P6 gave it', () => {
    const out = recomputeField({
      points: field.points,
      geometry,
      masses: [],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    let mismatched = 0
    for (const p of out.points) {
      if (p.zone !== field.zones[p.index]) mismatched++
    }
    assert.equal(
      mismatched,
      0,
      `${mismatched} points change zone with no edit applied — the before/after ` +
        'comparison would attribute those to the intervention'
    )
  })
})

describe('sandbox — the gate: an edit changes the zone map', () => {
  const after = recomputeField({
    points: field.points,
    geometry,
    masses: [CENTRAL_MASS],
    bounds: BOUNDS,
    centres: CENTRES,
    weights: WEIGHTS,
  })
  const diff = diffField(field.zones, after, zones.k)

  test('points swallowed by the new mass leave the sample', () => {
    assert.ok(
      after.dropped.length > 0,
      'a 20×20 m mass in the open middle of the plaza must cover some sampled points'
    )
    assert.equal(after.points.length + after.dropped.length, field.points.length)
  })

  test('the local zone map changes', () => {
    assert.ok(
      diff.changedCount > 0,
      'the gate requires an edit to change the zone map; nothing changed'
    )
    // Every changed point must genuinely re-derive to its new zone — the diff
    // is a report, not the assignment itself.
    for (const c of diff.changed.slice(0, 50)) {
      const point = after.points.find((p) => p.index === c.index)
      assert.equal(assignZone(point.n, CENTRES, WEIGHTS), c.to)
      assert.notEqual(c.from, c.to)
    }
  })

  test('the composition profile changes', () => {
    const moved = diff.afterShares.some(
      (share, i) => Math.abs(share - diff.beforeShares[i]) > 0.001
    )
    assert.ok(moved, 'the gate requires the composition profile to change')
    assert.ok(Math.abs(diff.afterShares.reduce((s, v) => s + v, 0) - 1) < 1e-9)
  })

  test('a wall raises enclosure at the points that can see it', () => {
    // Direction, not only difference. A mass 24 m tall dropped into open ground
    // must RAISE enclosure nearby; if the sign came out the other way the
    // arithmetic would still "change the map" and be entirely wrong.
    const near = after.points.filter((p) => {
      const dx = p.x - -20
      const dy = p.y - 0
      return Math.hypot(dx, dy) < 40
    })
    assert.ok(near.length > 20, 'expected a population of points near the mass')

    let raised = 0
    for (const p of near) {
      if (p.enclosure_ratio > field.points[p.index].enclosure_ratio) raised++
    }
    assert.ok(
      raised / near.length > 0.9,
      `only ${raised} of ${near.length} nearby points gained enclosure from a 24 m wall`
    )
  })

  test('the flow matrix accounts for every surviving point', () => {
    const total = diff.flow.flat().reduce((s, v) => s + v, 0)
    assert.equal(total, after.points.length)
    // The diagonal is the points that kept their type.
    const stayed = diff.flow.reduce((s, row, i) => s + row[i], 0)
    assert.equal(stayed + diff.changedCount, after.points.length)
  })
})

describe('sandbox — nothing persists', () => {
  test('recomputing does not mutate the site, its geometry, or the stored field', () => {
    const siteBefore = JSON.stringify(site)
    const geometryBefore = JSON.stringify(geometry.buildings.length)
    const fieldBefore = JSON.stringify(field.points.slice(0, 20))

    recomputeField({
      points: field.points,
      geometry,
      masses: [CENTRAL_MASS],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })

    assert.equal(JSON.stringify(site), siteBefore, 'the site record was mutated')
    assert.equal(JSON.stringify(geometry.buildings.length), geometryBefore, 'geometry gained buildings')
    assert.equal(JSON.stringify(field.points.slice(0, 20)), fieldBefore, 'the stored field was mutated')
  })

  test('composeGeometry leaves the original building list untouched', () => {
    const originalCount = geometry.buildings.length
    const composed = composeGeometry(geometry, [CENTRAL_MASS])
    assert.equal(geometry.buildings.length, originalCount)
    assert.equal(composed.buildings.length, originalCount + 1)
    assert.equal(composed.buildings[originalCount].sandbox, true)
    assert.equal(composed.buildings[originalCount].height, 24)
    // Every surveyed building must come through unflagged, so a drawn mass can
    // never be mistaken for measured geometry downstream.
    for (let i = 0; i < originalCount; i++) {
      assert.notEqual(composed.buildings[i].sandbox, true)
    }
  })

  test('sites.json on disk is byte-identical after a sandbox run', () => {
    const before = fs.readFileSync(path.join(root, 'src/data/sites.json'))
    recomputeField({
      points: field.points.slice(0, 50),
      geometry,
      masses: [CENTRAL_MASS],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    const afterBytes = fs.readFileSync(path.join(root, 'src/data/sites.json'))
    assert.ok(before.equals(afterBytes), 'sites.json changed during a sandbox recompute')
  })
})

describe('sandbox — mass validation', () => {
  test('accepts a well-formed mass', () => {
    assert.doesNotThrow(() => validateMass(CENTRAL_MASS))
  })

  test('rejects the shapes that would corrupt a cast', () => {
    assert.throws(() => validateMass(null), /Expected a mass/)
    assert.throws(
      () => validateMass({ footprint: [{ x: 0, y: 0 }, { x: 1, y: 1 }], height_m: 10 }),
      /three corners/
    )
    assert.throws(() => validateMass({ ...CENTRAL_MASS, height_m: 0 }), /positive height/)
    assert.throws(() => validateMass({ ...CENTRAL_MASS, height_m: -5 }), /positive height/)
    assert.throws(
      () => validateMass({ ...CENTRAL_MASS, footprint: [{ x: 0, y: NaN }, { x: 1, y: 0 }, { x: 0, y: 1 }] }),
      /non-finite/
    )
    // A degenerate sliver has no interior for the point-in-mass test to agree
    // about, and contributes edges the ray-caster would meet from both sides.
    assert.throws(
      () =>
        validateMass(
          makeMass([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.01 }], 12)
        ),
      /no meaningful area/
    )
  })

  test('polygonArea is orientation-independent', () => {
    const clockwise = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]
    const anticlockwise = [...clockwise].reverse()
    assert.ok(Math.abs(polygonArea(clockwise) - 100) < 1e-9)
    assert.ok(Math.abs(polygonArea(anticlockwise) - 100) < 1e-9)
  })
})

describe('sandbox — layer discipline', () => {
  test('the recompute declares the field layer and P5 normalisation', () => {
    const out = recomputeField({
      points: field.points.slice(0, 10),
      geometry,
      masses: [],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    assert.equal(out.fovMode, 'field_360')
    assert.equal(out.normalisationSource, 'perceptual_360')
    assert.equal(out.fovMode, field.fov_mode, 'sandbox and stored field must share a layer')
    assert.equal(out.normalisationSource, field.normalisation_source)
  })

  test('normalisation uses the frozen bounds, not the sandbox’s own range', () => {
    // A tall mass drives some points well outside 0–1. Those must be KEPT
    // unclipped, exactly as P6 keeps its own out-of-range points — clipping
    // would collapse genuinely distinct positions onto the boundary value.
    const tall = makeMass(
      [
        { x: -30, y: -10 },
        { x: -10, y: -10 },
        { x: -10, y: 10 },
        { x: -30, y: 10 },
      ],
      80
    )
    const out = recomputeField({
      points: field.points,
      geometry,
      masses: [tall],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    const outside = out.points.filter((p) => p.n.some((v) => v < 0 || v > 1))
    assert.ok(outside.length > 0, 'an 80 m wall should push some readings past the frozen range')
    for (const p of out.points) {
      for (const v of p.n) assert.ok(Number.isFinite(v))
    }
    assert.equal(METRICS.length, 4)
  })
})

// Demolition — the only move in the sandbox that makes an isovist LARGER.
//
// Added 2026-09-10. Every additive preset lowers area, compactness and
// occlusivity together; measured across all nine, that is the single direction
// they travel. So with additions alone, whole regions of the typology are
// unreachable — "Vast, regular" in particular requires area to RISE, which
// nothing you can build will do. Removing a building is the move that opens it.
//
// The tests below are mostly about INDEX INTEGRITY, because that is where this
// feature can go wrong invisibly: a recess addresses its host by index into the
// site's building list, and removing an earlier entry from that array before the
// recesses are applied would shift every later index and carve the recess into
// the wrong block. Nothing about a mis-indexed recess looks wrong.
describe('sandbox — removing a building', () => {
  const HOST = 40

  test('the named building stops standing, and only that one', () => {
    const composed = composeGeometry(geometry, [makeDemolition(3)])
    assert.equal(composed.buildings.length, geometry.buildings.length - 1)
    assert.ok(composed.demolished.has(3))
    assert.equal(composed.demolished.size, 1)
  })

  test('a demolition contributes no parts to draw or to cast against', () => {
    assert.deepEqual(elementParts(makeDemolition(3)), [])
    assert.deepEqual(blockingParts(makeDemolition(3)), [])
  })

  test('a recess still cuts ITS OWN host after an earlier building is removed', () => {
    // The ordering bug this pins: demolitions are collected first and applied
    // LAST, after every index-based edit is done with. Remove building 3 before
    // the recess is cut and the recess lands on what used to be building 41.
    const ring = geometry.buildings[HOST].footprint
    const facade = {
      building: HOST,
      edge: 0,
      t: 0.5,
      distance: 0,
      length: Math.hypot(ring[1].x - ring[0].x, ring[1].y - ring[0].y),
    }
    const recess = makeRecessElement(facade, defaultParams('recessedArcade'))

    const alone = composeGeometry(geometry, [recess])
    const withDemolition = composeGeometry(geometry, [makeDemolition(3), recess])

    assert.equal(alone.recesses.length, 1)
    assert.equal(withDemolition.recesses.length, 1)
    assert.equal(withDemolition.recesses[0].element.building, HOST)
    // The cut geometry itself must be identical — same host, same edge, same
    // opening — whether or not an unrelated block was removed.
    assert.deepEqual(withDemolition.recesses[0].cut.opening, alone.recesses[0].cut.opening)
  })

  test('a recess into a building that has been removed is skipped, not thrown on', () => {
    const ring = geometry.buildings[HOST].footprint
    const facade = {
      building: HOST,
      edge: 0,
      t: 0.5,
      distance: 0,
      length: Math.hypot(ring[1].x - ring[0].x, ring[1].y - ring[0].y),
    }
    const composed = composeGeometry(geometry, [
      makeRecessElement(facade, defaultParams('recessedArcade')),
      makeDemolition(HOST),
    ])
    assert.equal(composed.recesses.length, 0, 'a recess into thin air cuts nothing')
    assert.ok(composed.demolished.has(HOST))
  })

  test('a demolition naming a building that does not exist is ignored', () => {
    const composed = composeGeometry(geometry, [makeDemolition(99999)])
    assert.equal(composed.buildings.length, geometry.buildings.length)
    assert.equal(composed.demolished.size, 0)
  })

  test('removing blocks raises isovist area — the direction nothing else can go', () => {
    const areaOf = (i) => {
      const r = geometry.buildings[i].footprint
      let s = 0
      for (let j = 0, k = r.length - 1; j < r.length; k = j++) {
        s += r[k].x * r[j].y - r[j].x * r[k].y
      }
      return Math.abs(s) / 2
    }
    const biggest = geometry.buildings
      .map((_, i) => i)
      .sort((a, b) => areaOf(b) - areaOf(a))
      .slice(0, 12)

    const common = { points: field.points, geometry, bounds: BOUNDS, centres: CENTRES, weights: WEIGHTS }
    const before = recomputeField({ ...common, masses: [] })
    const after = recomputeField({ ...common, masses: biggest.map((i) => makeDemolition(i)) })

    const meanArea = (out) => out.points.reduce((s, p) => s + p.area_m2, 0) / out.points.length
    assert.ok(
      meanArea(after) > meanArea(before),
      `removing 12 blocks should enlarge the mean isovist, got ${meanArea(before).toFixed(0)} -> ${meanArea(after).toFixed(0)}`
    )
    // And no point may be dropped: a demolition takes nothing away from the
    // sample, it only opens sightlines. The cleared footprint stays unsampled
    // because P6 never laid points inside a building — a hole in the map, not
    // new plaza. See the note in recomputeField.
    assert.equal(after.dropped.length, 0)
    assert.equal(after.points.length, before.points.length)
  })

  test('nothing about a demolition reaches sites.json', () => {
    // The phase gate, for this move specifically. A demolition stores an INDEX,
    // never a copy of the footprint — copying the geometry would put site
    // register data into a scenario file that is forbidden to hold it, and
    // would create a second version of that building able to disagree with the
    // register after a re-survey.
    const el = makeDemolition(3)
    assert.deepEqual(Object.keys(el).sort(), ['building', 'drawn_at', 'id', 'kind'])
    assert.equal(typeof el.building, 'number')
    assert.ok(!('footprint' in el))
    assert.ok(!('height' in el))

    const before = JSON.stringify(sites)
    composeGeometry(geometry, [el])
    recomputeField({
      points: field.points.slice(0, 50),
      geometry,
      masses: [el],
      bounds: BOUNDS,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    assert.equal(JSON.stringify(sites), before, 'the site register was mutated')
  })
})
