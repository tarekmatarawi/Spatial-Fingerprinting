// The six hypotheses are the study's headline claims, and their verdicts are
// derived rather than written down — so the derivation is what has to be
// pinned. These tests guard the rules, not the current numbers: a rerun with
// more participants should move the evidence without silently flipping a
// verdict through a coding slip.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildHypotheses, summariseVerdicts, VERDICT } from '../src/lib/analysis/hypotheses.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const analysis = read('src/data/analysis-panoramic.json')
const ratings = read('src/data/rating-validation.json')

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

  test('H2 is partly supported when some dimensions converge and some do not', () => {
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
  })

  test('H3 needs BOTH a failed convergence and raters who agreed', () => {
    // The pairing is the whole point: without the reliability half, a failed
    // correlation could just mean participants were guessing, which would say
    // nothing about the metric.
    const hs = buildHypotheses(analysis, ratings)
    const occ = ratings.scales.find((s) => s.metric === 'occlusivity')
    const h3 = hs.find((h) => h.id === 'H3')
    if (occ.pearson_p_holm >= 0.05 && occ.reliability >= 0.4) {
      assert.equal(h3.verdict, VERDICT.SUPPORTED)
    } else {
      assert.equal(h3.verdict, VERDICT.NOT_SUPPORTED)
    }

    const stripped = { ...ratings, scales: ratings.scales.map((s) => (s.metric === 'occlusivity' ? { ...s, reliability: 0.1 } : s)) }
    const weak = buildHypotheses(analysis, stripped).find((h) => h.id === 'H3')
    assert.equal(weak.verdict, VERDICT.NOT_SUPPORTED, 'unreliable raters must not count as evidence about the metric')
  })

  test('H5 reads a genuine ensemble win as the limitation NOT holding', () => {
    // A significant sign test with a NEGATIVE mean delta means the baseline
    // beat the full model consistently. Reading only the p-value there would
    // report a defeat as support.
    const flipped = {
      ...analysis,
      crossval: {
        ...analysis.crossval,
        paired: { ...analysis.crossval.paired, signTestP: 0.001, meanDelta: -0.03 },
      },
    }
    const h5 = buildHypotheses(flipped, ratings).find((h) => h.id === 'H5')
    assert.equal(h5.verdict, VERDICT.SUPPORTED, 'a significant NEGATIVE delta still means the ensemble lost')
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

  test('the summary counts every hypothesis exactly once', () => {
    const hs = buildHypotheses(analysis, ratings)
    const s = summariseVerdicts(hs)
    assert.equal(s.supported + s.partly + s.notSupported, s.total)
    assert.equal(s.total, hs.length)
  })
})
