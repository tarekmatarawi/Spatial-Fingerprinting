// P5 — tests for the analysis engine.
//
// The statistical gate lives in `npm run analyze:selftest` (synthetic recovery,
// permutation-null uniformity, ablation sanity, layer separation). This file
// covers the pieces underneath it: the maths that the gate assumes is right.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { activeSites } from '../src/lib/site.js'
import { mulberry32 } from '../src/lib/triplets.js'
import {
  METRICS,
  buildFingerprints,
  canonicalReadings,
  normaliseValue,
} from '../src/lib/analysis/fingerprints.js'
import {
  PAIRS,
  N_METRICS,
  chosenPairIndex,
  nllAndGradient,
  normaliseWeights,
  pairProbabilities,
  totalNLL,
} from '../src/lib/analysis/model.js'
import { fitWeights, maskTriplets, AREA_INDEX } from '../src/lib/analysis/fit.js'
import { selectTriplets, summarise } from '../src/lib/analysis/exclusions.js'
import { recordAttentionCheckPassed } from '../src/lib/session.js'
import { signTestTwoSided, CHANCE } from '../src/lib/analysis/crossval.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const sites = read('src/data/sites.json')
const readings = read('src/data/results.json')
const responses = read('src/data/survey-responses.json')
const siteIds = activeSites(sites).map((s) => s.id)
const { bounds, fingerprints } = buildFingerprints(readings, siteIds)

// A small deterministic set of prepared triplets for the maths tests.
function syntheticTriplets(n, seed = 7) {
  const rng = mulberry32(seed)
  const ids = [...fingerprints.keys()]
  const out = []
  for (let i = 0; i < n; i++) {
    const pick = []
    while (pick.length < 3) {
      const id = ids[Math.floor(rng() * ids.length)]
      if (!pick.includes(id)) pick.push(id)
    }
    const xs = pick.map((id) => fingerprints.get(id))
    const delta = new Float64Array(PAIRS.length * N_METRICS)
    for (let p = 0; p < PAIRS.length; p++) {
      const [a, b] = PAIRS[p]
      for (let k = 0; k < N_METRICS; k++) {
        const d = xs[a][k] - xs[b][k]
        delta[p * N_METRICS + k] = d * d
      }
    }
    out.push({ delta, chosen: Math.floor(rng() * 3), participant: `p${i % 10}`, sites: pick })
  }
  return out
}

