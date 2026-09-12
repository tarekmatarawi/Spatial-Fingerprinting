// P9 — the single-cell probe.
//
// The probe exists because every other number on the diagnose page is a mean
// over an area, and it is only trustworthy if it agrees with the map it is
// pointing at. Two properties carry that, and both are asserted here against
// the real Konstablerwache field rather than a fixture:
//
//   1. the readout READS the record the map was coloured from — it never
//      recomputes, so it cannot drift from the cell under the crosshair
//   2. the outline drawn on the plan is the SAME measurement those numbers
//      describe: its area equals the cell's stored area
//
// The second is the one worth having a test for. A plausible-looking isovist
// drawn from a slightly different cast, or in a different mode, would look
// entirely correct on screen and would quietly be a picture of a different
// place than the table beside it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROBE_SNAP_M, cellIsovist, findCell, readCell } from '../src/lib/probe.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { recomputeField } from '../src/lib/sandbox.js'
import { makePresetElement } from '../src/lib/presets.js'
import { zoneNames } from '../src/lib/zones.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const CASE_SITE_ID = 'Konstablerwache-Frankfurt am Main'
const zones = read('src/data/zones.json')
const fieldIndex = read('src/data/fields/index.json')
const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')
const sites = read('src/data/sites.json')
const geometry = projectSite(activeSites(sites).find((s) => s.id === CASE_SITE_ID))

const CENTRES = zones.centres
const WEIGHTS = zones.weighted_by.weights
const NAMES = zoneNames(CENTRES)

const polygonArea = (pts, about) => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += (a.x - about.x) * (b.y - about.y) - (b.x - about.x) * (a.y - about.y)
  }
  return Math.abs(s) / 2
}

describe('probe — finding the cell', () => {
  test('a click on a sampled position resolves to it', () => {
    const target = field.points[400]
    const found = findCell({ x: target.x, y: target.y }, field.points)
    assert.equal(found.index, 400)
    assert.equal(found.distance, 0)
  })

  test('a click in the gap between cells still resolves to one', () => {
    // The lattice is 2.5 m, so the worst case is the centre of four cells at
    // 1.77 m. A click there must land somewhere rather than nowhere, or half
    // the plaza would feel unresponsive.
    const t = field.points[400]
    const found = findCell({ x: t.x + 1.25, y: t.y + 1.25 }, field.points)
    assert.ok(found, 'a click between four cells resolved to none of them')
    assert.ok(found.distance <= PROBE_SNAP_M)
  })

  test('a click off the sampled lattice resolves to nothing', () => {
    // Rather than snapping to a distant cell the reader was not pointing at,
    // which would put a confident readout on a position nobody clicked.
    assert.equal(findCell({ x: 400, y: 400 }, field.points), null)
    assert.equal(findCell(null, field.points), null)
    assert.equal(findCell({ x: 0, y: 0 }, []), null)
  })
})

