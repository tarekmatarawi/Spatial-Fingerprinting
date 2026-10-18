// The precondition and the five hypotheses are the study's headline claims,
// and their verdicts are derived rather than written down — so the derivation
// is what has to be pinned. These tests guard the rules, and pin the verdicts
// the stored analysis gives, so a coding slip cannot silently flip one.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildHypotheses,
  summariseVerdicts,
  reliabilityPrecondition,
  facadeContinuityCorrelations,
  VERDICT,
} from '../src/lib/analysis/hypotheses.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const analysis = read('src/data/analysis-panoramic.json')
const ratings = read('src/data/rating-validation.json')

const withPaired = (paired) => ({
  ...analysis,
  crossval: { ...analysis.crossval, paired: { ...analysis.crossval.paired, ...paired } },
})

describe('hypotheses — derivation from the analysis outputs', () => {
  test('produces exactly five, each with a verdict and evidence', () => {
    const hs = buildHypotheses(analysis, ratings)
    assert.equal(hs.length, 5)
    assert.deepEqual(
      hs.map((h) => h.id),
      ['H1', 'H2', 'H3', 'H4', 'H5']
    )
    for (const h of hs) {
      assert.ok(Object.values(VERDICT).includes(h.verdict), `${h.id} has a known verdict`)
      assert.ok(h.claim.length > 20, `${h.id} states a claim`)
      assert.ok(h.evidence.length > 0, `${h.id} carries evidence`)
      assert.ok(h.why.length > 20, `${h.id} says why it matters`)
    }
  })

  test('the stored analysis gives the reported verdicts', () => {
    const verdicts = Object.fromEntries(buildHypotheses(analysis, ratings).map((h) => [h.id, h.verdict]))
    assert.deepEqual(verdicts, {
      H1: VERDICT.SUPPORTED,
      H2: VERDICT.PARTLY,
      H3: VERDICT.SUPPORTED,
      H4: VERDICT.SUPPORTED,
      H5: VERDICT.DIRECTIONAL,
    })
    assert.equal(reliabilityPrecondition(ratings).passes, true)
  })

  test('the precondition fails if any one scale falls below .40', () => {
    const weak = { ...ratings, scales: ratings.scales.map((s, i) => (i === 0 ? { ...s, reliability: 0.39 } : s)) }
    assert.equal(reliabilityPrecondition(weak).passes, false)
  })

  test('H2 is partly supported when some metrics match and some do not', () => {
    const hs = buildHypotheses(analysis, ratings)
    const h2 = hs.find((h) => h.id === 'H2')
    const converging = ratings.scales.filter((s) => s.pearson_p_holm < 0.05 && s.pearson_aligned > 0)
    const expected =
      converging.length === ratings.scales.length
        ? VERDICT.SUPPORTED
        : converging.length === 0
          ? VERDICT.NOT_SUPPORTED
          : VERDICT.PARTLY
    assert.equal(h2.verdict, expected)
    assert.match(h2.headline, /^3 of 4 /)
  })

  test('H3 needs every mismatching scale to have raters who agreed', () => {
    // Without the reliability half, a failed correlation could just mean
    // participants were guessing, which would say nothing about the metric.
    const stripped = {
      ...ratings,
      scales: ratings.scales.map((s) => (s.metric === 'closedPerimeter' ? { ...s, reliability: 0.1 } : s)),
    }
    const weak = buildHypotheses(analysis, stripped).find((h) => h.id === 'H3')
    assert.equal(weak.verdict, VERDICT.NOT_SUPPORTED, 'unreliable raters must not count as evidence about the metric')

    // A reliability drop on a scale that DOES match is not H3's business.
    const other = {
      ...ratings,
      scales: ratings.scales.map((s) => (s.metric === 'area' ? { ...s, reliability: 0.1 } : s)),
    }
    assert.equal(buildHypotheses(analysis, other).find((h) => h.id === 'H3').verdict, VERDICT.SUPPORTED)
  })

  test('H5 is supported only by a significant sign test with the full model ahead', () => {
    const verdictOf = (paired) => buildHypotheses(withPaired(paired), ratings).find((h) => h.id === 'H5').verdict
    assert.equal(verdictOf({ signTestP: 0.001, wins: 14, losses: 1 }), VERDICT.SUPPORTED)
    // Ahead but not significant: the stored result.
    assert.equal(verdictOf({ signTestP: 0.6, wins: 9, losses: 6 }), VERDICT.DIRECTIONAL)
    // A significant test with the BASELINE ahead is a defeat, not support.
    assert.equal(verdictOf({ signTestP: 0.001, wins: 1, losses: 14 }), VERDICT.NOT_SUPPORTED)
    assert.equal(verdictOf({ signTestP: 1, wins: 6, losses: 6 }), VERDICT.NOT_SUPPORTED)
  })

  test('H4 fails if any bootstrap interval touches zero', () => {
    const idle = {
      ...analysis,
      bootstrap: {
        ...analysis.bootstrap,
        per_metric: analysis.bootstrap.per_metric.map((b, i) => (i === 2 ? { ...b, lo: -0.01 } : b)),
      },
    }
    const h4 = buildHypotheses(idle, ratings).find((h) => h.id === 'H4')
    assert.equal(h4.verdict, VERDICT.NOT_SUPPORTED)
  })

  test('no evidence line claims an interval nothing computes', () => {
    // "spans zero" may appear only where it is derived from a stored interval.
    const h5 = buildHypotheses(analysis, ratings).find((h) => h.id === 'H5')
    for (const e of h5.evidence) assert.doesNotMatch(e.value, /spans zero/)
  })

  test('H5 quotes the area–enclosure index correlation computed from the data', () => {
    const h5 = buildHypotheses(analysis, ratings).find((h) => h.id === 'H5')
    assert.match(h5.evidence.find((e) => e.label === 'Why they overlap').value, /r = −0\.64 across the 18 plazas/)
    // Moving one plaza's value must move the quoted figure: it is derived, not typed.
    const moved = {
      ...ratings,
      scales: ratings.scales.map((s) =>
        s.metric === 'enclosure'
          ? { ...s, per_site: s.per_site.map((p, i) => (i === 0 ? { ...p, computed: p.computed + 0.5 } : p)) }
          : s
      ),
    }
    const shifted = buildHypotheses(analysis, moved).find((h) => h.id === 'H5')
    assert.doesNotMatch(shifted.evidence.find((e) => e.label === 'Why they overlap').value, /−0\.64/)
  })

  test('the summary counts every hypothesis exactly once', () => {
    const hs = buildHypotheses(analysis, ratings)
    const s = summariseVerdicts(hs)
    assert.equal(s.supported + s.partly + s.directional + s.notSupported, s.total)
    assert.equal(s.total, hs.length)
  })
})