describe('fingerprints — frozen normalisation bounds', () => {
  test('all 18 canonical readings load, one per active site', () => {
    const bySite = canonicalReadings(readings, siteIds)
    assert.equal(bySite.size, 18)
    assert.equal(siteIds.length, 18)
  })

  // results.json holds several FOV layers at once. Selection is by layer:
  // another layer's records are skipped, never merged into this one.
  test('records from another FOV layer are skipped, not merged', () => {
    // results.json holds both perceptual layers side by side, measured at
    // different points with different sweeps. Selection is by layer: the other
    // layer's records are skipped, never merged into this one.
    const p120 = canonicalReadings(readings, siteIds, 'perceptual_120')
    assert.equal(p120.size, 18)
    for (const r of p120.values()) assert.equal(r.fov_mode, 'perceptual_120')

    const p360 = canonicalReadings(readings, siteIds, 'perceptual_360')
    assert.equal(p360.size, 18)
    for (const r of p360.values()) assert.equal(r.fov_mode, 'perceptual_360')

    // Same plazas, genuinely different readings — the layers are not aliases.
    for (const id of siteIds) {
      assert.notEqual(
        p120.get(id).area_m2,
        p360.get(id).area_m2,
        id + ': a 360° sweep cannot equal its 120° wedge'
      )
    }
  })

  test('mislabelling the only reading for a site makes it missing, not silently wrong', () => {
    const poisoned = readings.map((r) =>
      r.site_id === siteIds[0] && r.fov_mode === 'perceptual_120' ? { ...r, fov_mode: 'field_360' } : r
    )
    assert.throws(
      () => canonicalReadings(poisoned, siteIds, 'perceptual_120'),
      /No canonical perceptual_120 reading/,
      'a layer must never quietly fall back to a record from a different one'
    )
  })

  test('a canonical record with no declared layer is always an error', () => {
    const ambiguous = readings.map((r, i) => {
      if (i !== 0) return r
      const { fov_mode: _fov, ...rest } = r
      return rest
    })
    assert.throws(() => canonicalReadings(ambiguous, siteIds), /declares no fov_mode/)
  })

  test('an unknown layer name is rejected rather than returning nothing', () => {
    assert.throws(() => canonicalReadings(readings, siteIds, 'perceptual_240'), /Unknown fov_mode/)
  })

  test('a duplicate canonical reading within one layer is rejected', () => {
    const dupe = [...readings, { ...readings.find((r) => r.fov_mode === 'perceptual_120'), id: 'copy' }]
    assert.throws(() => canonicalReadings(dupe, siteIds), /Two canonical perceptual_120 readings/)
  })

  // The panoramic layer's readings are placed by hand in the viewer, so this
  // asserts whichever situation is true: either the layer is complete and its
  // bounds stand apart from the 120° layer's, or it is empty and a request for
  // it fails loudly rather than quietly falling back to the other layer.
  test('the panoramic layer is either complete and independent, or absent and loud', () => {
    const pano = readings.filter((r) => r.fov_mode === 'perceptual_360' && r.canonical === true)

    if (pano.length === 0) {
      assert.throws(
        () => buildFingerprints(readings, siteIds, 'perceptual_360'),
        /No canonical perceptual_360 reading/,
        'an empty layer must fail, never silently borrow the 120° layer'
      )
      return
    }

    assert.equal(pano.length, 18, 'a partially captured layer must not be used for bounds')
    const p120 = buildFingerprints(readings, siteIds, 'perceptual_120')
    const p360 = buildFingerprints(readings, siteIds, 'perceptual_360')
    for (const m of METRICS) {
      assert.notEqual(
        p120.bounds[m].max,
        p360.bounds[m].max,
        `${m} bounds coincide across layers — each layer must scale on its own range`
      )
    }
    // A 360° sweep sees strictly more from a point than a 120° wedge does.
    assert.ok(p360.bounds.area.max > p120.bounds.area.max)
  })

  test('bounds name the site that sets each end', () => {
    // Asserts that the attribution is CORRECT, not which site happens to win.
    // Naming specific sites pinned a fact about the dataset rather than about
    // the code, so redefining a metric broke this test while nothing it exists
    // to protect had changed — as the 2026-08-27 enclosure change showed, when
    // the peak moved from Rathausmarkt to Naschmarkt purely because the formula
    // did. Recomputing the extremes here keeps the guarantee that matters: a
    // frozen bound always points at the site it actually came from.
    const raw = canonicalReadings(readings, siteIds)
    const SOURCE_KEYS = {
      area: 'area_m2',
      compactness: 'compactness',
      occlusivity: 'occlusivity_m',
      enclosure: 'enclosure_ratio',
    }
    for (const m of METRICS) {
      const b = bounds[m]
      assert.ok(b.minSite && b.maxSite, `${m} bounds must be attributed`)
      assert.ok(b.max > b.min, `${m} must have spread`)

      const values = [...raw].map(([id, r]) => [id, r[SOURCE_KEYS[m]]])
      const trueMin = values.reduce((a, b2) => (b2[1] < a[1] ? b2 : a))
      const trueMax = values.reduce((a, b2) => (b2[1] > a[1] ? b2 : a))
      assert.equal(b.minSite, trueMin[0], `${m} minSite must be the site holding the minimum`)
      assert.equal(b.maxSite, trueMax[0], `${m} maxSite must be the site holding the maximum`)
      assert.equal(b.min, trueMin[1])
      assert.equal(b.max, trueMax[1])
    }
  })

  test('normalisation puts the extreme sites exactly at 0 and 1', () => {
    for (const m of METRICS) {
      assert.equal(normaliseValue(bounds[m].min, bounds[m]), 0)
      assert.equal(normaliseValue(bounds[m].max, bounds[m]), 1)
    }
  })

  test('normalisation is not clamped — out-of-corpus values stay out of range', () => {
    // P7 markers and P9 interventions can legitimately fall outside the corpus.
    // Clamping would silently misreport them as sitting on the boundary.
    const b = bounds.area
    assert.ok(normaliseValue(b.min - (b.max - b.min), b) < 0)
    assert.ok(normaliseValue(b.max + (b.max - b.min), b) > 1)
  })

  test('every fingerprint has one value per metric, all finite', () => {
    assert.equal(fingerprints.size, 18)
    for (const [id, f] of fingerprints) {
      assert.equal(f.length, N_METRICS, id)
      assert.ok(f.every(Number.isFinite), id)
    }
  })
})

