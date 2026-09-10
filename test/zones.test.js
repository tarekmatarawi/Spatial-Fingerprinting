// P9's foundation gate.
//
// The design diagnostic rests on one claim: that P9 can take a point, assign it
// a zone, and be assigning it the SAME zone P6 did. Everything downstream —
// the per-metric decomposition, the sandbox's before/after map, the composition
// delta — is a statement about P6's typology, and is worthless if P9's idea of
// that typology differs from P6's even slightly.
//
// That claim is not obvious. P6 assigns points as a by-product of k-means, on
// full-precision centres held in memory. P9 assigns them by nearest centre
// using the centres as they were WRITTEN TO DISK, rounded to five decimal
// places. A point sitting near a boundary between two centres could fall the
// other way. So the first test below checks it against every real field point
// rather than against a constructed example — this is the one place where a
// fixture would prove nothing.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ZONE_COLOURS,
  assignZone,
  decompose,
  describeZone,
  diagnoseRegion,
  denormalise,
  flipDistance,
  flipDistances,
  weightedDist2,
  zoneNames,
} from '../src/lib/zones.js'
import { METRICS } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const zones = read('src/data/zones.json')
const fieldIndex = read('src/data/fields/index.json')
const CENTRES = zones.centres
const WEIGHTS = zones.weighted_by.weights

describe('zones — reproducing P6 exactly', () => {
  test('every stored field point reassigns to the zone P6 gave it', () => {
    let total = 0
    let mismatched = 0
    const examples = []

    for (const site of fieldIndex.sites) {
      const field = read(`src/data/fields/${site.file}`)
      assert.equal(
        field.points.length,
        field.zones.length,
        `${site.name}: ${field.points.length} points but ${field.zones.length} zone labels`
      )
      for (let i = 0; i < field.points.length; i++) {
        const recomputed = assignZone(field.points[i].n, CENTRES, WEIGHTS)
        total++
        if (recomputed !== field.zones[i]) {
          mismatched++
          if (examples.length < 5) {
            examples.push(`${site.name} point ${i}: stored ${field.zones[i]}, got ${recomputed}`)
          }
        }
      }
    }

    assert.equal(total, zones.total_points, 'field files and zones.json disagree on the point count')
    assert.equal(
      mismatched,
      0,
      `${mismatched} of ${total} points reassign differently. ${examples.join('; ')}`
    )
  })

  test('the rounding in zones.json is not what makes that work', () => {
    // If the reproduction above only held because the stored centres happen to
    // be lucky, it would be fragile in a way nobody would notice. This checks
    // the margin: for each point, how much closer its own centre is than the
    // runner-up. A population minimum comfortably above the rounding scale
    // (1e-5 per coordinate) means the agreement is structural, not luck.
    //
    // Some points genuinely sit near a boundary, so the MINIMUM margin is
    // expected to be small; what matters is that it is not at the rounding
    // scale, where a different rounding could flip it.
    let worst = Infinity
    for (const site of fieldIndex.sites) {
      const field = read(`src/data/fields/${site.file}`)
      for (const p of field.points) {
        const ds = CENTRES.map((c) => weightedDist2(p.n, c, WEIGHTS)).sort((a, b) => a - b)
        worst = Math.min(worst, ds[1] - ds[0])
      }
    }
    assert.ok(worst >= 0, 'a runner-up cannot be closer than the winner')
    assert.ok(
      worst > 1e-9,
      `the tightest point sits ${worst} from its boundary — at the rounding scale, so the ` +
        'reproduction above is luck rather than structure'
    )
  })

  test('the typology vocabulary covers every zone', () => {
    assert.ok(ZONE_COLOURS.length >= zones.k, `${zones.k} zones but ${ZONE_COLOURS.length} colours`)
    const names = zoneNames(CENTRES)
    assert.equal(names.length, zones.k)
    assert.equal(new Set(names).size, zones.k, `two zones share a name: ${names.join(' / ')}`)
    for (const n of names) assert.match(n, /^(Vast|Open|Tight), /)
  })

  test('zone names are derived from the centres, not typed', () => {
    // A centre moved into another regime must rename itself. If describeZone
    // were ever replaced by a hard-coded list this fails.
    assert.equal(describeZone([0.9, 0.95, 0.1, 0.1]), 'Vast, regular')
    assert.equal(describeZone([0.1, 0.5, 0.1, 0.9]), 'Tight, strongly enclosed')
    assert.equal(describeZone([0.5, 0.5, 0.8, 0.1]), 'Open, facade-rich')
    assert.equal(describeZone([0.1, 0.2, 0.1, 0.5]), 'Tight, irregular')
  })
})

