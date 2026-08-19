// P5 — maximum-likelihood fitting of the four perceptual weights.
//
// Weights are optimised in log-space (θₖ = log wₖ) so they stay strictly
// positive without a constrained optimiser, and Adam runs on the exact gradient
// from model.js. Several seeded restarts guard against a poor local optimum;
// the lowest NLL wins.

import { mulberry32 } from '../triplets.js'
import { N_METRICS, nllAndGradient, normaliseWeights, totalNLL } from './model.js'

export const DEFAULT_FIT = {
  restarts: 5,
  iterations: 5000,
  learningRate: 0.05,
  beta1: 0.9,
  beta2: 0.999,
  epsilon: 1e-8,
  seed: 20260817,

  // STOPPING RULE — stall in the objective, not smallness of the gradient.
  //
  // A gradient-norm test is wrong for this problem. On real data the optimum
  // sits at the BOUNDARY: metrics that carry no perceptual signal have their
  // weights driven to zero, which in log-space means θ → −∞, a place the
  // optimiser slides toward forever without ever arriving. A gradient threshold
  // is then never met, every fit runs to the iteration cap, and the cap — an
  // arbitrary number — silently becomes the thing that decides the answer.
  // Worse, it decides it *unequally*: a restricted model that has nothing to
  // slide toward converges properly while the full model is still mid-slide, so
  // comparing them measures iteration budget rather than predictive power.
  //
  // Stalling on the mean NLL is invariant to how many responses are in the fit
  // and terminates correctly at a boundary optimum, because what matters there
  // is that the likelihood has stopped improving — not that the parameters have
  // stopped moving.
  // 1e-8 per response converges on the real study in ~3600 iterations and lands
  // within 0.01 NLL of what 20,000 iterations reaches — the remaining movement
  // is the boundary slide, not information.
  relTolerance: 1e-8,
  patience: 25,
}

// One Adam run from a given starting point in log-space.
function adam(triplets, theta0, options) {
  const { iterations, learningRate, beta1, beta2, epsilon, relTolerance, patience } = options
  const theta = Float64Array.from(theta0)
  const w = new Float64Array(N_METRICS)
  const m = new Float64Array(N_METRICS)
  const v = new Float64Array(N_METRICS)
  const n = triplets.length

  let nll = Infinity
  let bestMean = Infinity
  let stalled = 0
  let iter = 0
  let converged = false

  for (iter = 1; iter <= iterations; iter++) {
    for (let k = 0; k < N_METRICS; k++) w[k] = Math.exp(theta[k])

    const step = nllAndGradient(triplets, w)
    nll = step.nll

    // Per-response mean, so the stopping rule means the same thing whether the
    // fit sees 1213 triplets or a single leave-one-plaza-out fold.
    const meanNLL = nll / n
    if (bestMean - meanNLL < relTolerance) {
      if (++stalled >= patience) {
        converged = true
        break
      }
    } else {
      stalled = 0
    }
    if (meanNLL < bestMean) bestMean = meanNLL

    // Chain rule through w = exp(θ): ∂NLL/∂θₖ = ∂NLL/∂wₖ · wₖ.
    for (let k = 0; k < N_METRICS; k++) {
      const g = step.grad[k] * w[k]

      m[k] = beta1 * m[k] + (1 - beta1) * g
      v[k] = beta2 * v[k] + (1 - beta2) * g * g
      const mHat = m[k] / (1 - Math.pow(beta1, iter))
      const vHat = v[k] / (1 - Math.pow(beta2, iter))
      theta[k] -= (learningRate * mHat) / (Math.sqrt(vHat) + epsilon)
      // exp(−25) ≈ 1.4e−11 is zero for every practical purpose, and clamping
      // stops a boundary optimum sliding into underflow or NaN.
      if (theta[k] > 25) theta[k] = 25
      if (theta[k] < -25) theta[k] = -25
    }
  }

  for (let k = 0; k < N_METRICS; k++) w[k] = Math.exp(theta[k])
  return { weights: Array.from(w), nll, iterations: iter, converged }
}

// Fits weights to a set of prepared triplets.
//
// `warmStart` skips the multi-start search and refines from a known solution —
// used by bootstrap and permutation, where thousands of fits sit very close to
// the full-data optimum and a fresh 5-restart search would be wasted work.
export function fitWeights(triplets, options = {}) {
  const opts = { ...DEFAULT_FIT, ...options }

  if (!triplets.length) {
    return { weights: null, weightsNormalised: null, nll: null, converged: false, reason: 'no triplets' }
  }

  const starts = []
  if (opts.warmStart) {
    starts.push(Float64Array.from(opts.warmStart, (w) => Math.log(Math.max(w, 1e-12))))
  } else {
    // First start is neutral (all weights 1); the rest are seeded random points
    // spread over roughly exp(-1.5)..exp(1.5), so a poor basin is unlikely to
    // capture every restart.
    starts.push(new Float64Array(N_METRICS))
    const rng = mulberry32(opts.seed)
    for (let r = 1; r < opts.restarts; r++) {
      const theta = new Float64Array(N_METRICS)
      for (let k = 0; k < N_METRICS; k++) theta[k] = (rng() - 0.5) * 3
      starts.push(theta)
    }
  }

  let best = null
  for (const theta0 of starts) {
    const run = adam(triplets, theta0, opts)
    if (!Number.isFinite(run.nll)) continue
    if (!best || run.nll < best.nll) best = run
  }

  if (!best) {
    return { weights: null, weightsNormalised: null, nll: null, converged: false, reason: 'no finite optimum' }
  }

  return {
    weights: best.weights,
    weightsNormalised: normaliseWeights(best.weights),
    nll: best.nll,
    iterations: best.iterations,
    converged: best.converged,
    restarts: starts.length,
    n: triplets.length,
  }
}

// The area-only baseline for H2: the same model with the other three metrics
// held at zero weight, so only isovist area can drive the prediction.
//
// H2 states that the four-metric framework predicts perceptual similarity more
// accurately than isovist area alone, so the comparator has to be exactly that —
// area, fitted on the same responses under the same procedure, differing from
// the full model in nothing but which metrics it may use.
export const AREA_INDEX = 0

export function fitAreaOnly(triplets, options = {}) {
  const masked = maskTriplets(triplets, [AREA_INDEX])
  const fit = fitWeights(masked, options)
  return { ...fit, activeMetrics: [AREA_INDEX] }
}

// Copies triplets with every metric outside `keep` zeroed, so a restricted model
// literally cannot see them. Zeroing the delta rather than the weight keeps the
// gradient for those metrics at zero too, so they can never drift off zero.
export function maskTriplets(triplets, keep) {
  const keepSet = new Set(keep)
  return triplets.map((t) => {
    const delta = Float64Array.from(t.delta)
    for (let p = 0; p < 3; p++) {
      for (let k = 0; k < N_METRICS; k++) {
        if (!keepSet.has(k)) delta[p * N_METRICS + k] = 0
      }
    }
    return { ...t, delta }
  })
}

export { totalNLL }
