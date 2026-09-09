// P8 — scoring the matched-view responses, and the statistics that read them.
//
// The phase asks whether the view pairs Chamfer matches are the ones people
// agree with, and whether that beats what the two cloud-level measures predict.
// Everything here operates on the frozen trial bank plus the collected sessions;
// nothing is refitted, and no weight is estimated. That matters: the predictions
// were fixed before a single participant saw them, so this is a genuine
// out-of-sample validation rather than a model being tuned to its own test.
//
// THREE THINGS ARE DELIBERATELY REPORTED SIDE BY SIDE, and confusing them is the
// commonest way a 2AFC study overstates itself:
//
//   1. POOLED accuracy with an exact binomial test against 50%. Treats every
//      trial as an independent observation. It is not — one participant answers
//      24 of them — so the interval is too narrow and the p-value too small.
//      Reported because it is the conventional headline, and labelled.
//   2. PARTICIPANT-LEVEL accuracy: each person contributes one proportion, and a
//      sign test asks whether people are above chance. Far less powerful, and
//      the honest test of "do people agree with this measure".
//   3. PAIRED adjudication between measures, by exact McNemar on the trials
//      where they predicted differently. Comparing two measures' separate
//      accuracies would ignore that they were scored on the SAME answers, which
//      is the whole reason the design can adjudicate them at all.
//
// The two strata are never pooled into one accuracy — see lib/matchedView.js.

import { PREDICTORS, SIDES, STRATA, scoredAs } from '../matchedView.js'

/* ------------------------------------------------------------- distributions */

// log n! via a lookup that grows as needed. Factorials of a few hundred
// overflow a double outright, so every binomial quantity below is computed in
// log space and exponentiated at the end.
const logFactorialCache = [0, 0]
function logFactorial(n) {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i)
  }
  return logFactorialCache[n]
}

export function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

