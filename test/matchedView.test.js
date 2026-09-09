// P8's unit gate.
//
// The self-test script (npm run matched-view:selftest) checks the analysis
// end to end against simulated cohorts. This file checks the pieces it is built
// from, on constructions whose answers can be worked out by hand — so that when
// the self-test fails, it is possible to tell which part broke.
//
// The statistics are pinned against values computed independently rather than
// against whatever the code happened to return the first time it ran. A test
// that records current behaviour cannot detect that current behaviour is wrong.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BLOCK_LENGTH,
  PREDICTORS,
  STRATA,
  TRIALS_PER_STRATUM,
  assembleMatchedViewBlock,
  scoredAs,
  validateTrialBank,
} from '../src/lib/matchedView.js'
import {
  accuracyByMargin,
  adjudicate,
  binomialPmf,
  binomialTest,
  joinResponses,
  mcnemarExact,
  positionBias,
  scorePredictor,
  signTest,
  wilsonInterval,
} from '../src/lib/analysis/matchedView.js'

const BANK = JSON.parse(readFileSync(new URL('../src/data/matched-view-trials.json', import.meta.url), 'utf8'))

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

/* --------------------------------------------------------------- statistics */

describe('binomial', () => {
  test('the pmf matches values computable by hand', () => {
    // 10 fair coins: C(10,5)/2^10 = 252/1024.
    assert.ok(close(binomialPmf(5, 10, 0.5), 252 / 1024))
    assert.ok(close(binomialPmf(0, 10, 0.5), 1 / 1024))
    assert.ok(close(binomialPmf(10, 10, 0.5), 1 / 1024))
    // Outside the support.
    assert.equal(binomialPmf(11, 10, 0.5), 0)
    assert.equal(binomialPmf(-1, 10, 0.5), 0)
  })

  test('the pmf sums to one even at sizes that overflow a factorial', () => {
    // 200! is far beyond a double, so this passes only because the whole
    // computation stays in log space.
    // Without log space this is NaN or 0, not merely imprecise. The tolerance
    // allows for 401 accumulated additions, not for a missing implementation.
    let total = 0
    for (let k = 0; k <= 400; k++) total += binomialPmf(k, 400, 0.5)
    assert.ok(close(total, 1, 1e-9), `summed to ${total}`)
  })

  test('a two-sided test at the extreme gives both tails, not one', () => {
    // 8 of 8 correct: 2 x (1/256).
    const t = binomialTest(8, 8, 0.5)
    assert.ok(close(t.p_value, 2 / 256), `got ${t.p_value}`)
    assert.equal(t.accuracy, 1)
  })

  test('an exactly even split cannot be evidence of anything', () => {
    // Every outcome is at least as likely as the modal one is not, so the whole
    // distribution is summed and p is exactly 1. This is the check that would
    // fail if the tolerance in binomialTest were dropped: floating-point
    // asymmetry across the two tails silently produces p ~ 0.75 instead.
    assert.ok(close(binomialTest(5, 10, 0.5).p_value, 1))
    assert.ok(close(binomialTest(50, 100, 0.5).p_value, 1))
  })

  test('the test is symmetric under swapping successes and failures', () => {
    for (const [k, n] of [[3, 20], [7, 31], [40, 97]]) {
      assert.ok(close(binomialTest(k, n).p_value, binomialTest(n - k, n).p_value, 1e-12))
    }
  })

  test('an empty sample is not significant', () => {
    const t = binomialTest(0, 0)
    assert.equal(t.p_value, 1)
    assert.equal(t.accuracy, null)
  })
})

describe('wilson interval', () => {
  test('stays inside 0..1 at the boundaries, where the normal approximation does not', () => {
    const zero = wilsonInterval(0, 20)
    assert.equal(zero.low, 0)
    assert.ok(zero.high > 0 && zero.high < 1)
    const all = wilsonInterval(20, 20)
    assert.equal(all.high, 1)
    assert.ok(all.low > 0 && all.low < 1)
  })

  test('brackets the estimate and narrows as the sample grows', () => {
    const small = wilsonInterval(30, 50)
    const large = wilsonInterval(300, 500)
    assert.ok(small.low < 0.6 && small.high > 0.6)
    assert.ok(large.high - large.low < small.high - small.low)
  })

  test('a half-and-half split centres on 0.5', () => {
    const ci = wilsonInterval(50, 100)
    assert.ok(close((ci.low + ci.high) / 2, 0.5, 1e-12))
  })
})

