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

// Index of the enclosure metric within METRICS — H3 is specifically about it.
export const ENCLOSURE_INDEX = 3

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
  const enclosureLead = []
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

    // H3(a): how often does enclosure carry the largest weight, and by how much?
    // Recorded per draw so the margin gets its own interval rather than just a
    // yes/no count.
    const others = w.filter((_, k) => k !== ENCLOSURE_INDEX)
    enclosureLead.push(w[ENCLOSURE_INDEX] - Math.max(...others))
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

  const leadSorted = enclosureLead.slice().sort((a, b) => a - b)

  return {
    resamples,
    seed,
    failures,
    perMetric,
    enclosureLargestShare: enclosureLead.length
      ? enclosureLead.filter((d) => d > 0).length / enclosureLead.length
      : null,
    enclosureLead: {
      mean: enclosureLead.reduce((s, v) => s + v, 0) / (enclosureLead.length || 1),
      lo: percentile(leadSorted, 0.025),
      hi: percentile(leadSorted, 0.975),
    },
  }
}

export { percentile }