describe('probe — the readout reads, it does not re-measure', () => {
  test('every value equals the stored record it came from', () => {
    // THE PROPERTY THE WHOLE DESIGN RESTS ON. A readout that recomputed could
    // disagree with the cell it is pointing at, and a disagreement of that kind
    // is invisible to the eye and discredits both numbers.
    for (let i = 0; i < field.points.length; i += 7) {
      const record = { ...field.points[i], zone: field.zones[i] }
      const r = readCell(record, CENTRES, WEIGHTS, NAMES)
      assert.equal(r.metrics[0].raw, record.area_m2, `cell ${i} area`)
      assert.equal(r.metrics[1].raw, record.compactness, `cell ${i} compactness`)
      assert.equal(r.metrics[2].raw, record.occlusivity_m, `cell ${i} occlusivity`)
      assert.equal(r.metrics[3].raw, record.enclosure_ratio, `cell ${i} enclosure`)
      assert.equal(r.zone, field.zones[i], `cell ${i} zone`)
      assert.deepEqual(
        r.metrics.map((m) => m.n),
        record.n,
        `cell ${i} normalised vector`
      )
    }
  })

  test('the contributions name which metric decided the type', () => {
    const record = { ...field.points[400], zone: field.zones[400] }
    const r = readCell(record, CENTRES, WEIGHTS, NAMES)
    const total = r.metrics.reduce((s, m) => s + m.share, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}, not 1`)
    assert.ok(r.distance > 0)
  })

  test('the three P9-only fields appear only on a recomputed cell', () => {
    // The stored field predates them, so a probe on the as-surveyed map must
    // not invent them — showing a blank or a zero where a real value belongs
    // would read as a measurement rather than as an absence.
    const stored = readCell(
      { ...field.points[400], zone: field.zones[400] },
      CENTRES,
      WEIGHTS,
      NAMES
    )
    assert.equal(stored.p9.length, 0)

    const after = recomputeField({
      points: field.points,
      geometry,
      masses: [],
      bounds: fieldIndex.bounds,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    const live = readCell(after.points[400], CENTRES, WEIGHTS, NAMES)
    assert.deepEqual(
      live.p9.map((f) => f.label),
      ['Solidity', 'Closed share', 'Solid share']
    )
  })
})

describe('probe — the outline is the same measurement as the numbers', () => {
  test('its area equals the cell\'s stored area', () => {
    // If this ever drifts, the plan is drawing a different place than the table
    // beside it describes — and it would look entirely plausible while doing so.
    for (const i of [50, 100, 400, 700, 900]) {
      const cell = field.points[i]
      const iso = cellIsovist(cell, geometry, [])
      const drawn = polygonArea(iso.outline, cell)
      assert.ok(
        Math.abs(drawn - cell.area_m2) < 0.05,
        `cell ${i}: outline encloses ${drawn.toFixed(2)} m² but the cell reads ${cell.area_m2} m²`
      )
    }
  })

  test('it reports which rays ended on something built', () => {
    const iso = cellIsovist(field.points[400], geometry, [])
    assert.equal(iso.outline.length, iso.wall.length)
    assert.ok(iso.wall.some((w) => w === true), 'no ray met a building in a city square')
  })

  test('it is cast through the sandbox when masses are given', () => {
    // The outline on the Tier B plan must show what can be seen WITH the
    // interventions standing, or it would illustrate the wrong plaza.
    const cell = field.points[400]
    const mass = makePresetElement('landmark', { x: cell.x + 12, y: cell.y }, { size: 14, height: 12 }, 0, 'p')
    const plain = cellIsovist(cell, geometry, [])
    const built = cellIsovist(cell, geometry, [mass])
    assert.ok(
      polygonArea(built.outline, cell) < polygonArea(plain.outline, cell),
      'a 14 m block 12 m away did not reduce the drawn isovist'
    )
  })

  test('a probed cell survives an intervention, or reports that it did not', () => {
    const cell = field.points[400]
    const mass = makePresetElement('landmark', { x: cell.x + 12, y: cell.y }, { size: 14, height: 12 }, 0, 'p')
    const after = recomputeField({
      points: field.points,
      geometry,
      masses: [mass],
      bounds: fieldIndex.bounds,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    const still = after.points.find((p) => p.index === 400)
    assert.ok(still, 'the cell should survive a mass placed 12 m away')

    // And one built directly on top of it must leave the sample rather than
    // reporting a reading from inside a building.
    const onTop = makePresetElement('landmark', { x: cell.x, y: cell.y }, { size: 14, height: 12 }, 0, 'q')
    const buried = recomputeField({
      points: field.points,
      geometry,
      masses: [onTop],
      bounds: fieldIndex.bounds,
      centres: CENTRES,
      weights: WEIGHTS,
    })
    assert.equal(
      buried.points.find((p) => p.index === 400),
      undefined,
      'a cell built over must leave the sample, not report from inside a mass'
    )
  })
})

describe('probe — the layer gate', () => {
  test('it measures in field_360 and never reaches the 120° layer', () => {
    // The two layers name the same four metrics, both run 0–1, and are
    // normalised against different frozen bounds — so a probe that quietly
    // borrowed the 120° path would produce numbers that look entirely right.
    // Asserted on the IMPORTS rather than the whole file, because the mistake
    // is an import away and the prose legitimately names the other layer in
    // order to say it is not this one.
    const src = fs.readFileSync(path.join(root, 'src/lib/probe.js'), 'utf8')
    assert.match(src, /SANDBOX_FOV_DEG/, 'probe.js does not cast at the field_360 field of view')

    const imports = [...src.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)]
    const froms = imports.map((m) => m[1])
    for (const forbidden of ['./precedent.js', './viewClouds.js', './matchedView.js']) {
      assert.ok(!froms.includes(forbidden), `probe.js imports ${forbidden} — that is the 120° layer`)
    }
    const body = src.replace(/\/\/[^\n]*/g, '') // comments may name the other layer
    assert.ok(!body.includes('perceptual_120'), 'probe.js uses the 120° normalisation')
    assert.ok(!body.includes('CLOUD_'), 'probe.js uses P7 cloud constants')
  })
})