describe('model — choice probabilities and likelihood', () => {
  test('probabilities sum to 1 and favour the closer pair', () => {
    const t = syntheticTriplets(1, 3)[0]
    const w = [1, 1, 1, 1]
    const probs = pairProbabilities(t, w)
    assert.ok(Math.abs([...probs].reduce((s, v) => s + v, 0) - 1) < 1e-12)

    // The pair with the smallest weighted squared distance must be most likely.
    const d2 = PAIRS.map((_, p) => {
      let s = 0
      for (let k = 0; k < N_METRICS; k++) s += w[k] * t.delta[p * N_METRICS + k]
      return s
    })
    const closest = d2.indexOf(Math.min(...d2))
    const likeliest = [...probs].indexOf(Math.max(...probs))
    assert.equal(likeliest, closest)
  })

  test('probabilities survive weights large enough to underflow naively', () => {
    const t = syntheticTriplets(1, 5)[0]
    const probs = pairProbabilities(t, [500, 500, 500, 500])
    assert.ok([...probs].every(Number.isFinite))
    assert.ok(Math.abs([...probs].reduce((s, v) => s + v, 0) - 1) < 1e-9)
  })

  test('equal weights on identical fingerprints give a uniform choice', () => {
    const t = { delta: new Float64Array(PAIRS.length * N_METRICS), chosen: 0 }
    const probs = pairProbabilities(t, [1, 1, 1, 1])
    for (const p of probs) assert.ok(Math.abs(p - 1 / 3) < 1e-12)
  })

  test('chosenPairIndex maps a chosen pair onto the right slot, order-independently', () => {
    const trio = ['a', 'b', 'c']
    assert.equal(chosenPairIndex(trio, ['a', 'b']), 0)
    assert.equal(chosenPairIndex(trio, ['b', 'a']), 0)
    assert.equal(chosenPairIndex(trio, ['a', 'c']), 1)
    assert.equal(chosenPairIndex(trio, ['c', 'b']), 2)
    assert.equal(chosenPairIndex(trio, ['a', 'a']), -1)
    assert.equal(chosenPairIndex(trio, ['a', 'z']), -1)
    assert.equal(chosenPairIndex(trio, ['a']), -1)
  })

  // The load-bearing test for the whole fit: the closed-form gradient in
  // model.js replaced the central differences the plan allowed. If the
  // derivation is wrong, every weight, CI and p-value downstream is wrong, and
  // nothing else in the suite would notice.
  test('the analytic gradient matches central differences', () => {
    const triplets = syntheticTriplets(200, 11)
    for (const w of [
      [1, 1, 1, 1],
      [0.3, 2.1, 0.7, 1.4],
      [5, 0.2, 0.9, 3.3],
    ]) {
      const { grad } = nllAndGradient(triplets, w)
      for (let k = 0; k < N_METRICS; k++) {
        const h = 1e-6 * Math.max(1, Math.abs(w[k]))
        const up = w.slice()
        const down = w.slice()
        up[k] += h
        down[k] -= h
        const numeric = (totalNLL(triplets, up) - totalNLL(triplets, down)) / (2 * h)
        const relErr = Math.abs(numeric - grad[k]) / Math.max(1, Math.abs(numeric))
        assert.ok(
          relErr < 1e-5,
          `∂NLL/∂w[${k}] at [${w}]: analytic ${grad[k]}, numeric ${numeric}, rel err ${relErr}`
        )
      }
    }
  })

  test('normaliseWeights sums to one and keeps proportions', () => {
    const w = normaliseWeights([2, 4, 6, 8])
    assert.ok(Math.abs(w.reduce((s, v) => s + v, 0) - 1) < 1e-12)
    assert.ok(Math.abs(w[1] / w[0] - 2) < 1e-12)
  })
})

describe('fit — optimiser behaviour', () => {
  test('the optimiser reduces the NLL from its starting point', () => {
    const triplets = syntheticTriplets(400, 21)
    const start = totalNLL(triplets, [1, 1, 1, 1])
    const fit = fitWeights(triplets, { restarts: 2, iterations: 300 })
    assert.ok(fit.nll <= start, `NLL rose: ${start} → ${fit.nll}`)
    assert.ok(fit.weights.every((w) => w > 0), 'log-space parameterisation must keep weights positive')
  })

  test('masking makes a metric genuinely invisible to the model', () => {
    const triplets = syntheticTriplets(50, 33)
    const masked = maskTriplets(triplets, [AREA_INDEX])
    for (const t of masked) {
      for (let p = 0; p < PAIRS.length; p++) {
        for (let k = 0; k < N_METRICS; k++) {
          if (k !== AREA_INDEX) assert.equal(t.delta[p * N_METRICS + k], 0)
        }
      }
    }
    // A masked metric contributes nothing to the gradient, so it cannot drift.
    const { grad } = nllAndGradient(masked, [1, 1, 1, 1])
    for (let k = 0; k < N_METRICS; k++) {
      if (k !== AREA_INDEX) assert.equal(grad[k], 0)
    }
  })

  test('masking leaves the original triplets untouched', () => {
    const triplets = syntheticTriplets(10, 44)
    const before = Array.from(triplets[0].delta)
    maskTriplets(triplets, [AREA_INDEX])
    assert.deepEqual(Array.from(triplets[0].delta), before)
  })

  test('an empty response set fails cleanly rather than returning nonsense', () => {
    const fit = fitWeights([])
    assert.equal(fit.weights, null)
    assert.equal(fit.converged, false)
  })
})

