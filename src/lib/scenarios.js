// P9 — named scenarios: an intervention, the question it was asked to answer,
// and nothing else.
//
// lib/sandboxStore.js already keeps the current sandbox alive across a reload.
// That is a safety net, not a filing system: there is exactly one of it, it
// lives in one browser, and drawing something new overwrites it. A thesis needs
// the other thing — three named alternatives that can be reopened next week, on
// the machine the writing is happening on, and cited by name in a chapter.
//
// WHAT A SCENARIO CONTAINS, AND WHY THAT LIST IS SHORT
//
// The elements drawn, the area selected, and the character it was diagnosed
// against. That is the whole design decision. It contains NO geometry from the
// site register, no measured metrics, and no zone assignments — everything else
// is recomputed from the elements when the scenario is opened, by the same code
// that computed it the first time.
//
// Storing the results alongside would be the obvious convenience and the wrong
// one. A saved zone map is a claim about a plaza that would keep asserting
// itself after the typology, the weights or the site geometry had moved under
// it, and it would look exactly as authoritative as a live one. Recomputing
// costs about 150 ms and cannot go stale.
//
// THE PHASE GATE. Scenarios go to src/data/scenarios.json and nowhere else.
// sites.json is never read here, never written, and never referenced except by
// id — a string naming which plaza the scenario belongs to. The endpoint that
// persists this file writes one path, and `validateScenarioFile` refuses
// anything shaped like a site register before it can reach disk.

import { elementParts } from './presets.js'

export const SCENARIO_VERSION = 1

// The one path this data may occupy. Exported so the dev endpoint and the tests
// name the same file rather than each spelling it out — the gate is "nothing
// persists to sites.json", and a second hand-typed path string is exactly how
// that kind of rule gets broken by accident.
export const SCENARIO_FILE = 'src/data/scenarios.json'

export const EMPTY_SCENARIO_FILE = {
  version: SCENARIO_VERSION,
  updated_at: null,
  scenarios: [],
}

// Keys that have no business in a scenario record. Their presence means the
// wrong object was posted — a projected geometry, or worse, a slice of the site
// register — and the right response is to refuse it loudly rather than write it
// and discover the problem when a later reader trusts it.
const FORBIDDEN_KEYS = ['sites', 'buildings', 'boundary', 'points', 'zones', 'geometry']

export function makeScenario({
  name,
  siteId,
  elements,
  selection = null,
  radiusM = null,
  targetZone = null,
  note = '',
  provenance = null,
  id = scenarioId(),
}) {
  const now = new Date().toISOString()
  return {
    id,
    name: String(name ?? '').trim(),
    note: String(note ?? '').trim(),
    site_id: siteId,
    created_at: now,
    updated_at: now,
    elements: elements ?? [],
    // The selection is part of the design decision, not incidental to it: an
    // intervention drawn to fix the north edge is not the same proposal as the
    // same intervention drawn to fix the middle, and reopening it without the
    // area it was aimed at would lose which of the two it was.
    selection: selection ? { x: round(selection.x, 2), y: round(selection.y, 2) } : null,
    radius_m: radiusM,
    target_zone: targetZone,
    // What the numbers were computed against when this was saved. Not used to
    // reproduce anything — everything is recomputed live — but a scenario saved
    // against one typology and reopened after a re-clustering is a different
    // claim, and this is what lets the page say so instead of silently
    // rescoring it. Same rule P8 applies to its trial bank.
    provenance,
  }
}

