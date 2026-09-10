// P9 — the preset library's own invariants.
//
// npm run validate:presets checks what each preset DOES to the four metrics on
// real geometry. This file checks the things that must hold regardless of any
// measurement: that a generator produces well-formed parts, that the
// eye-height rule is applied consistently, and — the reason this file exists —
// that the host rule for subtractive presets is a standing rule rather than a
// patch applied once to the recessed arcade.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EYE_HEIGHT_M,
  MIN_FACADE_HEIGHT_M,
  MIN_FACADE_LENGTH_M,
  NON_DIAGNOSTIC_METRICS,
  PRESETS,
  defaultParams,
  describeElement,
  elementParts,
  generateRecess,
  makePresetElement,
  makeRecessElement,
  nearestFacade,
  normaliseExpectation,
  partBlocks,
  presetById,
  recessedGroundRing,
} from '../src/lib/presets.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { METRICS } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sites = read('src/data/sites.json')
const site = activeSites(sites).find((s) => s.id === 'Konstablerwache-Frankfurt am Main')
const geometry = projectSite(site)

const P9_METRICS = [...METRICS, 'solidShare', 'solidFrontage', 'solidity']
const ANCHOR = { x: -20, y: 0 }

describe('presets — every generator produces usable geometry', () => {
  for (const preset of PRESETS.filter((p) => !p.subtractive)) {
    test(`${preset.name} builds valid parts at its defaults`, () => {
      const element = makePresetElement(preset.id, ANCHOR, defaultParams(preset.id), 0)
      const parts = elementParts(element)
      assert.ok(parts.length > 0, 'a generator must produce at least one part')
      for (const part of parts) {
        assert.ok(Array.isArray(part.footprint) && part.footprint.length >= 3)
        for (const p of part.footprint) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'non-finite corner')
        }
        assert.ok(Number.isFinite(part.base) && part.base >= 0, `bad base ${part.base}`)
        assert.ok(Number.isFinite(part.top) && part.top > part.base, `bad top ${part.top}`)
        assert.ok(typeof part.role === 'string' && part.role.length > 0)
      }
    })

    test(`${preset.name} responds to every one of its parameters`, () => {
      // A parameter that changes nothing is a slider that lies. Each one is
      // moved to its maximum in turn and the geometry must differ.
      const base = defaultParams(preset.id)
      const baseline = JSON.stringify(
        elementParts(makePresetElement(preset.id, ANCHOR, base, 0))
      )
      for (const [key, spec] of Object.entries(preset.params)) {
        const moved = { ...base, [key]: spec.max }
        const changed = JSON.stringify(
          elementParts(makePresetElement(preset.id, ANCHOR, moved, 0))
        )
        // Roof openness drives the 3D view only and cannot move a footprint;
        // it is the one parameter allowed to leave the plan geometry alone,
        // and it is declared here rather than skipped silently.
        if (preset.id === 'pergola' && key === 'openness') {
          assert.notEqual(base[key], spec.max, 'openness must still have a range')
          continue
        }
        assert.notEqual(changed, baseline, `${key} does not change the geometry`)
      }
    })
  }
})

