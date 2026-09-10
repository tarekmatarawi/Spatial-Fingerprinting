// P9's scenario store, and the phase gate it must not break.
//
// docs/spec.md states the gate as: "an edit changes the local zone map and
// composition profile; nothing persists to sites.json." Tier B's half of that
// is pinned in test/sandbox.test.js. This is the other half: P9 now writes a
// file, and the tests below are what stop that file from becoming a second,
// divergent copy of the site register.
//
// Three properties are asserted, in descending order of how badly they would
// hurt if they failed:
//
//   1. the only path a scenario may be written to is src/data/scenarios.json
//   2. a scenario stores what was DRAWN and nothing measured — no geometry, no
//      zone assignments, no metric values
//   3. anything that would throw when drawn is refused on the way in, not on
//      the first render after it is read back

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EMPTY_SCENARIO_FILE,
  SCENARIO_FILE,
  SCENARIO_VERSION,
  makeScenario,
  removeScenario,
  scenarioDrift,
  scenarioProvenance,
  upsertScenario,
  validateScenarioFile,
} from '../src/lib/scenarios.js'
import { defaultParams, makeDemolition, makePresetElement } from '../src/lib/presets.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const zones = read('src/data/zones.json')
const fieldIndex = read('src/data/fields/index.json')
const PROVENANCE = scenarioProvenance(zones, fieldIndex)

const colonnade = makePresetElement('colonnade', { x: 0, y: 0 }, defaultParams('colonnade'), 0)

const sample = (over = {}) =>
  makeScenario({
    name: 'Colonnade on the north edge',
    siteId: 'Konstablerwache-Frankfurt am Main',
    elements: [colonnade],
    selection: { x: 4.213, y: -9.887 },
    radiusM: 15,
    targetZone: 2,
    provenance: PROVENANCE,
    ...over,
  })

describe('the phase gate', () => {
  test('scenarios are written to scenarios.json and nowhere near the register', () => {
    assert.equal(SCENARIO_FILE, 'src/data/scenarios.json')
    assert.ok(!SCENARIO_FILE.includes('sites.json'))
  })

  test('the shipped file exists, is empty, and validates', () => {
    // The deployed static build imports this file, so it must be present and
    // well-formed in a fresh checkout rather than created on first save.
    const file = read(SCENARIO_FILE)
    assert.equal(file.version, SCENARIO_VERSION)
    assert.ok(Array.isArray(file.scenarios))
    validateScenarioFile(file)
    validateScenarioFile(EMPTY_SCENARIO_FILE)
  })

  test('the dev endpoint resolves its path from the library, not from a literal', () => {
    // The gate is one string in one place. A second hand-typed path is exactly
    // how "nothing persists to sites.json" gets broken by accident, so the
    // config is checked for the import rather than trusted.
    const config = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
    assert.match(config, /SCENARIO_FILE/)
    assert.match(config, /validateScenarioFile/)
    const block = config.slice(config.indexOf('function scenarioEndpoints'))
    const body = block.slice(0, block.indexOf('\nconst UPLOAD_DIRS'))
    assert.ok(
      !body.includes('sites.json'),
      'the scenario endpoint names sites.json — it must never write the site register'
    )
  })

  test('a scenario refuses to carry measured geometry', () => {
    for (const key of ['sites', 'buildings', 'boundary', 'points', 'zones', 'geometry']) {
      const bad = { ...EMPTY_SCENARIO_FILE, scenarios: [{ ...sample(), [key]: [] }] }
      assert.throws(
        () => validateScenarioFile(bad),
        new RegExp(`carries a "${key}" field`),
        `a scenario carrying "${key}" was accepted`
      )
    }
  })

  test('what makeScenario produces contains no measurement', () => {
    const s = sample()
    const keys = Object.keys(s)
    for (const forbidden of ['points', 'zones', 'counts', 'shares', 'n', 'area_m2', 'field']) {
      assert.ok(!keys.includes(forbidden), `makeScenario emitted "${forbidden}"`)
    }
    // What it DOES contain is the decision: what was drawn, where, against what.
    assert.deepEqual(
      keys.sort(),
      [
        'created_at',
        'elements',
        'id',
        'name',
        'note',
        'provenance',
        'radius_m',
        'selection',
        'site_id',
        'target_zone',
        'updated_at',
      ].sort()
    )
  })
})

