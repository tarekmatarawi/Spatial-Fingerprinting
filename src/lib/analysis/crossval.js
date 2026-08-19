// P5 — leave-one-plaza-out cross-validation, the permutation null, and the
// area-only baseline that H2 is stated against.
//
// A fold holds out every triplet naming one site, fits on the remainder, and
// predicts the held-out ones. This is deliberately harsher than leaving out
// random responses: the model must place a plaza it never saw during fitting.
//
// Note on the design: a triplet names three sites, so it is held out in three
// of the eighteen folds. Accuracy is therefore reported as the MEAN OF THE
// EIGHTEEN FOLD ACCURACIES, as specified — a macro-average over plazas, not a
// pooled count over triplets, which would weight each triplet three times.

import { mulberry32 } from '../triplets.js'
import { accuracy } from './model.js'
import { fitWeights, maskTriplets, AREA_INDEX } from './fit.js'

export const CHANCE = 1 / 3
export const DEFAULT_PERMUTATIONS = 1000
export const DEFAULT_SEED = 20260817

// The fold-fitting procedure, defined once and used for BOTH the observed
// accuracy and every permutation replicate.
//
// Two rules are encoded here, and both matter:
//
//  1. NO WARM START FROM THE FULL-DATA FIT. Seeding a fold from weights that
//     were fitted using the held-out triplets leaks the answer into the
//     prediction — cross-validation measuring itself. Each fold starts neutral
//     and finds its own optimum from the training half alone.
//  2. IDENTICAL SETTINGS EITHER SIDE. A permutation test is exact only when the
//     statistic is computed the same way on real and shuffled labels. Fitting
//     the observed folds harder than the null's would bias the null downward and
//     make every p-value look better than it is.
//
// One neutral start rather than five: the fold optimum sits close to the neutral
// point on this likelihood surface, and the setting has to be affordable 18,000
// times over. The headline full-data fit still uses the full multi-start search.
export const FOLD_FIT = { restarts: 1, iterations: 5000 }

// Splits triplets into the fold for each site: held out if the site is named.
function foldsBySite(triplets, siteIds) {
  return siteIds.map((site) => {
    const test = []
    const train = []
    for (const t of triplets) (t.sites.includes(site) ? test : train).push(t)
    return { site, test, train }
  })
}

// Leave-one-plaza-out over all 18 sites.
//
// `options` deliberately defaults to FOLD_FIT and callers should not override it
// with a warm start — see the note on FOLD_FIT above.
export function leaveOnePlazaOut(triplets, siteIds, options = {}) {
  const opts = { ...FOLD_FIT, ...options }
  const folds = foldsBySite(triplets, siteIds)
  const perFold = []

  for (const fold of folds) {
    if (!fold.test.length || !fold.train.length) {
      perFold.push({ site: fold.site, n: fold.test.length, accuracy: null, skipped: true })
      continue
    }
    const fit = fitWeights(fold.train, opts)
    perFold.push({
      site: fold.site,
      n: fold.test.length,
      nTrain: fold.train.length,
      accuracy: fit.weights ? accuracy(fold.test, fit.weights) : null,
      weights: fit.weightsNormalised,
    })
  }

  const scored = perFold.filter((f) => f.accuracy != null)
  const mean = scored.length ? scored.reduce((s, f) => s + f.accuracy, 0) / scored.length : null

  return { perFold, meanAccuracy: mean, folds: scored.length, chance: CHANCE }
}

// The same procedure restricted to isovist area.
//
// H2 states that the four-metric framework predicts perceptual similarity more
// accurately than isovist area alone. The comparator therefore differs from the
// full model in exactly one respect — which metrics it may use — and is fitted
// and cross-validated by the identical procedure on the identical responses.
export function areaOnlyBaseline(triplets, siteIds, options = {}) {
  return leaveOnePlazaOut(maskTriplets(triplets, [AREA_INDEX]), siteIds, options)
}

