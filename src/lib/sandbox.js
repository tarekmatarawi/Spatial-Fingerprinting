// P9 Tier B — the geometry sandbox.
//
// Tier A moves numbers. This moves buildings: a mass is drawn on the plan, the
// plaza's whole field is measured again with that mass in it, and every sampled
// point is re-assigned to the frozen typology. What comes back is a zone map of
// a plaza that does not exist.
//
// NOTHING HERE TOUCHES sites.json. The sandbox composes its masses with the
// site's real geometry at read time and throws the combination away; the site
// register is never written, and a reload returns the plaza as surveyed. That
// is the phase's gate, and `recomputeField` is a pure function precisely so it
// cannot do otherwise — it is handed geometry and returns points.
//
// THE WHOLE PLAZA IS RECOMPUTED, not an "affected region". Sight lines run to
// 200 m, so a mass dropped anywhere in Konstablerwache is visible from very
// nearly every sampled point in it, and any radius-of-effect rule would be an
// approximation that is silently wrong somewhere. Measured on the real site,
// all 967 points at 360° take about 190 ms — cheap enough that the exact answer
// is also the fast one, so no approximation is worth its risk.
//
// LAYER: field_360 throughout, normalised against P5's frozen perceptual_360
// bounds exactly as P6 does. A sandbox reading and a P6 reading have to be the
// same kind of number or the before/after comparison means nothing.

import { buildEdgeIndex, castIsovist } from './isovist.js'
import { METRICS } from './analysis/fingerprints.js'
import { assignZone } from './zones.js'
import { blockingParts, elementParts, generateRecess } from './presets.js'

export const SANDBOX_FOV_MODE = 'field_360'
export const SANDBOX_FOV_DEG = 360
export const SANDBOX_RAY_COUNT = 360
export const SANDBOX_RANGE_M = 200

// The same facade clearance P6's grid uses. A point that a new mass has swallowed
// — or that now stands within half a pace of its wall — is not somewhere a
// person can stand, so it leaves the sample rather than being measured from
// inside a building. Matching P6's rule is what keeps the two comparable: both
// layers must agree about what counts as standable ground.
export const SANDBOX_CLEARANCE_M = 1

// P9 CASTS HEIGHT-AWARE. EVERY CAST, ON BOTH SIDES OF EVERY COMPARISON.
//
// The engine's default is the unflagged mode P1–P8 use, in which every footprint
// obstructs regardless of height. P9 needs the other one: without it a 300 mm
// planter rim would block sightlines like a tower and a pergola roof would block
// along its whole footprint.
//
// The rule that matters is that the mode is a CONSTANT here rather than a
// parameter callers choose. A before/after comparison run half in one mode and
// half in the other would attribute the difference between two measurement
// systems to the intervention, and the numbers would look entirely plausible.
// Making it impossible to set per-call is the cheapest available guarantee that
// it cannot happen.
//
// The real buildings are unaffected either way: they stand from the ground to
// well above 1.6 m, so they straddle the slice and obstruct in both modes. This
// changes what the SANDBOX's own additions do, and nothing else.
export const HEIGHT_AWARE = true

// A drawn mass, as stored. Heights are metres above ground, matching
// `effectiveHeight` in site.js — the sandbox has no notion of a height that is
// "from OSM" or "pinned", because nothing here came from a survey.
export function makeMass(footprint, heightM, id = cryptoId()) {
  return {
    id,
    footprint: footprint.map((p) => ({ x: round(p.x, 3), y: round(p.y, 3) })),
    height_m: heightM,
    drawn_at: new Date().toISOString(),
  }
}

export function validateMass(mass) {
  if (!mass || typeof mass !== 'object') throw new Error('Expected a mass object')
  if (!Array.isArray(mass.footprint) || mass.footprint.length < 3) {
    throw new Error('A mass needs at least three corners')
  }
  for (const p of mass.footprint) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error('A mass corner has non-finite coordinates')
    }
  }
  if (!Number.isFinite(mass.height_m) || mass.height_m <= 0) {
    throw new Error(`A mass needs a positive height, got ${mass.height_m}`)
  }
  // A polygon that folds back on itself has no well-defined interior, so the
  // "is this point inside the mass" test below would answer inconsistently and
  // the ray-caster would see edges crossing in mid-air.
  if (polygonArea(mass.footprint) < 1) {
    throw new Error('A mass encloses no meaningful area — draw a larger footprint')
  }
  return mass
}