describe('validation refuses what would break the page later', () => {
  test('the obvious malformations', () => {
    assert.throws(() => validateScenarioFile(null), /scenario file object/)
    assert.throws(() => validateScenarioFile([]), /scenario file object/)
    assert.throws(() => validateScenarioFile({ version: 99, scenarios: [] }), /version must be/)
    assert.throws(() => validateScenarioFile({ version: 1 }), /scenarios array/)
  })

  test('a scenario needs an id, a name and a site', () => {
    const base = { ...EMPTY_SCENARIO_FILE }
    assert.throws(
      () => validateScenarioFile({ ...base, scenarios: [{ ...sample(), id: null }] }),
      /has no id/
    )
    assert.throws(
      () => validateScenarioFile({ ...base, scenarios: [{ ...sample(), name: '' }] }),
      /has no name/
    )
    assert.throws(
      () => validateScenarioFile({ ...base, scenarios: [{ ...sample(), site_id: null }] }),
      /names no site/
    )
  })

  test('duplicate ids are refused', () => {
    const one = sample()
    assert.throws(
      () => validateScenarioFile({ ...EMPTY_SCENARIO_FILE, scenarios: [one, { ...one }] }),
      /share the id/
    )
  })

  test('an element that would THROW when drawn never reaches disk', () => {
    // The failure this prevents: a scenario written happily and then breaking
    // the page it was saved from, the next time it is opened. Same rule
    // sandboxStore.js applies on restore, moved to the write side where the
    // message can still name the scenario it came from.
    const noFootprint = { id: 'x', kind: 'freeform', height_m: 12 }
    assert.throws(
      () =>
        validateScenarioFile({
          ...EMPTY_SCENARIO_FILE,
          scenarios: [sample({ elements: [noFootprint] })],
        }),
      /element x:/
    )

    const idless = { ...colonnade, id: undefined }
    assert.throws(
      () =>
        validateScenarioFile({
          ...EMPTY_SCENARIO_FILE,
          scenarios: [sample({ elements: [idless] })],
        }),
      /element with no id/
    )
  })

  test('an element naming a preset that no longer exists is TOLERATED, not refused', () => {
    // The deliberate other half of the rule above, and the distinction matters.
    // elementParts returns no parts for an unknown preset rather than throwing
    // (lib/presets.js), so a scenario committed to the repository and read back
    // after a preset is renamed opens with that one element missing instead of
    // failing validation and taking every other scenario in the file with it.
    // Refusing here would make renaming a preset a data-loss event.
    const stale = { ...colonnade, preset: 'no-such-preset' }
    const file = { ...EMPTY_SCENARIO_FILE, scenarios: [sample({ elements: [stale] })] }
    assert.doesNotThrow(() => validateScenarioFile(file))
  })

  test('a demolition saves as an index, and is not mistaken for register data', () => {
    // A demolition names a building by INDEX into sites.json. That is the one
    // reference to the register a scenario may legitimately carry — it is a
    // pointer, not a copy — and the forbidden-key check must not reject it for
    // having a field called "building". The plural "buildings" is what would
    // mean someone had pasted geometry in, and that is still refused.
    const file = {
      ...EMPTY_SCENARIO_FILE,
      scenarios: [sample({ elements: [makeDemolition(3)] })],
    }
    assert.doesNotThrow(() => validateScenarioFile(file))

    const el = file.scenarios[0].elements[0]
    assert.equal(el.kind, 'demolish')
    assert.equal(el.building, 3)
    assert.ok(!('footprint' in el), 'a demolition must never copy the building it removes')

    assert.throws(
      () => validateScenarioFile({ ...EMPTY_SCENARIO_FILE, scenarios: [{ ...sample(), buildings: [] }] }),
      /carries a "buildings" field/
    )
  })

  test('a valid file round-trips through JSON unchanged', () => {
    const file = upsertScenario(EMPTY_SCENARIO_FILE, sample())
    const back = JSON.parse(JSON.stringify(file))
    validateScenarioFile(back)
    assert.deepEqual(back, JSON.parse(JSON.stringify(file)))
  })
})

describe('upsert and remove', () => {
  test('saving under an id that exists replaces rather than duplicates', () => {
    const first = sample()
    let file = upsertScenario(EMPTY_SCENARIO_FILE, first)
    assert.equal(file.scenarios.length, 1)

    const edited = makeScenario({
      id: first.id,
      name: 'Colonnade, deeper',
      siteId: first.site_id,
      elements: [colonnade],
      provenance: PROVENANCE,
    })
    file = upsertScenario(file, edited)
    assert.equal(file.scenarios.length, 1)
    assert.equal(file.scenarios[0].name, 'Colonnade, deeper')
    // The original creation date survives — a named scenario has a history, and
    // updating it should not make it look new.
    assert.equal(file.scenarios[0].created_at, first.created_at)
  })

  test('a different id appends', () => {
    let file = upsertScenario(EMPTY_SCENARIO_FILE, sample())
    file = upsertScenario(file, sample({ name: 'Pergola instead' }))
    assert.equal(file.scenarios.length, 2)
    validateScenarioFile(file)
  })

  test('remove takes exactly the one named', () => {
    const keep = sample({ name: 'Keep' })
    const drop = sample({ name: 'Drop' })
    const file = removeScenario(upsertScenario(upsertScenario(EMPTY_SCENARIO_FILE, keep), drop), drop.id)
    assert.equal(file.scenarios.length, 1)
    assert.equal(file.scenarios[0].id, keep.id)
  })
})

describe('provenance drift', () => {
  test('a scenario saved against the current data reports no drift', () => {
    assert.deepEqual(scenarioDrift(sample(), PROVENANCE), [])
  })

  test('each moving part is named separately', () => {
    const s = sample()
    assert.deepEqual(
      scenarioDrift(s, { ...PROVENANCE, zones_generated_at: '2027-01-01T00:00:00.000Z' }),
      ['the zone typology was recomputed']
    )
    assert.deepEqual(scenarioDrift(s, { ...PROVENANCE, zone_count: 6 }), [
      'the number of zone types changed',
    ])
    assert.deepEqual(scenarioDrift(s, { ...PROVENANCE, weights: [0.25, 0.25, 0.25, 0.25] }), [
      'the perceptual weights changed',
    ])
    assert.deepEqual(scenarioDrift(s, { ...PROVENANCE, field_spacing_m: 5 }), [
      'the grid spacing changed',
    ])
  })

  test('a scenario with no stamp is unknown, never assumed current', () => {
    // The one answer that cannot be wrong in the flattering direction.
    assert.deepEqual(scenarioDrift({ ...sample(), provenance: null }, PROVENANCE), [
      'saved before provenance was recorded',
    ])
  })

  test('the stamp reads the live typology and field, not a copy', () => {
    assert.equal(PROVENANCE.zones_generated_at, zones.generated_at)
    assert.equal(PROVENANCE.zone_count, zones.k)
    assert.deepEqual(PROVENANCE.weights, zones.weighted_by.weights)
    assert.equal(PROVENANCE.field_spacing_m, fieldIndex.spacing_m)
  })
})