// Paired comparison of the full model against the area-only baseline, fold by
// fold. Pairing matters: the 18 folds differ a lot in difficulty, and comparing
// unpaired means would drown the effect in that variance.
export function pairedFoldComparison(full, baseline) {
  const diffs = []
  for (let i = 0; i < full.perFold.length; i++) {
    const a = full.perFold[i]
    const b = baseline.perFold[i]
    if (a.accuracy == null || b.accuracy == null) continue
    diffs.push({ site: a.site, full: a.accuracy, baseline: b.accuracy, delta: a.accuracy - b.accuracy })
  }

  const wins = diffs.filter((d) => d.delta > 0).length
  const losses = diffs.filter((d) => d.delta < 0).length
  const ties = diffs.filter((d) => d.delta === 0).length

  return {
    perFold: diffs,
    wins,
    losses,
    ties,
    meanDelta: diffs.length ? diffs.reduce((s, d) => s + d.delta, 0) / diffs.length : null,
    // Two-sided exact sign test over the folds where the two models differ.
    signTestP: signTestTwoSided(wins, wins + losses),
  }
}

// Exact two-sided binomial sign test at p = 0.5.
export function signTestTwoSided(successes, trials) {
  if (!trials) return null
  const pmf = (k) => Math.exp(logChoose(trials, k) - trials * Math.LN2)
  const observed = pmf(successes)
  let p = 0
  // Sum the probability of every outcome no more likely than the observed one —
  // the standard two-sided construction, valid for the asymmetric tails a small
  // number of folds can produce.
  for (let k = 0; k <= trials; k++) {
    const q = pmf(k)
    if (q <= observed * (1 + 1e-12)) p += q
  }
  return Math.min(1, p)
}

function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

const logFactorialCache = [0, 0]
function logFactorial(n) {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i)
  }
  return logFactorialCache[n]
}

// Permutation null for H1.
//
// Each permutation shuffles WHICH PAIR was chosen across triplets, preserving
// the empirical distribution of chosen-pair positions while destroying any link
// between geometry and judgement. The whole leave-one-plaza-out procedure is
// then re-run on the shuffled labels. Comparing the real accuracy against this
// distribution asks the right question: could a model this good have arisen
// from geometry that carries no perceptual information at all?
//
// p = (1 + #{permuted ≥ observed}) / (1 + permutations) — the add-one form, so
// p is never reported as exactly zero.
// One permuted replicate: reshuffle the chosen-pair labels and re-run the
// identical leave-one-plaza-out procedure. Each replicate is seeded by its own
// index so the whole null is reproducible however the work is distributed —
// sequentially here, or across worker threads in scripts/analyze.mjs.
export function permutationReplicate(triplets, siteIds, index, seed = DEFAULT_SEED) {
  const rng = mulberry32(seed + index * 7919)
  const shuffled = triplets.map((t) => t.chosen)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const permuted = triplets.map((t, i) => ({ ...t, chosen: shuffled[i] }))
  return leaveOnePlazaOut(permuted, siteIds).meanAccuracy
}

// Turns a collected null distribution into the reported test.
export function summarisePermutation(nullAccuracies, observedAccuracy, meta = {}) {
  const clean = nullAccuracies.filter((a) => a != null)
  const sorted = clean.slice().sort((a, b) => a - b)
  const atLeastAsExtreme = clean.filter((a) => a >= observedAccuracy).length

  return {
    permutations: meta.permutations ?? clean.length,
    seed: meta.seed ?? DEFAULT_SEED,
    // Add-one form, so p is never reported as exactly zero — with a finite
    // number of shuffles the honest claim is "below 1/(n+1)", not "zero".
    p: (1 + atLeastAsExtreme) / (1 + clean.length),
    nullMean: clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : null,
    nullMin: sorted[0] ?? null,
    nullMax: sorted[sorted.length - 1] ?? null,
    null95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null,
    nullAccuracies: clean,
  }
}

// Sequential permutation test. Correct but slow on the full study — the runner
// spreads `permutationReplicate` across worker threads instead. Kept as the
// reference implementation and used by the self-test at small counts.
export function permutationTest(triplets, siteIds, observedAccuracy, options = {}) {
  const permutations = options.permutations ?? DEFAULT_PERMUTATIONS
  const seed = options.seed ?? DEFAULT_SEED
  const nullAccuracies = []
  for (let p = 0; p < permutations; p++) {
    nullAccuracies.push(permutationReplicate(triplets, siteIds, p, seed))
  }
  return summarisePermutation(nullAccuracies, observedAccuracy, { permutations, seed })
}
