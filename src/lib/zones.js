// The zone typology, as a vocabulary shared by every phase that speaks it.
//
// P6 builds the typology (scripts/compute-zones.mjs) and draws it; P9 diagnoses
// against it. Before this module existed the colours and the descriptive names
// lived privately inside FieldPage.jsx, which is exactly the arrangement that
// has already gone wrong twice on this project — the figure type scale, and the
// map drawing scale, both re-picked per page until they visibly disagreed. A
// zone is a claim about places; it has to look and read the same wherever it
// appears, or the platform contradicts itself in front of a reader.
//
// LAYER: field_360 throughout. The centres in zones.json are in P5's frozen
// perceptual_360 coordinates (the deliberate exception recorded in
// docs/spec.md), and everything here works in that space. Nothing in this file
// may ever touch a 120° reading.

import { METRICS, METRIC_LABELS } from './analysis/fingerprints.js'

// Zone colours are GLOBAL — zone 2 is the same colour at every plaza and in
// every phase, because the typology is one clustering over all 18 sites.
// Ordered from the largest, most open type through to the tightest, so the ramp
// reads as a sequence rather than as arbitrary categories.
//
// Hex rather than CSS custom properties, for the reason tokens.js gives: a
// figure is exported by serialising the live SVG, and a var() reference means
// nothing once the file is open in Illustrator.
export const ZONE_COLOURS = ['#1D4ED8', '#0E7490', '#7C3AED', '#B45309', '#BE123C']

export function zoneColour(index) {
  return ZONE_COLOURS[index % ZONE_COLOURS.length]
}

// Descriptive labels derived from each centre's own coordinates, not part of
// the clustering — they exist so a legend reads as architecture rather than as
// cluster indices, and they are computed rather than typed so they cannot drift
// out of step with a re-run of `npm run zones`.
export function describeZone(centre) {
  const [area, compact, occl, enclosure] = centre
  const size = area > 0.8 ? 'Vast' : area > 0.4 ? 'Open' : 'Tight'
  let character
  if (enclosure > 0.8) character = 'strongly enclosed'
  else if (occl > 0.7) character = 'facade-rich'
  else if (compact > 0.9) character = 'regular'
  else if (compact < 0.35) character = 'irregular'
  else character = 'moderate'
  return `${size}, ${character}`
}

export function zoneNames(centres) {
  return centres.map(describeZone)
}

/* --------------------------------------------------------- weighted distance */

// The one distance function the typology is defined by. Squared, weighted,
// no square root — every comparison below is between distances, and the root
// is a monotone transform that only costs precision.
//
// This is character-for-character the `weightedDist2` in compute-zones.mjs. It
// is duplicated there rather than imported because that script must stay
// runnable on its own; if either ever changes, the reproduction test in
// test/zones.test.js fails loudly, which is the point.
export function weightedDist2(a, b, weights) {
  let s = 0
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k]
    s += weights[k] * d * d
  }
  return s
}

