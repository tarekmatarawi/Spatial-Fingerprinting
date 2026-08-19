// P5 — the choice model.
//
// A triplet shows three plazas; the participant marks the two that feel most
// similar. The model says that judgement follows the weighted distance between
// the plazas' normalised fingerprints:
//
//   d(x,y)² = Σₖ wₖ (xₖ − yₖ)²        weighted squared distance
//   P(pair) = exp(−d²) / Σ exp(−d²)   softmax over the triplet's three pairs
//   NLL     = −Σ log P(chosen)
//
// Smaller distance ⇒ higher probability of being picked as the similar pair.
//
// SOFTMAX TEMPERATURE is deliberately absent. It is not identifiable separately
// from overall weight scale — multiplying every wₖ by c is exactly equivalent to
// dividing T by c — so adding it would leave the model with a flat direction and
// no unique optimum. The fitted weight scale absorbs the sharpness; the reported
// weights are rescaled to sum to 1 only afterwards, for readability.

import { METRICS } from './fingerprints.js'

// The three unordered pairs of a triplet (a,b,c), as index pairs.
export const PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
]

export const N_METRICS = METRICS.length

// Turns one survey response into the only thing the fit needs: the squared
// per-metric differences for each of the three pairs, and which pair was chosen.
//
// Precomputing this is what makes the analysis tractable — the deltas never
// change during fitting, so every one of the ~millions of NLL evaluations across
// bootstrap and permutation reduces to a dot product.
export function prepareTriplet(response, fingerprints) {
  const trio = [response.site_a, response.site_b, response.site_c]
  const xs = trio.map((id) => {
    const f = fingerprints.get(id)
    if (!f) throw new Error(`No fingerprint for site "${id}"`)
    return f
  })

  const delta = new Float64Array(PAIRS.length * N_METRICS)
  for (let p = 0; p < PAIRS.length; p++) {
    const [i, j] = PAIRS[p]
    for (let k = 0; k < N_METRICS; k++) {
      const diff = xs[i][k] - xs[j][k]
      delta[p * N_METRICS + k] = diff * diff
    }
  }

  const chosen = chosenPairIndex(trio, response.chosen_pair)
  if (chosen < 0) {
    throw new Error(
      `Response ${response.triplet_id}: chosen_pair ${JSON.stringify(response.chosen_pair)} ` +
        `is not one of the triplet's pairs ${JSON.stringify(trio)}`
    )
  }

  return { delta, chosen, participant: response.participant_id, sites: trio }
}

// Which of the three pairs the participant picked, or -1 if the response is
// malformed (a pair naming a site not in the triplet, or a site twice).
export function chosenPairIndex(trio, chosenPair) {
  if (!Array.isArray(chosenPair) || chosenPair.length !== 2) return -1
  const [c1, c2] = chosenPair
  if (c1 === c2) return -1
  for (let p = 0; p < PAIRS.length; p++) {
    const [i, j] = PAIRS[p]
    const a = trio[i]
    const b = trio[j]
    if ((a === c1 && b === c2) || (a === c2 && b === c1)) return p
  }
  return -1
}

// Softmax choice probabilities for one prepared triplet, given weights.
// Shifted by the maximum score before exponentiating — the scores are negative
// squared distances and can run large when a weight is big, and exp() of those
// underflows to zero without the shift.
export function pairProbabilities(triplet, weights, out = new Float64Array(PAIRS.length)) {
  const { delta } = triplet
  let max = -Infinity
  for (let p = 0; p < PAIRS.length; p++) {
    let s = 0
    for (let k = 0; k < N_METRICS; k++) s -= weights[k] * delta[p * N_METRICS + k]
    out[p] = s
    if (s > max) max = s
  }
  let sum = 0
  for (let p = 0; p < PAIRS.length; p++) {
    out[p] = Math.exp(out[p] - max)
    sum += out[p]
  }
  for (let p = 0; p < PAIRS.length; p++) out[p] /= sum
  return out
}

// Total negative log-likelihood over a set of prepared triplets.
export function totalNLL(triplets, weights) {
  const probs = new Float64Array(PAIRS.length)
  let nll = 0
  for (const t of triplets) {
    pairProbabilities(t, weights, probs)
    // Floor guards log(0) when a weight drives one pair's probability to
    // underflow; 1e-300 keeps the value finite without perturbing real ones.
    nll -= Math.log(Math.max(probs[t.chosen], 1e-300))
  }
  return nll
}

// NLL together with its exact gradient with respect to the weights.
//
//   ∂NLL/∂wₖ = Σ_t [ δ_chosen,k − Σ_p P_p · δ_p,k ]
//
// Derived rather than differenced. The plan allowed central differences; the
// closed form is both exact and ~8× cheaper (one pass instead of 2·4 NLL
// evaluations), which is what brings 1000 bootstrap refits and an 18-fold
// permutation test into seconds rather than hours. `test/analysis.test.js`
// checks it against central differences so the derivation cannot rot.
export function nllAndGradient(triplets, weights) {
  const probs = new Float64Array(PAIRS.length)
  const grad = new Float64Array(N_METRICS)
  let nll = 0

  for (const t of triplets) {
    pairProbabilities(t, weights, probs)
    nll -= Math.log(Math.max(probs[t.chosen], 1e-300))

    const base = t.chosen * N_METRICS
    for (let k = 0; k < N_METRICS; k++) {
      let expected = 0
      for (let p = 0; p < PAIRS.length; p++) expected += probs[p] * t.delta[p * N_METRICS + k]
      grad[k] += t.delta[base + k] - expected
    }
  }

  return { nll, grad }
}

// The pair the model considers most likely for a triplet — its prediction.
export function predictPair(triplet, weights) {
  const probs = pairProbabilities(triplet, weights)
  let best = 0
  for (let p = 1; p < PAIRS.length; p++) if (probs[p] > probs[best]) best = p
  return best
}

// Share of triplets whose chosen pair the model predicts. Chance is 1/3.
export function accuracy(triplets, weights) {
  if (!triplets.length) return null
  let hits = 0
  for (const t of triplets) if (predictPair(t, weights) === t.chosen) hits++
  return hits / triplets.length
}

// Weights rescaled to sum to 1 — a REPORTING transform only.
//
// Overall scale is the model's sole sharpness parameter, so imposing this during
// fitting would pin sharpness at an arbitrary value and stop the NLL being
// minimised. Fit first, rescale second, always.
export function normaliseWeights(weights) {
  const sum = weights.reduce((s, w) => s + w, 0)
  return sum > 0 ? Array.from(weights, (w) => w / sum) : Array.from(weights, () => 1 / N_METRICS)
}