describe('presets — the eye-height rule', () => {
  test('a part blocks only where it straddles the slice', () => {
    assert.equal(partBlocks({ base: 0, top: 10 }), true)
    assert.equal(partBlocks({ base: 0, top: EYE_HEIGHT_M }), false, 'top exactly at eye height')
    assert.equal(partBlocks({ base: 0, top: 1.2 }), false, 'a low wall')
    assert.equal(partBlocks({ base: 3, top: 4 }), false, 'a canopy overhead')
    assert.equal(partBlocks({ base: EYE_HEIGHT_M, top: 5 }), true, 'based exactly at eye height')
  })

  test('the low wall and the plinth cannot reach the slice at any setting', () => {
    // Their whole documented behaviour is that they are invisible to this
    // instrument. The low wall's height is capped below eye height by its own
    // parameter range, so this is a property of the library rather than of a
    // default that could be dialled past.
    const lowWall = presetById.get('lowWall')
    assert.ok(lowWall.params.height.max < EYE_HEIGHT_M, 'a low wall must stay under the slice')

    const element = makePresetElement('lowWall', ANCHOR, {
      ...defaultParams('lowWall'),
      height: lowWall.params.height.max,
    })
    assert.equal(elementParts(element).some(partBlocks), false)
  })

  test('the tree row flips from trunks to canopy as clearance crosses the slice', () => {
    // The blocking rule is not special-cased for planting: lowering the canopy
    // below eye height makes the CANOPY the obstacle rather than the trunk,
    // which is the instrument agreeing that a hedge is not a tree.
    const raised = elementParts(
      makePresetElement('treeRow', ANCHOR, { ...defaultParams('treeRow'), clearance: 2.5 })
    ).filter(partBlocks)
    const lowered = elementParts(
      makePresetElement('treeRow', ANCHOR, { ...defaultParams('treeRow'), clearance: 0.5 })
    ).filter(partBlocks)

    assert.ok(raised.every((p) => p.role === 'trunk'), 'a raised canopy leaves only trunks')
    assert.ok(lowered.every((p) => p.role === 'canopy'), 'a lowered canopy blocks instead')
    assert.ok(lowered.length > 0)
  })
})