describe('hypotheses — the H3 facade continuity comparison', () => {
  test('ranks all four metrics against the one percept, strongest first', () => {
    const rows = facadeContinuityCorrelations(ratings)

    assert.deepEqual(
      rows.map((r) => r.metric),
      ['compactness', 'area', 'closedPerimeter', 'enclosure']
    )
    // The figure quotes these; if the analysis is rerun and they move, the
    // caption in the thesis moves with them rather than silently disagreeing.
    assert.deepEqual(
      rows.map((r) => r.aligned.toFixed(3)),
      ['0.460', '0.379', '0.223', '0.012']
    )
    for (const r of rows) {
      assert.equal(r.aligned, Math.abs(r.r))
      assert.equal(r.n, 18)
    }
  })

  test('closed perimeter matches the value the rating validation already reports', () => {
    const cp = facadeContinuityCorrelations(ratings).find((r) => r.metric === 'closedPerimeter')
    const scale = ratings.scales.find((s) => s.metric === 'closedPerimeter')
    // Perceived facade continuity is the reflected closed perimeter rating, so
    // the metric's correlation with it is exactly the aligned r already in the
    // record — one number, computed twice, never allowed to differ.
    assert.ok(Math.abs(cp.r - scale.pearson_aligned) < 1e-9)
    assert.equal(cp.direction, 'more continuous')
  })

  test('two other metrics track perceived facade continuity more closely', () => {
    const rows = facadeContinuityCorrelations(ratings)
    const cp = rows.find((r) => r.metric === 'closedPerimeter')
    const better = rows.filter((r) => r.aligned > cp.aligned).map((r) => r.metric)
    assert.deepEqual(better, ['compactness', 'area'])
  })
})