export function binomialPmf(k, n, p = 0.5) {
  if (k < 0 || k > n) return 0
  if (p === 0) return k === 0 ? 1 : 0
  if (p === 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

// Exact two-sided binomial test, by the "sum of outcomes no more likely than the
// observed one" convention.
//
// Written in the general form rather than the 2 × min(tail) shortcut, even
// though every call here uses p = 0.5 where the two agree. The shortcut is only
// correct for a symmetric null, and a future caller passing some other p would
// get a quietly wrong number from it rather than an error.
export function binomialTest(k, n, p = 0.5) {
  if (n <= 0) return { k, n, p_value: 1, accuracy: null }
  const observed = binomialPmf(k, n, p)
  // A relative tolerance, because two mathematically equal probabilities on
  // opposite tails differ in the last bits after logs and exponentials, and an
  // exact `<=` would drop one of them and halve the p-value.
  const tol = observed * 1e-9
  let total = 0
  for (let i = 0; i <= n; i++) {
    const prob = binomialPmf(i, n, p)
    if (prob <= observed + tol) total += prob
  }
  return { k, n, p_value: Math.min(1, total), accuracy: k / n }
}

// Wilson score interval for a proportion.
//
// Not the textbook normal approximation p ± z√(p(1−p)/n), which misbehaves
// exactly where this study might land: near 0 or 1 it produces bounds outside
// [0, 1], and at small n it is too narrow. Wilson stays inside the unit
// interval and is well behaved at every count including 0 and n.
export function wilsonInterval(k, n, z = 1.959963984540054) {
  if (n <= 0) return { low: null, high: null }
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}

// Exact McNemar test on a paired 2×2 table.
//
// `b` and `c` are the DISCORDANT counts — trials one measure got right and the
// other got wrong, and the reverse. Concordant trials (both right, both wrong)
// carry no information about which measure is better and are correctly ignored
// by the test rather than being thrown away by an oversight.
//
// The exact binomial form is used rather than the chi-square approximation
// because the discordant count here can easily be small, and chi-square is
// unreliable below about 25 discordant pairs.
export function mcnemarExact(b, c) {
  const n = b + c
  if (n === 0) return { b, c, n, p_value: 1, odds: null }
  const test = binomialTest(Math.min(b, c), n, 0.5)
  return {
    b,
    c,
    n,
    // Doubling the one-sided tail is exact here because the null is p = 0.5 and
    // the distribution is symmetric; capped, since at b === c it would exceed 1.
    p_value: Math.min(1, 2 * oneSidedLower(Math.min(b, c), n)),
    exact_two_sided: test.p_value,
    odds: c === 0 ? null : b / c,
  }
}

function oneSidedLower(k, n, p = 0.5) {
  let total = 0
  for (let i = 0; i <= k; i++) total += binomialPmf(i, n, p)
  return Math.min(1, total)
}

/* ------------------------------------------------------------------ scoring */

// Flattens the stored sessions into one row per answered trial, joined to the
// bank.
//
// A response naming a trial the bank does not contain is NOT silently dropped:
// it means the bank was rebuilt after that answer was collected, so the
// prediction the participant was tested against no longer exists. Those rows are
// counted and surfaced, because quietly discarding them would shrink the sample
// for a reason a reader would never see.
//
// A response whose recorded predictions disagree with the bank's is the same
// problem in a subtler form — the trial id still resolves, but it no longer
// means what it meant. Those are separated too, and scored against nothing.
export function joinResponses(records, bank) {
  const byId = new Map((bank?.trials ?? []).map((t) => [t.trial_id, t]))
  const rows = []
  const orphaned = []
  const stale = []

  for (const record of records ?? []) {
    for (const answer of record?.responses ?? []) {
      const trial = byId.get(answer.trial_id)
      if (!trial) {
        orphaned.push({ participant_id: record.participant_id, trial_id: answer.trial_id })
        continue
      }
      if (!SIDES.includes(answer.chosen_side)) continue
      // The answer carries the predictions that were live when it was given.
      // Comparing them to the bank's is what makes a rebuilt bank visible
      // instead of silently rescoring old answers against new predictions.
      const recorded = answer.predictions
      const drifted =
        recorded && PREDICTORS.some((p) => recorded[p] && recorded[p] !== trial.predictions[p])
      if (drifted) {
        stale.push({ participant_id: record.participant_id, trial_id: answer.trial_id })
        continue
      }
      rows.push({
        participant_id: record.participant_id,
        trial_id: answer.trial_id,
        stratum: trial.stratum,
        chosen_side: answer.chosen_side,
        left_side: answer.left_side ?? null,
        chose_left: answer.left_side ? answer.chosen_side === answer.left_side : null,
        duration_ms: answer.duration_ms ?? null,
        strength: trial.strength,
        margins: trial.margins,
        trial,
      })
    }
  }

  return { rows, orphaned, stale }
}

// Accuracy of one predictor over a set of joined rows, with both the pooled
// binomial and the participant-level sign test.
export function scorePredictor(rows, predictor) {
  let k = 0
  let n = 0
  const byParticipant = new Map()

  for (const row of rows) {
    const correct = scoredAs(row.trial, row.chosen_side, predictor)
    if (correct === null) continue
    n++
    if (correct) k++
    if (!byParticipant.has(row.participant_id)) {
      byParticipant.set(row.participant_id, { k: 0, n: 0 })
    }
    const p = byParticipant.get(row.participant_id)
    p.n++
    if (correct) p.k++
  }

  const participants = [...byParticipant.entries()].map(([id, v]) => ({
    participant_id: id,
    ...v,
    accuracy: v.n > 0 ? v.k / v.n : null,
  }))

  return {
    predictor,
    k,
    n,
    accuracy: n > 0 ? k / n : null,
    // Labelled as the anticonservative one at every point it is displayed.
    pooled: { ...binomialTest(k, n, 0.5), ci: wilsonInterval(k, n) },
    participants,
    participant_level: signTest(participants),
  }
}

// Sign test over participants: how many scored above chance, how many below.
//
// Participants exactly at 50% are dropped rather than split between the sides.
// Splitting them would invent evidence; assigning them all one way would bias
// the result in that direction. Dropping is the standard treatment and the
// count is reported so the loss is visible.
export function signTest(participants, chance = 0.5) {
  let above = 0
  let below = 0
  let tied = 0
  for (const p of participants) {
    if (p.accuracy == null) continue
    if (p.accuracy > chance) above++
    else if (p.accuracy < chance) below++
    else tied++
  }
  const n = above + below
  const accuracies = participants.map((p) => p.accuracy).filter((a) => a != null)
  return {
    above,
    below,
    tied,
    n_participants: accuracies.length,
    // The mean of the per-participant accuracies, which weights every person
    // equally regardless of how many trials they finished — unlike the pooled
    // figure, where someone who answered all 24 counts three times as much as
    // someone who stopped at 8.
    mean_accuracy: accuracies.length
      ? accuracies.reduce((s, v) => s + v, 0) / accuracies.length
      : null,
    ...binomialTest(above, n, 0.5),
  }
}

// The paired comparison between two predictors on the same answers.
//
// Only trials where the two made DIFFERENT predictions can distinguish them; on
// the rest they are right or wrong together by construction. The discordant
// count is therefore the real sample size of this comparison, and it is reported
// beside the p-value so a significant-looking result on eleven trials cannot be
// mistaken for a strong one.
export function adjudicate(rows, predictorA, predictorB) {
  let aOnly = 0
  let bOnly = 0
  let both = 0
  let neither = 0

  for (const row of rows) {
    const a = scoredAs(row.trial, row.chosen_side, predictorA)
    const b = scoredAs(row.trial, row.chosen_side, predictorB)
    if (a === null || b === null) continue
    if (a && b) both++
    else if (a && !b) aOnly++
    else if (!a && b) bOnly++
    else neither++
  }

  return {
    a: predictorA,
    b: predictorB,
    a_only: aOnly,
    b_only: bOnly,
    both,
    neither,
    discordant: aOnly + bOnly,
    ...mcnemarExact(aOnly, bOnly),
  }
}

/* ------------------------------------------- the substitute for a check trial */

// Accuracy against how decisive the prediction was.
//
// This study runs no attention check (see HAS_ATTENTION_CHECK), which leaves a
// bare accuracy with no ceiling to be read against: 65% means something very
// different if attentive people score 95% than if they score 70%. This recovers
// the missing information from the real trials instead of buying it with extra
// ones.
//
// If participants were judging the space, accuracy should RISE with margin —
// a prediction the measures make confidently should be easier to agree with
// than a near-tie. A flat line across margins is the signature of clicking
// through, and it is visible here without anyone having been asked a throwaway
// question. This is a diagnostic on the instrument, not a hypothesis test.
export function accuracyByMargin(rows, predictor, bins = 4) {
  const scored = rows
    .map((row) => ({ strength: row.strength, correct: scoredAs(row.trial, row.chosen_side, predictor) }))
    .filter((r) => r.correct !== null && Number.isFinite(r.strength))
    .sort((p, q) => p.strength - q.strength)

  if (!scored.length) return []

  // Equal-count bins rather than equal-width: the margin distribution is skewed,
  // and equal-width bins would put most of the sample in one bucket and leave
  // the others with counts too small to read.
  const out = []
  for (let i = 0; i < bins; i++) {
    const from = Math.floor((i * scored.length) / bins)
    const to = Math.floor(((i + 1) * scored.length) / bins)
    const slice = scored.slice(from, to)
    if (!slice.length) continue
    const k = slice.filter((r) => r.correct).length
    out.push({
      bin: i,
      n: slice.length,
      k,
      accuracy: k / slice.length,
      strength_min: slice[0].strength,
      strength_max: slice.at(-1).strength,
      strength_mid: (slice[0].strength + slice.at(-1).strength) / 2,
      ci: wilsonInterval(k, slice.length),
    })
  }
  return out
}

// Did participants favour one side of the screen?
//
// Candidate sides are randomised per participant per trial, so a real left-hand
// preference cannot bias any measure's accuracy — it would land on whichever
// candidate happened to be drawn there. This checks that the randomisation did
// its job rather than assuming it: a strong, significant side preference would
// mean people were answering by position instead of by content, which no
// accuracy figure on this page would otherwise reveal.
export function positionBias(rows) {
  const usable = rows.filter((r) => r.chose_left !== null)
  const k = usable.filter((r) => r.chose_left).length
  return {
    ...binomialTest(k, usable.length, 0.5),
    left_share: usable.length ? k / usable.length : null,
    ci: wilsonInterval(k, usable.length),
  }
}

/* ---------------------------------------------------------------- the report */

// Everything the researcher page and the self-test read, from records + bank.
export function analyseMatchedView(records, bank) {
  const { rows, orphaned, stale } = joinResponses(records, bank)

  const strata = {}
  for (const stratum of STRATA) {
    const subset = rows.filter((r) => r.stratum === stratum)
    strata[stratum] = {
      stratum,
      n_trials: subset.length,
      n_participants: new Set(subset.map((r) => r.participant_id)).size,
      predictors: Object.fromEntries(
        PREDICTORS.map((p) => [p, scorePredictor(subset, p)])
      ),
      // Only the discriminating stratum can adjudicate: in the agreement
      // stratum the three measures made the same prediction on every trial, so
      // every comparison is concordant by construction and McNemar has nothing
      // to test. Computed anyway and expected to come back with zero discordant
      // pairs — a non-zero count there would mean the bank is mislabelled.
      adjudication: {
        chamfer_vs_centroid: adjudicate(subset, 'chamfer', 'centroid'),
        chamfer_vs_gaussian: adjudicate(subset, 'chamfer', 'gaussian'),
      },
      margin_curve: Object.fromEntries(
        PREDICTORS.map((p) => [p, accuracyByMargin(subset, p)])
      ),
      position_bias: positionBias(subset),
    }
  }

  return {
    bank_version: bank?.version ?? null,
    bank_generated_at: bank?.generated_at ?? null,
    n_records: (records ?? []).length,
    n_rows: rows.length,
    n_participants: new Set(rows.map((r) => r.participant_id)).size,
    orphaned,
    stale,
    strata,
    position_bias: positionBias(rows),
    // Per-trial agreement, for the researcher table: which specific pairs people
    // split on. Useful as a finding in its own right — a trial the measures call
    // decisively and participants split 50/50 on is a place worth visiting.
    per_trial: perTrial(rows),
  }
}

function perTrial(rows) {
  const byTrial = new Map()
  for (const row of rows) {
    if (!byTrial.has(row.trial_id)) {
      byTrial.set(row.trial_id, { trial: row.trial, n: 0, chamfer: 0, centroid: 0 })
    }
    const t = byTrial.get(row.trial_id)
    t.n++
    if (scoredAs(row.trial, row.chosen_side, 'chamfer')) t.chamfer++
    if (scoredAs(row.trial, row.chosen_side, 'centroid')) t.centroid++
  }
  return [...byTrial.entries()]
    .map(([trial_id, v]) => ({
      trial_id,
      stratum: v.trial.stratum,
      reference: v.trial.reference,
      candidates: v.trial.candidates,
      strength: v.trial.strength,
      n: v.n,
      chamfer_share: v.n ? v.chamfer / v.n : null,
      centroid_share: v.n ? v.centroid / v.n : null,
    }))
    .sort((p, q) => q.n - p.n)
}