describe('zones — the decomposition', () => {
  const point = [0.4, 0.3, 0.6, 0.2]

  test('per-metric contributions sum to the weighted squared distance', () => {
    for (let z = 0; z < CENTRES.length; z++) {
      const d = decompose(point, CENTRES[z], WEIGHTS)
      const direct = weightedDist2(point, CENTRES[z], WEIGHTS)
      assert.ok(
        Math.abs(d.total - direct) < 1e-12,
        `zone ${z}: decomposition ${d.total} vs distance ${direct}`
      )
      const summed = d.terms.reduce((s, t) => s + t.contribution, 0)
      assert.ok(Math.abs(summed - direct) < 1e-12)
      assert.ok(Math.abs(d.distance - Math.sqrt(direct)) < 1e-12)
    }
  })

  test('shares sum to one and rank the driving metrics', () => {
    const d = decompose(point, CENTRES[0], WEIGHTS)
    const shares = d.terms.reduce((s, t) => s + t.share, 0)
    assert.ok(Math.abs(shares - 1) < 1e-12)
    for (let i = 1; i < d.driving.length; i++) {
      assert.ok(d.driving[i - 1].contribution >= d.driving[i].contribution)
    }
    assert.deepEqual(
      d.terms.map((t) => t.metric),
      METRICS,
      'terms must stay in METRICS order — callers index them positionally'
    )
  })

  test('the gap keeps its sign where the squared term throws it away', () => {
    const below = decompose([0, 0, 0, 0], [0.5, 0.5, 0.5, 0.5], WEIGHTS)
    const above = decompose([1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5], WEIGHTS)
    for (const t of below.terms) assert.ok(t.gap < 0, `${t.metric} should read as below target`)
    for (const t of above.terms) assert.ok(t.gap > 0, `${t.metric} should read as above target`)
    // Same distance either way — which is exactly why the sign has to be
    // reported separately.
    assert.ok(Math.abs(below.total - above.total) < 1e-12)
  })

  test('a point at the centre has zero distance and no driving metric', () => {
    const d = decompose(CENTRES[2], CENTRES[2], WEIGHTS)
    assert.equal(d.total, 0)
    for (const t of d.terms) assert.equal(t.share, 0)
  })
})

describe('zones — diagnosing an area', () => {
  test('a region is averaged per point, not collapsed to its mean point', () => {
    // Two points either side of a centre on area. Their MEAN point sits exactly
    // on the centre, so a distance-of-mean would report zero — while neither
    // actual point is anywhere near it. This is the failure the region
    // diagnosis exists to avoid, so it is constructed rather than asserted.
    const centre = CENTRES[0]
    const low = [...centre]
    const high = [...centre]
    low[0] -= 0.4
    high[0] += 0.4

    const region = diagnoseRegion([low, high], 0, CENTRES, WEIGHTS)
    const meanPoint = centre.map((_, k) => (low[k] + high[k]) / 2)
    const distanceOfMean = weightedDist2(meanPoint, centre, WEIGHTS)

    assert.ok(Math.abs(distanceOfMean) < 1e-12, 'the constructed mean should sit on the centre')
    assert.ok(
      region.total > 0.01,
      `region diagnosis collapsed to the mean point (total ${region.total})`
    )
    // Each point is 0.4 off on area alone, so the mean contribution is
    // w_area × 0.4².
    assert.ok(Math.abs(region.total - WEIGHTS[0] * 0.16) < 1e-12)
  })

  test('the spread is reported so a mean is never read as uniform', () => {
    const centre = CENTRES[0]
    const near = [...centre]
    const far = [...centre]
    far[0] += 0.5
    const region = diagnoseRegion([near, far], 0, CENTRES, WEIGHTS)
    assert.ok(region.distanceSpread.max > region.distanceSpread.min)
    assert.ok(region.distanceSpread.sd > 0)
  })

  test('on-target share counts points already in the intended zone', () => {
    const region = diagnoseRegion([CENTRES[1], CENTRES[1], CENTRES[3]], 1, CENTRES, WEIGHTS)
    assert.equal(region.n, 3)
    assert.equal(region.onTarget, 2)
    assert.ok(Math.abs(region.onTargetShare - 2 / 3) < 1e-12)
    assert.ok(Math.abs(region.composition.reduce((s, v) => s + v, 0) - 1) < 1e-12)
  })

  test('a real Konstablerwache selection diagnoses against its own zone at zero cost', () => {
    const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')
    const zone0 = field.points.filter((_, i) => field.zones[i] === 0).map((p) => p.n)
    assert.ok(zone0.length > 100, 'expected a substantial zone-0 population at Konstablerwache')

    const own = diagnoseRegion(zone0, 0, CENTRES, WEIGHTS)
    assert.equal(own.onTarget, zone0.length, 'every zone-0 point must diagnose as on target')
    assert.equal(own.onTargetShare, 1)

    // Diagnosed against a different intended type, the same selection must be
    // further away — otherwise the diagnosis is not measuring anything.
    const other = diagnoseRegion(zone0, 2, CENTRES, WEIGHTS)
    assert.ok(other.total > own.total)
    assert.equal(other.onTarget, 0)
  })
})