describe('mcnemar', () => {
  test('uses only the discordant pairs', () => {
    // Concordant counts are not passed in at all, which is the point: adding
    // them must be impossible rather than merely discouraged.
    const a = mcnemarExact(10, 0)
    assert.equal(a.n, 10)
    assert.ok(close(a.p_value, 2 * (1 / 1024)), `got ${a.p_value}`)
  })

  test('an even split of discordant pairs is not evidence', () => {
    assert.ok(close(mcnemarExact(7, 7).p_value, 1))
  })

  test('no discordant pairs means nothing to test', () => {
    const none = mcnemarExact(0, 0)
    assert.equal(none.p_value, 1)
    assert.equal(none.odds, null)
  })

  test('is symmetric in its two arguments', () => {
    assert.ok(close(mcnemarExact(3, 11).p_value, mcnemarExact(11, 3).p_value))
  })
})

describe('sign test', () => {
  test('drops participants exactly at chance rather than splitting them', () => {
    const result = signTest([
      { accuracy: 0.8 },
      { accuracy: 0.7 },
      { accuracy: 0.5 },
      { accuracy: 0.5 },
      { accuracy: 0.3 },
    ])
    assert.equal(result.above, 2)
    assert.equal(result.below, 1)
    assert.equal(result.tied, 2)
    // n is above + below — the ties are excluded from the test, not from the count.
    assert.equal(result.n, 3)
    assert.equal(result.n_participants, 5)
  })

  test('weights every participant equally regardless of trials answered', () => {
    // One person answering 100 trials at 50% and one answering 2 at 100% gives
    // a pooled accuracy near 51% but a mean-per-person of 75%. The distinction
    // is the whole reason both are reported.
    const result = signTest([
      { k: 50, n: 100, accuracy: 0.5 },
      { k: 2, n: 2, accuracy: 1 },
    ])
    assert.ok(close(result.mean_accuracy, 0.75))
  })
})

/* ------------------------------------------------------- scoring and joining */

// A hand-built two-trial bank whose every answer is known.
const TOY_BANK = {
  version: 'toy',
  fov_mode: 'perceptual_120',
  trials: [
    toyTrial('t1', 'agreement', { centroid: 'a', gaussian: 'a', chamfer: 'a' }, 0.4),
    toyTrial('t2', 'discriminating', { centroid: 'b', gaussian: 'b', chamfer: 'a' }, 0.9),
  ],
}

function toyTrial(id, stratum, predictions, strength) {
  const view = (site, i) => ({
    site_id: site,
    site_name: site,
    view_index: i,
    local_x: 0,
    local_y: 0,
    direction_deg: 0,
    fov_mode: 'perceptual_120',
  })
  return {
    trial_id: id,
    stratum,
    reference: view('REF', 0),
    candidates: [view('A', 0), view('B', 0)],
    predictions,
    margins: { view: strength, centroid: strength, gaussian: strength },
    strength,
  }
}

const record = (id, answers) => ({
  participant_id: id,
  responses: answers.map(([trial_id, chosen_side, left_side]) => ({
    participant_id: id,
    trial_id,
    chosen_side,
    left_side: left_side ?? 'a',
    predictions: TOY_BANK.trials.find((t) => t.trial_id === trial_id)?.predictions,
  })),
})

describe('scoring', () => {
  test('scoredAs reports a miss and a hit, and null when unscoreable', () => {
    const t = TOY_BANK.trials[1]
    assert.equal(scoredAs(t, 'a', 'chamfer'), true)
    assert.equal(scoredAs(t, 'b', 'chamfer'), false)
    assert.equal(scoredAs(t, 'a', 'centroid'), false)
    assert.equal(scoredAs(t, 'a', 'nonexistent'), null)
    assert.equal(scoredAs(t, 'not-a-side', 'chamfer'), null)
  })

  test('an unscoreable trial is skipped, never counted as wrong', () => {
    // Counting a null as a miss would drag every accuracy toward zero — the
    // failure mode this returns null to prevent.
    const rows = joinResponses([record('p1', [['t2', 'a']])], TOY_BANK).rows
    const scored = scorePredictor(rows, 'nonexistent')
    assert.equal(scored.n, 0)
    assert.equal(scored.accuracy, null)
  })

  test('on a discriminating trial the measures score in opposite directions', () => {
    const rows = joinResponses(
      [record('p1', [['t2', 'a']]), record('p2', [['t2', 'a']]), record('p3', [['t2', 'b']])],
      TOY_BANK
    ).rows
    assert.equal(scorePredictor(rows, 'chamfer').k, 2)
    assert.equal(scorePredictor(rows, 'centroid').k, 1)
    assert.equal(scorePredictor(rows, 'chamfer').n, 3)
  })

  test('adjudication counts only discordant judgements', () => {
    const rows = joinResponses(
      [
        record('p1', [['t1', 'a'], ['t2', 'a']]),
        record('p2', [['t1', 'b'], ['t2', 'b']]),
      ],
      TOY_BANK
    ).rows
    const a = adjudicate(rows, 'chamfer', 'centroid')
    // t1 predicts the same for both, so both answers there are concordant.
    // t2 splits them: p1 chose chamfer's, p2 chose centroid's.
    assert.equal(a.a_only, 1)
    assert.equal(a.b_only, 1)
    assert.equal(a.discordant, 2)
    assert.equal(a.both + a.neither, 2)
  })

  test('an agreement trial can never produce a discordant pair', () => {
    const rows = joinResponses(
      [record('p1', [['t1', 'a']]), record('p2', [['t1', 'b']])],
      TOY_BANK
    ).rows
    assert.equal(adjudicate(rows, 'chamfer', 'centroid').discordant, 0)
  })

  test('position bias reads the screen side, not the bank side', () => {
    // Both participants chose bank-side 'a', but it sat on opposite sides of
    // the screen, so this is one left and one right — not two of either.
    const rows = joinResponses(
      [record('p1', [['t1', 'a', 'a']]), record('p2', [['t1', 'a', 'b']])],
      TOY_BANK
    ).rows
    assert.equal(positionBias(rows).left_share, 0.5)
  })
})