describe('exclusions — who and what enters the fit', () => {
  const selection = selectTriplets(responses, fingerprints, siteIds)
  const summary = summarise(responses, selection)

  // Asserts the RULE, not a snapshot of the dataset. The archived study's file
  // can still grow if late sessions are pulled from its Sheet, and a test that
  // pinned the exact counts would fail on that alone — which says nothing about
  // whether the selection logic is right.
  test('the documented rule selects exactly the participants who passed the check', () => {
    const expectedUsed = responses.filter((r) => recordAttentionCheckPassed(r) === true).length
    const expectedNeverReached = responses.filter(
      (r) => recordAttentionCheckPassed(r) === null
    ).length
    const expectedFailed = responses.filter((r) => recordAttentionCheckPassed(r) === false).length

    assert.equal(summary.participants.collected, responses.length)
    assert.equal(summary.participants.used, expectedUsed)
    assert.equal(summary.participants.dropped, responses.length - expectedUsed)
    assert.equal(
      summary.participants.byReason.never_reached_attention_check,
      expectedNeverReached
    )
    assert.equal(summary.participants.byReason.failed_attention_check, expectedFailed)
    // Every drop must be accounted for by one of the two named reasons.
    assert.equal(
      expectedNeverReached + expectedFailed,
      summary.participants.dropped,
      'a participant was dropped for an unnamed reason'
    )
  })

  test('attention-check triplets are dropped, and nothing is malformed', () => {
    // Every genuine triplet belonging to an eligible participant, and nothing
    // else, should reach the fit.
    const expectedUsed = responses
      .filter((r) => recordAttentionCheckPassed(r) === true)
      .reduce((n, r) => n + (r.responses ?? []).filter((x) => !x.is_attention_check).length, 0)

    assert.equal(summary.responses.used, expectedUsed)
    assert.ok(summary.responses.dropped.attention_check_triplet > 0)
    assert.equal(summary.responses.dropped.malformed_response, 0)
    assert.equal(summary.responses.dropped.names_an_excluded_site, 0)
    // Nothing may vanish unaccounted for.
    const droppedTotal = Object.values(summary.responses.dropped).reduce((a, b) => a + b, 0)
    assert.equal(summary.responses.used + droppedTotal, summary.responses.collected)
  })

  test('the check discriminated nobody, and that is reported rather than implied', () => {
    // A 100% pass rate is not evidence of data quality — it is evidence the
    // check was too easy. The UI must not present an exclusion that never ran.
    assert.equal(summary.attentionCheckDiscriminated, false)
  })

  test('every selected triplet is well formed', () => {
    for (const t of selection.triplets) {
      assert.equal(t.sites.length, 3)
      assert.equal(new Set(t.sites).size, 3)
      assert.ok(t.chosen >= 0 && t.chosen < 3)
      assert.ok(t.delta.every((v) => Number.isFinite(v) && v >= 0))
      assert.ok(t.participant)
    }
  })
})

describe('crossval — the sign test', () => {
  test('a unanimous result is significant, an even split is not', () => {
    assert.ok(signTestTwoSided(18, 18) < 0.001)
    // An even split sums every outcome's probability, which lands a few ulps
    // short of exactly 1 in floating point.
    assert.ok(Math.abs(signTestTwoSided(9, 18) - 1) < 1e-12)
    assert.ok(signTestTwoSided(15, 18) < 0.05)
    assert.ok(signTestTwoSided(12, 18) > 0.05)
  })

  test('it is symmetric — direction does not change the p-value', () => {
    for (const k of [0, 3, 7, 14, 18]) {
      assert.ok(Math.abs(signTestTwoSided(k, 18) - signTestTwoSided(18 - k, 18)) < 1e-12)
    }
  })

  test('chance is one in three', () => {
    assert.ok(Math.abs(CHANCE - 1 / 3) < 1e-12)
  })
})