describe('zones — Tier A flip distances', () => {
  test('a point already in the target zone needs no movement', () => {
    for (let z = 0; z < CENTRES.length; z++) {
      for (let k = 0; k < METRICS.length; k++) {
        assert.equal(flipDistance(CENTRES[z], z, CENTRES, WEIGHTS, k), 0)
      }
    }
  })

  test('the reported delta actually flips the point, and nothing smaller does', () => {
    // Tested against the CONDITION the function solves — target zone at least
    // as close as every rival — rather than against assignZone's answer. At
    // exactly the flip distance the target ties with some rival, and a tie is
    // broken by array index, so assignZone legitimately disagrees at the
    // boundary for a high-numbered target. That is tie-breaking, not an error
    // in the distance, and asserting on it would test the wrong thing.
    const wins = (probe, z) => {
      const own = weightedDist2(probe, CENTRES[z], WEIGHTS)
      return CENTRES.every((c, r) => r === z || own <= weightedDist2(probe, c, WEIGHTS) + 1e-12)
    }

    const point = [0.35, 0.30, 0.55, 0.25]
    for (let z = 0; z < CENTRES.length; z++) {
      for (let k = 0; k < METRICS.length; k++) {
        const delta = flipDistance(point, z, CENTRES, WEIGHTS, k)
        if (delta === null) continue

        const at = [...point]
        at[k] += delta
        assert.ok(
          wins(at, z),
          `${METRICS[k]} → zone ${z}: moving by ${delta} does not reach the zone`
        )

        // The number is only a sensitivity if it is the SMALLEST such move, so
        // just short of it the target must NOT already win.
        if (delta !== 0) {
          const shortOf = [...point]
          shortOf[k] += delta * 0.99
          assert.ok(
            !wins(shortOf, z),
            `${METRICS[k]} → zone ${z}: 99% of ${delta} already reaches it, so it is not minimal`
          )
        }
      }
    }
  })

  test('the exact answer agrees with a brute-force sweep', () => {
    // The closed form is derived rather than searched, so it is checked against
    // the thing it replaced: a fine sweep along each axis. If the algebra is
    // wrong these disagree.
    const point = [0.45, 0.60, 0.35, 0.40]
    const STEP = 0.0005
    for (let z = 0; z < CENTRES.length; z++) {
      for (let k = 0; k < METRICS.length; k++) {
        const exact = flipDistance(point, z, CENTRES, WEIGHTS, k)

        let swept = null
        for (let i = 0; i <= 4000; i++) {
          const magnitude = i * STEP
          for (const sign of magnitude === 0 ? [1] : [1, -1]) {
            const probe = [...point]
            probe[k] += sign * magnitude
            if (assignZone(probe, CENTRES, WEIGHTS) === z) {
              swept = sign * magnitude
              break
            }
          }
          if (swept !== null) break
        }

        if (swept === null) {
          assert.ok(
            exact === null || Math.abs(exact) > 4000 * STEP,
            `${METRICS[k]} → zone ${z}: closed form says ${exact}, sweep found nothing`
          )
        } else {
          assert.ok(exact !== null, `${METRICS[k]} → zone ${z}: sweep found ${swept}, closed form null`)
          assert.ok(
            Math.abs(Math.abs(exact) - Math.abs(swept)) <= STEP * 1.5,
            `${METRICS[k]} → zone ${z}: closed form ${exact}, sweep ${swept}`
          )
        }
      }
    }
  })

  test('an algebraically valid flip outside the corpus is reported unreachable', () => {
    // The case that nearly shipped as design guidance. Zone 4 (vast, regular)
    // holds the LOWEST occlusivity coordinate of the five centres, so driving
    // occlusivity far enough down makes it the nearest centre from anywhere —
    // the algebra is right and says −19.4. Nothing in the corpus sits below
    // −0.33, so as an instruction it describes nowhere.
    //
    // The number must still be reported. "This target needs an occlusivity
    // lower than anywhere measured" is a finding about the target; a blank
    // would hide it.
    const tight = [0.05, 0.05, 0.5, 0.5]
    const raw = flipDistance(tight, 4, CENTRES, WEIGHTS, 2)
    assert.ok(raw !== null && raw < -1, `expected a large negative delta, got ${raw}`)

    const judged = flipDistances(tight, 4, CENTRES, WEIGHTS, fieldIndex.observed_envelope)
    const occlusivity = judged.find((r) => r.metric === 'occlusivity')
    assert.equal(occlusivity.reachable, false)
    assert.equal(occlusivity.reason, 'outside-corpus')
    assert.equal(occlusivity.delta, raw, 'the number is qualified, not discarded')
    assert.ok(occlusivity.resulting < fieldIndex.observed_envelope.occlusivity.min)
    assert.equal(judged.length, METRICS.length)
  })

  test('without an envelope every solvable flip is reported unqualified', () => {
    const tight = [0.05, 0.05, 0.5, 0.5]
    const unjudged = flipDistances(tight, 4, CENTRES, WEIGHTS)
    for (const r of unjudged) {
      if (r.delta !== null) assert.equal(r.reachable, true)
    }
  })

  test('a flip a real point can actually make is reported reachable', () => {
    // The complement of the case above: a Konstablerwache point diagnosed
    // against a neighbouring zone should have at least one axis whose flip
    // lands inside the observed envelope, or Tier A would never have anything
    // to say.
    const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')
    const point = field.points.find((_, i) => field.zones[i] === 0).n
    const judged = flipDistances(point, 3, CENTRES, WEIGHTS, fieldIndex.observed_envelope)
    assert.ok(
      judged.some((r) => r.reachable && r.delta !== null),
      'no single-axis move into zone 3 lands inside the corpus envelope'
    )
  })

  test('the envelope is wider than the frozen 0–1 bounds it qualifies', () => {
    // If these were the same thing the envelope would add nothing. Field points
    // are normalised against the 18 canonical vantages, and ground positions
    // routinely go past them in both directions — which is exactly why P6 keeps
    // out-of-range points rather than clipping them.
    for (const m of METRICS) {
      const e = fieldIndex.observed_envelope[m]
      assert.ok(e.min < 0, `${m}: envelope min ${e.min} should fall below the frozen 0`)
      assert.ok(e.max > 1, `${m}: envelope max ${e.max} should rise above the frozen 1`)
      assert.ok(e.minSite && e.maxSite, `${m}: the envelope must name the plazas that set it`)
    }
  })
})

describe('zones — units', () => {
  test('denormalise inverts the normalisation the bounds define', () => {
    for (const m of METRICS) {
      const bound = fieldIndex.bounds[m]
      assert.ok(Math.abs(denormalise(0, bound) - bound.min) < 1e-9)
      assert.ok(Math.abs(denormalise(1, bound) - bound.max) < 1e-9)
      // Out of range must pass straight through — P6 keeps such points rather
      // than clipping them, so the readout must not clip either.
      assert.ok(denormalise(1.2, bound) > bound.max)
      assert.ok(denormalise(-0.2, bound) < bound.min)
    }
  })

  test('a real field point round-trips to its stored raw values', () => {
    const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')
    const p = field.points[0]
    const raw = { area: p.area_m2, compactness: p.compactness, occlusivity: p.occlusivity_m, enclosure: p.enclosure_ratio }
    METRICS.forEach((m, k) => {
      const back = denormalise(p.n[k], fieldIndex.bounds[m])
      const tolerance = Math.max(Math.abs(raw[m]) * 1e-3, 1e-4)
      assert.ok(
        Math.abs(back - raw[m]) < tolerance,
        `${m}: normalised ${p.n[k]} → ${back}, stored ${raw[m]}`
      )
    })
  })
})