// Which zone a normalised 4-vector belongs to: the nearest frozen centre.
//
// NEAREST FROZEN CENTRE, NOT A RE-CLUSTERING. When P9's sandbox changes the
// geometry, the points move and the typology does not. Re-running k-means with
// an intervention in the pool would let the intervention redefine the very
// categories it is being judged against — the goalposts moving with the ball.
// The typology is P6's finding and P9 is measured against it.
//
// That this reproduces P6 exactly is not an assumption: assigning all 11,719
// stored field points this way returns P6's stored zone for every one of them,
// despite the centres being rounded to 5 decimal places on the way to disk.
// test/zones.test.js asserts it against the real data.
export function assignZone(point, centres, weights) {
  let best = 0
  let bestD = Infinity
  for (let c = 0; c < centres.length; c++) {
    const d = weightedDist2(point, centres[c], weights)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/* ------------------------------------------------------------- the diagnosis */

// How far one point sits from a zone's centre, and WHICH METRICS put it there.
//
// The total is the weighted squared distance the typology itself is built on,
// and it decomposes exactly: d² = Σ wₖ(xₖ − cₖ)², one term per metric. Each
// term's share of the total is the share of the discrepancy that metric is
// responsible for — which is the whole reason the diagnosis can name a cause
// instead of only reporting a number.
//
// `gap` is SIGNED and is the plain normalised difference, not the weighted
// squared term: a designer needs to know that enclosure is 0.30 BELOW the
// target, and the squared term has thrown the direction away. Both are
// reported because they answer different questions — share says which metric
// to attend to, gap says which way to move it.
export function decompose(point, centre, weights) {
  const terms = METRICS.map((metric, k) => {
    const gap = point[k] - centre[k]
    return {
      metric,
      label: METRIC_LABELS[metric],
      weight: weights[k],
      value: point[k],
      target: centre[k],
      gap,
      contribution: weights[k] * gap * gap,
    }
  })
  const total = terms.reduce((s, t) => s + t.contribution, 0)
  for (const t of terms) t.share = total > 0 ? t.contribution / total : 0
  return {
    total,
    distance: Math.sqrt(total),
    terms,
    // Ranked by contribution — "the driving metrics", in order.
    driving: [...terms].sort((a, b) => b.contribution - a.contribution),
  }
}

// The same diagnosis over a selected AREA rather than a single point.
//
// Per point, then averaged — never the distance of the mean point. Those are
// different numbers and the difference is not academic: a selection split
// between two very different corners has a mean that resembles neither, and its
// distance-of-mean can be small while every actual point in it is far from the
// target. Averaging per-point contributions keeps the answer a statement about
// the places selected. The spread is reported alongside for the same reason.
export function diagnoseRegion(points, targetZone, centres, weights) {
  const centre = centres[targetZone]
  const each = points.map((p) => decompose(p, centre, weights))

  const terms = METRICS.map((metric, k) => {
    const contribution = mean(each.map((d) => d.terms[k].contribution))
    return {
      metric,
      label: METRIC_LABELS[metric],
      weight: weights[k],
      value: mean(each.map((d) => d.terms[k].value)),
      target: centre[k],
      gap: mean(each.map((d) => d.terms[k].gap)),
      contribution,
    }
  })
  const total = terms.reduce((s, t) => s + t.contribution, 0)
  for (const t of terms) t.share = total > 0 ? t.contribution / total : 0

  // How much of the selection is ALREADY the intended type. A region that is
  // 90% on target with one stubborn corner is a different design problem from
  // one that is uniformly 0.3 away, and a mean distance alone cannot tell them
  // apart.
  const assigned = points.map((p) => assignZone(p, centres, weights))
  const onTarget = assigned.filter((z) => z === targetZone).length

  return {
    targetZone,
    n: points.length,
    total,
    distance: Math.sqrt(total),
    // The spread of per-point distances, so a mean is never read as uniform.
    distanceSpread: spread(each.map((d) => d.distance)),
    terms,
    driving: [...terms].sort((a, b) => b.contribution - a.contribution),
    onTarget,
    onTargetShare: points.length ? onTarget / points.length : 0,
    assigned,
    composition: tally(assigned, centres.length),
  }
}

/* ------------------------------------------------- Tier A: single-metric flip */

// The smallest change in ONE metric, holding the other three fixed, that would
// move a point into the target zone — the sensitivity number Tier A is for.
//
// Exact rather than searched. Target zone t beats rival r when
// d²(x,c_t) ≤ d²(x,c_r); substituting x = point + δ·eₖ, the squared terms in
// metric k cancel and what remains is LINEAR in δ:
//
//   D(δ) = A + wₖ[2(xₖ+δ)(bᵣ−aₜ) + aₜ² − bᵣ²] ≤ 0
//
// where A is the fixed contribution of the other three metrics. Each rival
// therefore contributes a half-line of feasible δ; the answer is the smallest
// |δ| in their intersection. A stepped search over slider positions would give
// a number that depends on the step size, which is not a property of the space.
//
// Returns null where no amount of that metric alone can do it — which is a real
// and common answer, not a failure, and must be shown as such. Sliding one axis
// cannot reach a centre that differs on the other three.
export function flipDistance(point, targetZone, centres, weights, k) {
  const t = centres[targetZone]
  const a = t[k]

  // Feasible interval for δ, narrowed by each rival zone in turn.
  let lo = -Infinity
  let hi = Infinity

  for (let r = 0; r < centres.length; r++) {
    if (r === targetZone) continue
    const rc = centres[r]
    const b = rc[k]

    // Contribution of every metric except k, target minus rival.
    let A = 0
    for (let j = 0; j < point.length; j++) {
      if (j === k) continue
      A += weights[j] * ((point[j] - t[j]) ** 2 - (point[j] - rc[j]) ** 2)
    }

    // D(δ) = slope·δ + intercept
    const slope = weights[k] * 2 * (b - a)
    const intercept = A + weights[k] * (2 * point[k] * (b - a) + a * a - b * b)

    if (Math.abs(slope) < 1e-12) {
      // This rival's comparison does not depend on metric k at all: either the
      // condition already holds everywhere, or it can never hold.
      if (intercept > 0) return null
      continue
    }
    // slope·δ ≤ −intercept
    const bound = -intercept / slope
    if (slope > 0) hi = Math.min(hi, bound)
    else lo = Math.max(lo, bound)
  }

  if (lo > hi) return null
  if (lo <= 0 && hi >= 0) return 0 // already in the target zone
  return lo > 0 ? lo : hi
}

// Every metric's flip distance at once, each judged against what the corpus
// actually does — "the cheapest single axis", in the sensitivity sense only.
//
// THE ALGEBRA ALONE IS NOT ENOUGH, and the reason is worth stating because it
// nearly shipped. flipDistance answers a question about an infinite space: it
// will report, correctly, that a tight irregular point becomes the vast regular
// type once occlusivity falls by 19.4 normalised units. That is true, and as
// design guidance it is nonsense — no measured position in any of the eighteen
// plazas sits below −0.33, so the instruction describes nowhere.
//
// The `envelope` is the range each metric is actually observed to take across
// all 11,719 field points (fields/index.json `observed_envelope`). A flip that
// lands outside it is reported as out of reach WITH its number, not silently
// dropped: "this would need an occlusivity lower than anywhere in the corpus"
// is a finding about the target, and hiding it would leave a blank where an
// answer belongs.
//
// Without an envelope every reachable flip is reported unqualified, which is
// the right behaviour for a caller that has deliberately not supplied one.
export function flipDistances(point, targetZone, centres, weights, envelope = null) {
  return METRICS.map((metric, k) => {
    const delta = flipDistance(point, targetZone, centres, weights, k)
    if (delta === null) {
      return {
        metric,
        label: METRIC_LABELS[metric],
        delta: null,
        resulting: null,
        reachable: false,
        reason: 'no-solution',
      }
    }

    const resulting = point[k] + delta
    const bound = envelope?.[metric]
    const outside = bound && (resulting < bound.min || resulting > bound.max)
    return {
      metric,
      label: METRIC_LABELS[metric],
      delta,
      resulting,
      reachable: !outside,
      reason: outside ? 'outside-corpus' : null,
      envelope: bound ?? null,
    }
  })
}

/* -------------------------------------------------------------------- helpers */

// Normalised value back to the metric's real units, for readouts. The inverse
// of normaliseValue() in analysis/fingerprints.js.
export function denormalise(value, bound) {
  return value * (bound.max - bound.min) + bound.min
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function spread(values) {
  if (!values.length) return { min: 0, max: 0, sd: 0 }
  const m = mean(values)
  const variance =
    values.length > 1
      ? values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)
      : 0
  return { min: Math.min(...values), max: Math.max(...values), sd: Math.sqrt(variance) }
}

function tally(assigned, k) {
  const counts = new Array(k).fill(0)
  for (const z of assigned) counts[z]++
  return counts.map((n) => (assigned.length ? n / assigned.length : 0))
}