// Real geometry plus the sandbox's OBSTRUCTING parts, in the shape castIsovist
// expects.
//
// Only parts that straddle eye height are handed to the caster. The engine is a
// planar slice at 1.6 m and consults height only for the enclosure angle, so
// without this filter a 300 mm planter rim would block a sightline as
// completely as a tower, and a pergola roof four metres up would block along
// its whole footprint. See lib/presets.js for the rule and its consequences.
//
// Parts are appended rather than merged, and carry `sandbox: true`, so every
// consumer — the caster, the plan, the 3D view — can tell a drawn intervention
// from a surveyed building without being told separately.
export function composeGeometry(geometry, elements) {
  // Recesses REWRITE a host building rather than adding one, so the base list
  // is copied and edited in place before anything is appended. Applying them
  // first also means an additive element can never be silently swallowed by a
  // later subtraction.
  const buildings = geometry.buildings.map((b) => ({ ...b }))
  const recesses = []

  // Which surveyed buildings have been demolished.
  //
  // COLLECTED FIRST, APPLIED LAST, and the order is the whole trick. Recesses
  // address their host by INDEX into the site's building list, so removing an
  // element from that array before the recesses are applied would shift every
  // later index and carve the recess into the wrong block — silently, since
  // there is nothing about a mis-indexed recess that looks wrong. So the array
  // keeps its shape while recesses are cut, and the demolished entries are
  // filtered out afterwards, once no index refers to it any more.
  const demolished = new Set()
  for (const element of elements ?? []) {
    if (element.kind === 'demolish' && buildings[element.building]) {
      demolished.add(element.building)
    }
  }

  for (const element of elements ?? []) {
    if (element.kind !== 'recess') continue
    // A recess into a building that is no longer there is not an error worth
    // throwing on — the two moves are independently reasonable and a designer
    // may well remove a block they had earlier carved. It simply has nothing
    // to cut.
    if (demolished.has(element.building)) continue
    const host = buildings[element.building]
    if (!host) continue
    const cut = generateRecess(element, host)
    if (!cut) continue
    // The host is replaced by an explicit edge list: its outline at eye height
    // is the old perimeter minus the recessed span, plus the recess walls. That
    // is not a closed ring, which is exactly why edges are used — see
    // buildingEdges in isovist.js.
    const previous = host.edges ?? ringEdges(host.footprint)
    buildings[element.building] = {
      ...host,
      edges: replaceEdge(previous, element.edge, cut.edges, host.edges != null),
      recessed: true,
    }
    recesses.push({ element, cut })
  }

  const added = []
  for (const element of elements ?? []) {
    if (element.kind === 'recess') continue
    for (const part of blockingParts(element)) {
      added.push({
        footprint: part.footprint,
        height: part.top,
        base: part.base,
        sandbox: true,
        massId: element.id,
        role: part.role,
      })
    }
  }

  // Demolitions land here, after every index-based edit above is done with.
  const standing = demolished.size
    ? buildings.filter((_, i) => !demolished.has(i))
    : buildings

  return {
    ...geometry,
    buildings: [...standing, ...added],
    recesses,
    // Reported so the plan, the model and the readouts can all draw the same
    // set of removals without each recomputing it from the element list.
    demolished,
  }
}

function ringEdges(ring) {
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return out
}

// Swap one edge of a building's outline for the edges a recess produces.
//
// `alreadyEdges` says whether the index refers to a position in an edge list
// that has itself been rewritten by a previous recess. Two recesses on the same
// original edge would otherwise address the wrong segment; the second is
// appended instead, which leaves both cuts present rather than corrupting the
// outline.
function replaceEdge(edges, edgeIndex, replacement, alreadyEdges) {
  if (alreadyEdges || edgeIndex >= edges.length) return [...edges, ...replacement]
  return [...edges.slice(0, edgeIndex), ...replacement, ...edges.slice(edgeIndex + 1)]
}

// Every part of every placed element, obstructing or not — what the 2D plan and
// the 3D view draw. A part that cannot be measured is still a part that was
// designed, and hiding it would leave a designer wondering where their pergola
// roof went.
export function allParts(elements) {
  const out = []
  for (const element of elements ?? []) {
    for (const part of elementParts(element)) {
      out.push({ ...part, elementId: element.id })
    }
  }
  return out
}