describe('provenance guards', () => {
  test('an answer to a trial the bank no longer has is reported, not dropped', () => {
    const { rows, orphaned } = joinResponses([record('p1', [['t1', 'a']]).responses ? { participant_id: 'p1', responses: [{ participant_id: 'p1', trial_id: 'gone', chosen_side: 'a' }] } : null], TOY_BANK)
    assert.equal(rows.length, 0)
    assert.equal(orphaned.length, 1)
    assert.equal(orphaned[0].trial_id, 'gone')
  })

  test('an answer whose recorded predictions drifted is not rescored', () => {
    const r = record('p1', [['t2', 'a']])
    r.responses[0].predictions = { centroid: 'a', gaussian: 'a', chamfer: 'a' }
    const { rows, stale } = joinResponses([r], TOY_BANK)
    assert.equal(rows.length, 0)
    assert.equal(stale.length, 1)
  })

  test('an answer with no recorded predictions is still scored', () => {
    // Tolerated rather than rejected: it is the shape a hand-entered or
    // legacy record has, and there is nothing about it that is inconsistent.
    const r = record('p1', [['t2', 'a']])
    delete r.responses[0].predictions
    assert.equal(joinResponses([r], TOY_BANK).rows.length, 1)
  })
})

describe('margin curve', () => {
  test('separates the bins by strength and recovers a rising accuracy', () => {
    const bank = {
      version: 'margins',
      fov_mode: 'perceptual_120',
      trials: Array.from({ length: 8 }, (_, i) =>
        toyTrial(`m${i}`, 'agreement', { centroid: 'a', gaussian: 'a', chamfer: 'a' }, (i + 1) / 10)
      ),
    }
    // The four weakest trials are answered wrongly, the four strongest rightly.
    const responses = bank.trials.map((t, i) => ({
      participant_id: 'p1',
      trial_id: t.trial_id,
      chosen_side: i < 4 ? 'b' : 'a',
      left_side: 'a',
    }))
    const rows = joinResponses([{ participant_id: 'p1', responses }], bank).rows
    const curve = accuracyByMargin(rows, 'chamfer', 2)
    assert.equal(curve.length, 2)
    assert.equal(curve[0].accuracy, 0)
    assert.equal(curve[1].accuracy, 1)
    assert.ok(curve[0].strength_max < curve[1].strength_min)
  })
})

/* -------------------------------------------------------- the bank and block */

