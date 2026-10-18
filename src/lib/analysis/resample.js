// P5 — participant-level bootstrap confidence intervals.
//
// Resampling is over PARTICIPANTS, not responses. One person's 26 judgements
// are not 26 independent observations — they share a rater, their idea of
// "similar", and whatever mood they were in. Resampling responses would treat
// them as independent and produce intervals far too narrow.
//
// Every draw is seeded, so the reported CIs are reproducible exactly.

import { mulberry32 } from '../triplets.js'
import { N_METRICS, normaliseWeights } from './model.js'
import { fitWeights } from './fit.js'
import { participantIds } from './exclusions.js'

export const DEFAULT_RESAMPLES = 1000
export const DEFAULT_SEED = 20260817

// Groups triplets by participant once, so each draw is an array concat rather
// than a filter over the whole set.
function groupByParticipant(triplets) {
  const groups = new Map()
  for (const t of triplets) {
    const list = groups.get(t.participant)
    if (list) list.push(t)
    else groups.set(t.participant, [t])
  }
  return groups
}

// Percentile of a sorted array by linear interpolation.
function percentile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

// Bootstrap the weight vector.
//
// Each draw samples participants with replacement, refits from the full-data
// solution as a warm start, and stores the SUM-NORMALISED weights — the CI has
// to be on the quantity that gets reported, and raw scale varies between draws
// because it also absorbs choice sharpness.
export function bootstrapWeights(triplets, fullFit, options = {}) {
  const resamples = options.resamples ?? DEFAULT_RESAMPLES
  const seed = options.seed ?? DEFAULT_SEED

  const groups = groupByParticipant(triplets)
  const ids = participantIds(triplets)
  const rng = mulberry32(seed)

  const draws = Array.from({ length: N_METRICS }, () => [])
  let failures = 0

  for (let b = 0; b < resamples; b++) {
    const sample = []
    for (let i = 0; i < ids.length; i++) {
      const pick = ids[Math.floor(rng() * ids.length)]
      const list = groups.get(pick)
      for (const t of list) sample.push(t)
    }

    const fit = fitWeights(sample, { ...options, warmStart: fullFit.weights })
    if (!fit.weights) {
      failures++
      continue
    }

    const w = normaliseWeights(fit.weights)
    for (let k = 0; k < N_METRICS; k++) draws[k].push(w[k])
  }

  const perMetric = draws.map((series) => {
    const sorted = series.slice().sort((a, b) => a - b)
    const mean = series.reduce((s, v) => s + v, 0) / (series.length || 1)
    return {
      mean,
      median: percentile(sorted, 0.5),
      lo: percentile(sorted, 0.025),
      hi: percentile(sorted, 0.975),
      n: series.length,
    }
  })

  return {
    resamples,
    seed,
    failures,
    perMetric,
  }
}

export { percentile }