// Rejects anything that would corrupt the file before it reaches disk.
//
// Called by the endpoint, not only by the UI. A record written by hand, or
// posted by the wrong page, should fail here — where the message names the
// problem — rather than several days later as a page that will not render.
export function validateScenarioFile(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new Error('Expected a scenario file object')
  }
  if (file.version !== SCENARIO_VERSION) {
    throw new Error(`Scenario file version must be ${SCENARIO_VERSION}, got ${file.version}`)
  }
  if (!Array.isArray(file.scenarios)) throw new Error('Expected a scenarios array')

  const seen = new Set()
  for (const s of file.scenarios) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      throw new Error('A scenario is not an object')
    }
    if (!s.id) throw new Error('A scenario has no id')
    if (seen.has(s.id)) throw new Error(`Two scenarios share the id "${s.id}"`)
    seen.add(s.id)
    if (!s.name) throw new Error(`Scenario ${s.id} has no name — an unnamed alternative is not one`)
    if (!s.site_id) throw new Error(`Scenario ${s.id} names no site`)
    if (!Array.isArray(s.elements)) throw new Error(`Scenario ${s.id} has no elements array`)

    for (const key of FORBIDDEN_KEYS) {
      if (key in s) {
        throw new Error(
          `Scenario ${s.id} carries a "${key}" field. A scenario stores what was DRAWN, never ` +
            'measured geometry or site-register data — see lib/scenarios.js. Refusing to write it.'
        )
      }
    }

    // Every element must survive being turned into geometry. An element that
    // throws on draw would be written happily and then break the page it was
    // saved from, which is the worst available time to find out.
    for (const element of s.elements) {
      if (!element || typeof element !== 'object' || !element.id) {
        throw new Error(`Scenario ${s.id} contains an element with no id`)
      }
      try {
        elementParts(element)
      } catch (err) {
        throw new Error(`Scenario ${s.id}, element ${element.id}: ${err.message}`)
      }
    }
  }

  return file
}

// Add or replace one scenario in the file, by id.
//
// Upsert rather than append, so saving over a scenario you have just reopened
// and adjusted updates it instead of leaving two near-identical entries called
// the same thing. `created_at` survives the replacement; the point of a named
// scenario is that it has a history.
export function upsertScenario(file, scenario) {
  const scenarios = [...(file.scenarios ?? [])]
  const at = scenarios.findIndex((s) => s.id === scenario.id)
  if (at === -1) {
    scenarios.push(scenario)
  } else {
    scenarios[at] = {
      ...scenario,
      created_at: scenarios[at].created_at ?? scenario.created_at,
      updated_at: new Date().toISOString(),
    }
  }
  return { ...file, version: SCENARIO_VERSION, updated_at: new Date().toISOString(), scenarios }
}

export function removeScenario(file, id) {
  return {
    ...file,
    version: SCENARIO_VERSION,
    updated_at: new Date().toISOString(),
    scenarios: (file.scenarios ?? []).filter((s) => s.id !== id),
  }
}

// What was current when this scenario was saved — the provenance stamp.
//
// Deliberately the same three things the sandbox's own numbers depend on: which
// typology the zones came from, which weights sorted the points, and how finely
// the plaza was sampled. If any of them changes, every number a reopened
// scenario produces is a different quantity from the one it produced when it
// was named.
export function scenarioProvenance(zonesFile, fieldIndex) {
  return {
    zones_generated_at: zonesFile?.generated_at ?? null,
    zone_count: zonesFile?.k ?? null,
    weights: zonesFile?.weighted_by?.weights ?? null,
    field_spacing_m: fieldIndex?.spacing_m ?? null,
    normalisation_source: fieldIndex?.normalisation_source ?? null,
  }
}

// Which parts of a scenario's provenance no longer match the current data.
//
// Returned as a list of human phrases rather than a boolean, because "this is
// stale" is not actionable and "the typology was re-clustered since this was
// saved" is. A scenario with no provenance at all predates the stamp and is
// reported as unknown rather than as current — the one answer that cannot be
// wrong in the flattering direction.
export function scenarioDrift(scenario, current) {
  if (!scenario?.provenance) return ['saved before provenance was recorded']
  const was = scenario.provenance
  const drift = []
  if (was.zones_generated_at !== current.zones_generated_at) {
    drift.push('the zone typology was recomputed')
  }
  if (was.zone_count !== current.zone_count) drift.push('the number of zone types changed')
  if (JSON.stringify(was.weights) !== JSON.stringify(current.weights)) {
    drift.push('the perceptual weights changed')
  }
  if (was.field_spacing_m !== current.field_spacing_m) drift.push('the grid spacing changed')
  return drift
}

/* -------------------------------------------------------------------- helpers */

const round = (v, d) => Number(v.toFixed(d))

function scenarioId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `scenario-${Math.random().toString(36).slice(2, 10)}`
}