describe('presets — the standing host rule for subtractive presets', () => {
  const subtractive = PRESETS.filter((p) => p.subtractive)

  test('there is at least one subtractive preset to govern', () => {
    assert.ok(subtractive.length > 0)
  })

  test('nearestFacade rejects hosts too small to carve into', () => {
    // The bug this rule exists for: a 1.98 m edge on a 3.2 m kiosk standing in
    // the plaza was selected over every real facade because it was nearer.
    const shed = [
      {
        footprint: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
        height: 3.2,
      },
    ]
    assert.equal(nearestFacade({ x: 1, y: -1 }, shed, 50), null, 'a 2 m shed is not a facade')

    const tallButShort = [{ footprint: shed[0].footprint, height: 20 }]
    assert.equal(
      nearestFacade({ x: 1, y: -1 }, tallButShort, 50),
      null,
      'tall enough but every edge too short'
    )

    const longButLow = [
      {
        footprint: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
          { x: 0, y: 20 },
        ],
        height: 4,
      },
    ]
    assert.equal(nearestFacade({ x: 20, y: -3 }, longButLow, 50), null, 'long enough but too low')
  })

  test('every selected host satisfies both thresholds, on real geometry', () => {
    const facade = nearestFacade(ANCHOR, geometry.buildings, 80)
    assert.ok(facade, 'Konstablerwache must offer a usable facade within 80 m of the anchor')
    const host = geometry.buildings[facade.building]
    assert.ok(
      host.height >= MIN_FACADE_HEIGHT_M,
      `host is ${host.height} m, under the ${MIN_FACADE_HEIGHT_M} m rule`
    )
    assert.ok(
      facade.length >= MIN_FACADE_LENGTH_M,
      `edge is ${facade.length} m, under the ${MIN_FACADE_LENGTH_M} m rule`
    )
  })

  test('a sandbox-drawn mass is never offered as a host', () => {
    // Otherwise a recess could be carved into another intervention, which is
    // not what "carve into an existing building" means.
    const withSandbox = [
      ...geometry.buildings,
      {
        footprint: [
          { x: -40, y: -40 },
          { x: 0, y: -40 },
          { x: 0, y: -10 },
          { x: -40, y: -10 },
        ],
        height: 30,
        sandbox: true,
      },
    ]
    const facade = nearestFacade({ x: -20, y: -25 }, withSandbox, 80)
    if (facade) assert.notEqual(withSandbox[facade.building].sandbox, true)
  })

  test('a recess contributes no additive parts', () => {
    // REGRESSION. A recess element fell through to the freeform branch of
    // elementParts and produced a part with `footprint: undefined`, which
    // crashed the plan the instant one was placed. A subtractive element adds
    // nothing; the assertion is that it says so rather than producing a part
    // nobody can draw.
    const facade = nearestFacade(ANCHOR, geometry.buildings, 80)
    const element = makeRecessElement(facade, defaultParams('recessedArcade'))
    assert.deepEqual(elementParts(element), [])
    assert.deepEqual(elementParts(element).filter(partBlocks), [])
  })

  test('every element kind can be described without touching a field it lacks', () => {
    // REGRESSION, and the one that actually reached the researcher. A panel
    // listed the sandbox by reading `element.footprint.length`, which only a
    // freehand mass has — so placing any preset and then opening that panel
    // crashed the page, and kept crashing after a reload because the preset
    // was restored from storage. Every list of sandbox contents now goes
    // through describeElement, and this is what holds it to covering all kinds.
    const facade = nearestFacade(ANCHOR, geometry.buildings, 80)
    const samples = [
      makeRecessElement(facade, defaultParams('recessedArcade')),
      ...PRESETS.filter((p) => !p.subtractive).map((p) =>
        makePresetElement(p.id, ANCHOR, defaultParams(p.id), 0)
      ),
      {
        id: 'freehand-1',
        kind: 'freeform',
        footprint: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
        ],
        height_m: 12,
      },
    ]

    for (const element of samples) {
      const label = describeElement(element)
      assert.equal(typeof label, 'string', `${element.kind} produced ${typeof label}`)
      assert.ok(label.length > 0, `${element.kind} produced an empty label`)
      assert.ok(!label.includes('undefined'), `${element.kind} label leaked undefined: "${label}"`)
    }

    // And it must not throw on the shapes a panel could plausibly be handed.
    assert.doesNotThrow(() => describeElement(null))
    assert.doesNotThrow(() => describeElement({ id: 'x', kind: 'teleporter' }))
    assert.doesNotThrow(() => describeElement({ id: 'y', kind: 'freeform' }))
  })

  test('an element of an unknown kind fails by name rather than by crash', () => {
    // The failure mode that produced the bug above was a silent fall-through.
    // Any future element kind that is not handled explicitly should say which
    // element is wrong, at the point it is wrong.
    assert.throws(
      () => elementParts({ id: 'mystery', kind: 'teleporter' }),
      /mystery.*teleporter/s
    )
  })

  test('no recess anywhere on the plaza produces an outline that cannot be drawn', () => {
    // REGRESSION, and the reason the 3D view can show a true loggia rather
    // than a decal. The notched ground-floor ring must stay a SIMPLE polygon
    // or it will not triangulate, and two independent things used to break it:
    // a depth taken from the deepest vertex anywhere in the footprint (so a
    // 3 m recess was cut into a 3.2 m-deep stretch of wall), and a span
    // starting exactly on a corner whose adjacent edge runs inward.
    //
    // Swept rather than sampled: every qualifying facade, at the extremes of
    // both sliders and five positions along each edge.
    const spec = presetById.get('recessedArcade').params
    let tested = 0
    const broken = []

    for (let b = 0; b < geometry.buildings.length; b++) {
      const host = geometry.buildings[b]
      if ((host.height ?? 0) < MIN_FACADE_HEIGHT_M || !host.footprint) continue
      for (let e = 0; e < host.footprint.length; e++) {
        const a = host.footprint[e]
        const c = host.footprint[(e + 1) % host.footprint.length]
        if (Math.hypot(c.x - a.x, c.y - a.y) < MIN_FACADE_LENGTH_M) continue

        for (const t of [0.05, 0.5, 0.95]) {
          for (const depth of [spec.depth.min, spec.depth.max]) {
            for (const length of [spec.length.min, spec.length.max]) {
              const element = {
                ...makeRecessElement({ building: b, edge: e, t }, { ...defaultParams('recessedArcade'), depth, length }),
                building: b,
                edge: e,
                t,
              }
              const cut = generateRecess(element, host)
              if (!cut) continue
              tested++
              const ring = recessedGroundRing(host.footprint, e, cut)
              if (selfIntersections(ring) > 0) {
                broken.push(`building ${b} edge ${e} t=${t} depth=${depth} length=${length}`)
              }
              assert.ok(
                cut.depth <= depth + 1e-9,
                `depth ${cut.depth} exceeds the ${depth} asked for`
              )
            }
          }
        }
      }
    }

    assert.ok(tested > 200, `expected a broad sweep, only ${tested} configurations were valid`)
    assert.equal(
      broken.length,
      0,
      `${broken.length} self-intersecting outlines, e.g. ${broken.slice(0, 3).join('; ')}`
    )
  })

  test('the recess it produces is real, and stays inside its host', () => {
    const facade = nearestFacade(ANCHOR, geometry.buildings, 80)
    const host = geometry.buildings[facade.building]
    const element = makeRecessElement(facade, defaultParams('recessedArcade'))
    const cut = generateRecess(element, host)

    assert.ok(cut, 'a qualifying facade must produce a cut')
    assert.ok(cut.edges.length >= 3, 'a recess needs at least its two returns and a back wall')
    assert.ok(cut.depth > 0, 'zero depth is not a recess')
    assert.ok(
      cut.depth <= defaultParams('recessedArcade').depth + 1e-9,
      'the recess must never exceed the depth asked for'
    )
    for (const e of cut.edges) {
      for (const v of [e.x1, e.y1, e.x2, e.y2]) assert.ok(Number.isFinite(v))
    }
  })
})