// Measure the plaza again with the sandbox masses in place.
//
// `points` is the ORIGINAL sampled lattice — the same x/y positions P6 chose,
// reused rather than re-derived. That matters: the grid is anchored to absolute
// local coordinates so a point keeps its identity across runs, and reusing the
// positions is what makes a before/after comparison point-for-point rather than
// two independent samples that happen to cover the same plaza.
export function recomputeField({
  points,
  geometry,
  masses = [],
  bounds,
  centres,
  weights,
  onProgress = null,
}) {
  const composed = composeGeometry(geometry, masses)
  const index = buildEdgeIndex(composed.buildings, { heightAware: HEIGHT_AWARE })

  // Only NEW geometry can un-stand a point. The original lattice was already
  // filtered against the real buildings when P6 sampled it, so re-testing them
  // would be wasted work — and would risk dropping points over a rounding
  // difference that P6 itself did not make.
  //
  // A point is removed only where something OBSTRUCTING now occupies it. You
  // can stand under a pergola roof and on the far side of a knee-high planter,
  // and both remain places a person measures the square from; treating them as
  // built-over would delete real standable ground from the sample.
  //
  // DEMOLITION IS ASYMMETRIC HERE, AND DELIBERATELY SO. Removing a building
  // opens every sightline that used to end on it — which is measured, at every
  // surviving point, correctly. It does NOT put sample points on the ground the
  // building stood on, because P6 never laid any there: the lattice covers
  // standable ground, and that ground was inside a building when it was
  // sampled. So a demolished block reads as a hole in the zone map rather than
  // as new plaza.
  //
  // The alternative would be to synthesise points on the cleared footprint, and
  // it is rejected: those points would exist in P9 and in no other phase, so
  // every before/after count would be over two different samples, and the
  // composition shares would move partly because the denominator changed.
  // Better a visible hole that means "not sampled" than an invisible change of
  // sample that means nothing at all.
  const blockers = []
  for (const element of masses ?? []) {
    for (const part of blockingParts(element)) {
      blockers.push({
        footprint: part.footprint,
        index: buildEdgeIndex([{ footprint: part.footprint, height: part.top }]),
      })
    }
  }

  const kept = []
  const dropped = []

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (blockedByMass(p, blockers)) {
      dropped.push({ ...p, index: i })
      continue
    }

    const m = castIsovist(p, 0, composed.buildings, {
      fov: SANDBOX_FOV_DEG,
      rayCount: SANDBOX_RAY_COUNT,
      range: SANDBOX_RANGE_M,
      index,
      heightAware: HEIGHT_AWARE,
    })
    const raw = {
      area: m.area,
      compactness: m.compactness,
      occlusivity: m.occlusivity,
      enclosure: m.enclosureRatio,
    }
    // Rounded to the same places P6 writes, so a sandbox point and a stored
    // point are the same number when the geometry is the same — otherwise an
    // unedited plaza would show spurious zone flips from the last decimal.
    const normalised = METRICS.map((k) => round((raw[k] - bounds[k].min) / (bounds[k].max - bounds[k].min), 5))

    kept.push({
      x: p.x,
      y: p.y,
      index: i,
      area_m2: round(raw.area, 2),
      compactness: round(raw.compactness, 5),
      occlusivity_m: round(raw.occlusivity, 2),
      enclosure_ratio: round(raw.enclosure, 5),
      // P9-ONLY DIAGNOSTIC FIELDS. Carried on the recomputed point and nowhere
      // else: they are not written to src/data/fields/, not part of the frozen
      // `n` vector, and never reach a weight fit. The typology assignment below
      // uses `n` alone, exactly as P6 does.
      solid_share: round(m.solidShare, 5),
      solid_frontage_m: round(m.solidFrontage, 2),
      solidity: round(m.solidity, 5),
      n: normalised,
      zone: assignZone(normalised, centres, weights),
    })

    if (onProgress && i % 100 === 0) onProgress(i / points.length)
  }

  const counts = new Array(centres.length).fill(0)
  for (const p of kept) counts[p.zone]++

  return {
    points: kept,
    dropped,
    counts,
    shares: counts.map((c) => (kept.length ? c / kept.length : 0)),
    pointCount: kept.length,
    fovMode: SANDBOX_FOV_MODE,
    normalisationSource: 'perceptual_360',
  }
}

// What the edit did, point for point.
//
// Reported as a comparison of the SAME lattice positions before and after, so
// "42 points changed type" is a claim about 42 specific places rather than a
// difference between two aggregate histograms — which could match exactly while
// every point in the plaza had moved.
export function diffField(beforeZones, after, zoneCount) {
  const changed = []
  const flow = Array.from({ length: zoneCount }, () => new Array(zoneCount).fill(0))

  for (const p of after.points) {
    const was = beforeZones[p.index]
    if (was == null) continue
    flow[was][p.zone]++
    if (was !== p.zone) changed.push({ x: p.x, y: p.y, index: p.index, from: was, to: p.zone })
  }

  const beforeCounts = new Array(zoneCount).fill(0)
  for (const z of beforeZones) beforeCounts[z]++

  return {
    changed,
    changedCount: changed.length,
    droppedCount: after.dropped.length,
    flow,
    beforeCounts,
    beforeShares: beforeCounts.map((c) => (beforeZones.length ? c / beforeZones.length : 0)),
    afterCounts: after.counts,
    afterShares: after.shares,
  }
}

/* -------------------------------------------------------------------- helpers */

function blockedByMass(point, blockers) {
  for (const b of blockers) {
    if (pointInRing(b.footprint, point.x, point.y)) return true
    for (const e of b.index.edges ?? []) {
      if (distanceToSegment(point.x, point.y, e.x1, e.y1, e.x2, e.y2) < SANDBOX_CLEARANCE_M) {
        return true
      }
    }
  }
  return false
}

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

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * vx + (py - y1) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy))
}

export function polygonArea(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  }
  return Math.abs(s) / 2
}

const round = (v, d) => Number(v.toFixed(d))

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `mass-${Math.random().toString(36).slice(2, 10)}`
}