describe('the committed trial bank', () => {
  test('passes its own validation', () => {
    assert.doesNotThrow(() => validateTrialBank(BANK))
  })

  test('every plaza anchors the same number of trials', () => {
    const byRef = new Map()
    for (const t of BANK.trials) {
      byRef.set(t.reference.site_id, (byRef.get(t.reference.site_id) ?? 0) + 1)
    }
    const counts = [...new Set(byRef.values())]
    assert.equal(counts.length, 1, `reference counts differ: ${[...byRef.values()].join(',')}`)
    assert.equal(byRef.size, 18)
  })

  test('candidate appearances are levelled rather than concentrated', () => {
    // The first build of this bank ranged from 6 to 39 appearances, which would
    // have made the study a description of a handful of plazas.
    const use = new Map()
    for (const t of BANK.trials) {
      for (const c of t.candidates) use.set(c.site_id, (use.get(c.site_id) ?? 0) + 1)
    }
    const counts = [...use.values()]
    const spread = Math.max(...counts) / Math.min(...counts)
    assert.ok(spread < 1.5, `candidate appearances span ${Math.min(...counts)}–${Math.max(...counts)}`)
  })

  test('no trial carries a margin too small to be a prediction', () => {
    for (const t of BANK.trials) {
      assert.ok(t.strength >= 0.05, `${t.trial_id} has strength ${t.strength}`)
    }
  })

  test('both strata span a comparable range of margins', () => {
    // If one stratum were systematically easier than the other, a difference in
    // accuracy between them would be a fact about the selection, not about the
    // measures.
    const spans = STRATA.map((s) => {
      const v = BANK.trials.filter((t) => t.stratum === s).map((t) => t.strength)
      return { s, min: Math.min(...v), max: Math.max(...v) }
    })
    for (const span of spans) {
      assert.ok(span.max - span.min > 0.3, `${span.s} spans only ${span.min}–${span.max}`)
    }
  })

  test('discriminating trials really do split chamfer from both cloud measures', () => {
    for (const t of BANK.trials.filter((t) => t.stratum === 'discriminating')) {
      assert.equal(t.predictions.centroid, t.predictions.gaussian)
      assert.notEqual(t.predictions.chamfer, t.predictions.centroid)
    }
  })

  test('the view distances agree with the chamfer prediction they produced', () => {
    // The prediction and the distance it came from are stored separately, so
    // this is the check that they cannot drift apart.
    for (const t of BANK.trials) {
      const [da, db] = t.view_distances
      assert.equal(t.predictions.chamfer, da < db ? 'a' : 'b', t.trial_id)
    }
  })
})

describe('validation rejects a bank the analysis could not read', () => {
  const mangle = (fn) => {
    const copy = JSON.parse(JSON.stringify(TOY_BANK))
    fn(copy)
    return copy
  }

  test('a bank from the wrong layer', () => {
    assert.throws(() => validateTrialBank(mangle((b) => (b.fov_mode = 'field_360'))), /perceptual_120/)
  })

  test('both candidates from one plaza', () => {
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[0].candidates[1].site_id = 'A'))),
      /both candidates/
    )
  })

  test('a candidate drawn from the reference plaza', () => {
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[0].candidates[0].site_id = 'REF'))),
      /candidate from the reference/
    )
  })

  test('a stratum that contradicts its own predictions', () => {
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[0].stratum = 'discriminating'))),
      /labelled discriminating/
    )
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[1].stratum = 'agreement'))),
      /labelled agreement/
    )
  })

  test('a duplicated trial id', () => {
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[1].trial_id = 't1'))),
      /Duplicate trial_id/
    )
  })

  test('a view carrying a foreign layer', () => {
    assert.throws(
      () => validateTrialBank(mangle((b) => (b.trials[0].reference.fov_mode = 'perceptual_360'))),
      /carries a perceptual_360 view/
    )
  })
})

describe('participant block', () => {
  test('is the declared length, with equal strata and no repeats', () => {
    const block = assembleMatchedViewBlock(BANK, 'participant-one')
    assert.equal(block.length, BLOCK_LENGTH)
    assert.equal(new Set(block.map((b) => b.trial.trial_id)).size, BLOCK_LENGTH)
    for (const s of STRATA) {
      assert.equal(block.filter((b) => b.trial.stratum === s).length, TRIALS_PER_STRATUM)
    }
  })

  test('is reproducible from the participant id and differs between participants', () => {
    const a = assembleMatchedViewBlock(BANK, 'same')
    const b = assembleMatchedViewBlock(BANK, 'same')
    const c = assembleMatchedViewBlock(BANK, 'other')
    assert.deepEqual(
      a.map((x) => [x.trial.trial_id, x.leftSide]),
      b.map((x) => [x.trial.trial_id, x.leftSide])
    )
    assert.notDeepEqual(a.map((x) => x.trial.trial_id), c.map((x) => x.trial.trial_id))
  })

  test('assigns both screen sides across a cohort', () => {
    // A generator stuck on one side would put every bank-side 'a' on the left
    // for everyone, turning the bank's own ordering into a position confound.
    const sides = new Set()
    for (let i = 0; i < 30; i++) {
      for (const entry of assembleMatchedViewBlock(BANK, `cohort-${i}`)) sides.add(entry.leftSide)
    }
    assert.deepEqual([...sides].sort(), ['a', 'b'])
  })

  test('never asks for more trials than a stratum holds', () => {
    const tiny = { ...TOY_BANK }
    const block = assembleMatchedViewBlock(tiny, 'p', 10)
    // One trial per stratum exists, so a block is two — not ten, and not a
    // repeat of the same trial to pad it out.
    assert.equal(block.length, 2)
    assert.equal(new Set(block.map((b) => b.trial.trial_id)).size, 2)
  })

  test('every predictor named by the instrument is present on every bank trial', () => {
    for (const t of BANK.trials) {
      for (const p of PREDICTORS) assert.ok(t.predictions[p], `${t.trial_id} lacks ${p}`)
    }
  })
})