describe('presets — expectation tags', () => {
  test('every preset tags every P9 metric', () => {
    for (const preset of PRESETS) {
      for (const metric of P9_METRICS) {
        const tag = normaliseExpectation(preset.expected[metric])
        assert.ok(tag, `${preset.name} has no expectation for ${metric}`)
        assert.ok(
          ['raise', 'lower', 'none'].includes(tag.direction),
          `${preset.name}.${metric} has direction "${tag.direction}"`
        )
      }
    }
  })

  test('solid share is tagged directional-only everywhere', () => {
    // It is saturated at this site and must never be presented beside solidity
    // as though the two were equally reliable.
    for (const preset of PRESETS) {
      const tag = normaliseExpectation(preset.expected.solidShare)
      assert.equal(
        tag.diagnostic,
        false,
        `${preset.name} tags solid share as diagnostic; it has ~2% of headroom here`
      )
    }
  })

  test('solid frontage is excluded from judgement', () => {
    assert.ok(NON_DIAGNOSTIC_METRICS.includes('solidFrontage'))
  })

  test('the presets with no intuitive match carry their limitation in writing', () => {
    // Pergola, tree row and screen wall each read negative on every metric the
    // instrument offers. That is documented rather than fixed, so the text has
    // to exist and has to be substantial enough to explain itself.
    for (const id of ['pergola', 'treeRow', 'screenWall']) {
      const preset = presetById.get(id)
      assert.ok(preset.limitation, `${id} must carry a limitation note`)
      assert.ok(preset.limitation.length > 120, `${id}'s limitation note is too thin to be useful`)
    }
  })

  test('every preset has a blurb and a full parameter spec', () => {
    for (const preset of PRESETS) {
      assert.ok(preset.blurb && preset.blurb.length > 40, `${preset.name} needs a real blurb`)
      assert.ok(Object.keys(preset.params).length > 0)
      for (const [key, spec] of Object.entries(preset.params)) {
        for (const field of ['label', 'min', 'max', 'step', 'default']) {
          assert.ok(spec[field] !== undefined, `${preset.name}.${key} has no ${field}`)
        }
        assert.ok(spec.min < spec.max, `${preset.name}.${key} has an empty range`)
        assert.ok(
          spec.default >= spec.min && spec.default <= spec.max,
          `${preset.name}.${key} defaults outside its own range`
        )
      }
    }
  })
})

// Do any two non-adjacent edges of a closed ring cross? A polygon that fails
// this cannot be triangulated, so it cannot be extruded into the 3D view.
function selfIntersections(ring) {
  const orient = (p, q, r) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  const crosses = (a, b, c, d) =>
    orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b)

  let count = 0
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue
      if (crosses(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) {
        count++
      }
    }
  }
  return count
}
