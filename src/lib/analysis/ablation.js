// P5 — leave-one-metric-out ablation.
//
// For each of the four metrics: drop it, refit from scratch on the remaining
// three, re-run the full leave-one-plaza-out procedure, and record how much
// accuracy falls. The size of that fall is the metric's earned contribution —
// a metric can carry a large fitted weight and still cost nothing to remove if
// another metric carries the same information.

import { METRICS, METRIC_LABELS } from './fingerprints.js'
import { N_METRICS } from './model.js'
import { maskTriplets } from './fit.js'
import { leaveOnePlazaOut } from './crossval.js'

export function leaveOneMetricOut(triplets, siteIds, fullAccuracy, options = {}) {
  const results = []

  for (let dropped = 0; dropped < N_METRICS; dropped++) {
    const keep = []
    for (let k = 0; k < N_METRICS; k++) if (k !== dropped) keep.push(k)

    const loo = leaveOnePlazaOut(maskTriplets(triplets, keep), siteIds, options)
    results.push({
      metric: METRICS[dropped],
      label: METRIC_LABELS[METRICS[dropped]],
      accuracyWithout: loo.meanAccuracy,
      drop: loo.meanAccuracy == null || fullAccuracy == null ? null : fullAccuracy - loo.meanAccuracy,
      perFold: loo.perFold,
    })
  }

  // Ranked by how much the model loses without each metric — largest cost first.
  const ranked = results
    .filter((r) => r.drop != null)
    .slice()
    .sort((a, b) => b.drop - a.drop)

  return {
    fullAccuracy,
    results,
    ranked: ranked.map((r, i) => ({ metric: r.metric, label: r.label, drop: r.drop, rank: i + 1 })),
  }
}
