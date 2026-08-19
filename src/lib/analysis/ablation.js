// P5 — leave-one-metric-out ablation.
//
// For each of the four metrics: drop it, refit from scratch on the remaining
// three, re-run the full leave-one-plaza-out procedure, and record how much
// accuracy falls. The size of that fall is the metric's earned contribution —
// a metric can carry a large fitted weight and still cost nothing to remove if
// another metric carries the same information.
//
// This is the second, independent line of evidence for H3. A weight can be
// large because enclosure genuinely drives similarity judgements, or because
// of collinearity with something else; an accuracy drop under ablation cannot
// be explained that way. H3 is supported only if both lines agree, and a
// disagreement is itself a finding worth reporting.

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

// H3, assembled from its two independent tests.
//
// (a) bootstrap — how often enclosure carries the largest weight, and the
//     interval on its margin over the next largest.
// (b) ablation — where enclosure's accuracy cost ranks among the four.
//
// Supported only when both agree. The disagreement branch is not a failure of
// the analysis; it is the interesting case, and it is reported as such.
export function assessH3(bootstrap, ablation, enclosureIndex = 3) {
  const enclosure = METRICS[enclosureIndex]
  const share = bootstrap.enclosureLargestShare
  const lead = bootstrap.enclosureLead
  const rankEntry = ablation.ranked.find((r) => r.metric === enclosure)

  // (a) holds when enclosure leads in most draws AND the margin's interval
  //     excludes zero — a majority alone can sit on a knife edge.
  const weightEvidence = share != null && share > 0.5 && lead.lo > 0
  // (b) holds when removing enclosure costs more accuracy than removing any
  //     other metric.
  const ablationEvidence = rankEntry != null && rankEntry.rank === 1

  let verdict
  if (weightEvidence && ablationEvidence) verdict = 'supported'
  else if (!weightEvidence && !ablationEvidence) verdict = 'not_supported'
  else verdict = 'disagreement'

  return {
    verdict,
    weightEvidence: {
      passes: weightEvidence,
      largestShare: share,
      leadMean: lead.mean,
      leadLo: lead.lo,
      leadHi: lead.hi,
    },
    ablationEvidence: {
      passes: ablationEvidence,
      rank: rankEntry?.rank ?? null,
      drop: rankEntry?.drop ?? null,
      ranking: ablation.ranked,
    },
  }
}
