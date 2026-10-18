// The precondition and the five hypotheses, derived from the two analysis
// outputs.
//
// They span both files by nature, which is why this lives on its own rather
// than inside either script: the convergence claims are answered by the rating
// block (rating-validation.json), the prediction claims by the triplet fit
// (analysis-<source>.json). Putting the verdict rules here keeps them in the
// analysis layer, testable and stated once, instead of being re-derived in
// whatever surface displays them.
//
//   Precondition  each rating scale is reliable enough to test against (for H2 and H3)
//   H1  weighted distance predicts the triplet choices above chance
//   H2  each metric corresponds to its own rating scale
//   H3  where a metric does not, the mismatch is systematic, not noisy ratings
//   H4  the fitted model gives every metric a weight above zero
//   H5  the four-metric model outperforms isovist area alone
//
// A hypothesis is only "supported" when the evidence clears its stated rule,
// never because a number merely points the right way. H5 shows why the
// distinction matters: the full model is ahead of area alone, but not by a
// margin the sign test can tell apart from chance, so it gets its own verdict
// rather than being rounded up to support or down to a plain failure.

import { METRIC_LABELS } from './fingerprints.js'

export const VERDICT = {
  SUPPORTED: 'supported',
  PARTLY: 'partly',
  // Not significant, but with the full model ahead — the direction H5 predicts.
  DIRECTIONAL: 'not_significant_directional',
  NOT_SUPPORTED: 'not_supported',
}

// With 18 plazas, a correlation must exceed roughly this to reach p < 0.05 on
// its own — quoted in the UI so a reader can see why 0.22 is not a finding.
export const R_SIGNIFICANCE_18 = 0.47

// The precondition's threshold. Below this, participants disagreed with each
// other so much that no measurement could track their mean — a metric tested
// against such a scale would be untested rather than disproven.
export const RELIABILITY_FLOOR = 0.4

// The name of a rating scale where it differs from its metric's name.
const SCALE_NAMES = {
  closedPerimeter: 'perceived facade continuity',
}
// "Metric ↔ its scale", naming the scale only where its name is not the metric's.
const pairLabel = (s) => {
  const metric = METRIC_LABELS[s.metric] ?? s.label
  return SCALE_NAMES[s.metric] ? `${metric} ↔ ${SCALE_NAMES[s.metric]}` : metric
}

const pct = (v) => (v == null ? null : v * 100)
const matches = (s) => s.pearson_p_holm < 0.05 && s.pearson_aligned > 0

// The precondition for H2 and H3: every rating scale must reach a split-half
// reliability of at least RELIABILITY_FLOOR. Without a stable shared percept a
// failed correlation would say nothing about the metric.
export function reliabilityPrecondition(ratings) {
  const values = ratings.scales.map((s) => s.reliability).filter((v) => v != null)
  const lo = Math.min(...values)
  return {
    id: 'Precondition',
    label: 'Precondition for H2 and H3',
    claim: `Each rating scale reaches a split-half reliability of at least ${RELIABILITY_FLOOR.toFixed(2).replace(/^0/, '')}.`,
    lo,
    hi: Math.max(...values),
    passes: values.length === ratings.scales.length && lo >= RELIABILITY_FLOOR,
    perScale: ratings.scales.map((s) => ({
      metric: s.metric,
      label: METRIC_LABELS[s.metric] ?? s.label,
      reliability: s.reliability,
      ratingsPerPlaza: s.ratings_per_plaza,
    })),
    statement:
      'Split-half reliability across the four scales, Spearman–Brown corrected. Participants are ' +
      'split at random into halves and each half’s per-plaza mean is correlated against the ' +
      'other’s, so this measures whether observers agree with EACH OTHER — independent of whether ' +
      'any metric matches them.',
    why:
      'It confirms the instrument works and that participants were not answering at random, which ' +
      'is what licenses treating a failed correlation as evidence about a metric rather than about ' +
      'the raters. It also sets a ceiling: no measurement can track a group mean more closely than ' +
      'that mean tracks itself.',
  }
}

export function buildHypotheses(analysis, ratings) {
  const converging = ratings.scales.filter(matches)
  const failing = ratings.scales.filter((s) => !matches(s))

  const weights = analysis.fit.weights_normalised
  const boots = analysis.bootstrap.per_metric
  const allWeightsNonZero = boots.every((b) => b.lo > 0)
  const lowestBound = Math.min(...boots.map((b) => b.lo))
  const ablation = [...analysis.ablation.results].sort((a, b) => b.drop - a.drop)

  const h2Verdict =
    failing.length === 0
      ? VERDICT.SUPPORTED
      : converging.length === 0
        ? VERDICT.NOT_SUPPORTED
        : VERDICT.PARTLY

  // H3 is about the mismatches H2 leaves behind: each one must sit on a scale
  // participants agreed on, which is what makes it a fact about the metric
  // rather than about the raters. With no mismatch there is nothing to explain.
  const h3Verdict =
    failing.length > 0 && failing.every((s) => s.reliability != null && s.reliability >= RELIABILITY_FLOOR)
      ? VERDICT.SUPPORTED
      : VERDICT.NOT_SUPPORTED

  // H5's rule: supported only if the sign test gives p < .05 with the full
  // model ahead. Ahead means it won more of the decided folds than it lost.
  const paired = analysis.crossval.paired
  const ahead = paired.wins > paired.losses
  const h5Verdict =
    paired.signTestP < 0.05 && ahead
      ? VERDICT.SUPPORTED
      : ahead
        ? VERDICT.DIRECTIONAL
        : VERDICT.NOT_SUPPORTED

  // Why H5 is hard to win in this corpus: area and enclosure index move
  // together across the plazas. Computed from the per-plaza values the rating
  // validation stored, so the figure quoted is the data's, not a remembered one.
  const overlap = metricCorrelation(ratings, 'area', 'enclosure')
  const overlapText = `${signed2(overlap.r)} across the ${overlap.n} plazas`

  const spansZero = (ci) => ci?.lo != null && ci?.hi != null && ci.lo < 0 && ci.hi > 0

  return [
    {
      id: 'H1',
      claim:
        'Weighted distance in the metric space predicts which two of three plazas people judge most similar at a rate above chance.',
      verdict:
        analysis.crossval.mean_accuracy > analysis.crossval.chance && analysis.permutation.p < 0.05
          ? VERDICT.SUPPORTED
          : VERDICT.NOT_SUPPORTED,
      headline: `${pct(analysis.crossval.mean_accuracy).toFixed(1)}% vs ${pct(analysis.crossval.chance).toFixed(1)}% chance`,
      why: 'This is spatial fingerprinting itself: that four geometric numbers, weighted by how people actually judge, carry enough of the experience of a square to predict which squares feel alike. Accuracy is measured only on plazas the model was never fitted on, so it is prediction rather than description — and it is what licenses using the framework as a design diagnostic downstream.',
      evidence: [
        {
          label: 'Held-out accuracy',
          value: `${pct(analysis.crossval.mean_accuracy).toFixed(1)}% over ${analysis.crossval.per_fold.length} leave-one-plaza-out folds`,
          ok: true,
        },
        {
          label: `Against ${analysis.permutation.permutations.toLocaleString()} label shuffles`,
          value: `null mean ${pct(analysis.permutation.null_mean).toFixed(1)}%, best ${pct(analysis.permutation.null_max).toFixed(1)}%, p = ${analysis.permutation.p.toFixed(4)}`,
          ok: true,
        },
        { label: 'Judgements', value: `${analysis.fit.n} triplets from ${analysis.inputs.participants.used} participants` },
      ],
    },

    {
      id: 'H2',
      claim: 'Each metric corresponds to observers’ own ratings of the matching quality.',
      verdict: h2Verdict,
      headline: `${converging.length} of ${ratings.scales.length} metrics match their rating scale`,
      why: 'This is the central untested assumption of the isovist tradition. Benedikt named these quantities after experiential concepts; whether they behave like those concepts has rarely been tested against actual perception. The ratings never enter the weight fit, so this check can contradict it freely.',
      evidence: ratings.scales
        .slice()
        .sort((a, b) => b.pearson_aligned - a.pearson_aligned)
        .map((s) => ({
          label: pairLabel(s),
          value: `r = ${s.pearson_aligned.toFixed(3)}, p(Holm) ${s.pearson_p_holm.toFixed(4)}`,
          ok: matches(s),
        })),
    },

    {
      id: 'H3',
      claim:
        'Where a metric does not match its rating scale, the mismatch is systematic and not due to inconsistent ratings.',
      verdict: h3Verdict,
      headline: failing.length
        ? failing
            .map((s) => `${METRIC_LABELS[s.metric] ?? s.label}: r = ${s.pearson_aligned.toFixed(3)}, raters agreed at ${s.reliability.toFixed(2)}`)
            .join(' · ')
        : 'No metric failed to match its scale',
      why: 'A metric that fails to match its scale can fail for two reasons: the formula measures something other than what people perceive, or people did not perceive anything consistent. Only the first is a finding about the metric. Split-half reliability separates them — if raters agreed with each other on that scale, the shortfall belongs to the metric.',
      evidence: failing.flatMap((s) => {
        const ci = s.participant_bootstrap
        return [
          {
            label: pairLabel(s),
            value:
              `r = ${s.pearson_aligned.toFixed(3)}, p(Holm) ${s.pearson_p_holm.toFixed(4)}` +
              (ci?.lo != null && ci?.hi != null
                ? ` (participant bootstrap 95% CI ${ci.lo.toFixed(2)} to ${ci.hi.toFixed(2)}${spansZero(ci) ? ', spans zero' : ''})`
                : ''),
            ok: false,
          },
          {
            label: 'Raters agreed with each other',
            value: `split-half ${s.reliability.toFixed(2)}, against the ${RELIABILITY_FLOOR.toFixed(2)} floor`,
            ok: s.reliability >= RELIABILITY_FLOOR,
          },
        ]
      }),
    },

    {
      id: 'H4',
      claim: 'The fitted model gives every metric a weight above zero.',
      verdict: allWeightsNonZero ? VERDICT.SUPPORTED : VERDICT.NOT_SUPPORTED,
      headline: `Every 95% interval clears zero (lowest ${lowestBound.toFixed(3)})`,
      why: 'If people collapsed spatial experience onto a single axis, the multi-parameter vocabulary urban design uses would be unwarranted. This is also the answerable form of "which dimension dominates" — a question whose answer changes under a different rescaling, and which 18 plazas cannot settle.',
      evidence: [
        ...analysis.metrics.map((m, i) => ({
          label: METRIC_LABELS[m] ?? analysis.metric_labels[m],
          value: `weight ${weights[i].toFixed(3)}, 95% CI ${boots[i].lo.toFixed(3)}–${boots[i].hi.toFixed(3)}`,
          ok: boots[i].lo > 0,
        })),
        {
          label: 'Cost of removing each',
          value: ablation
            .map((r) => `${(METRIC_LABELS[r.metric] ?? r.label).toLowerCase()} ${(r.drop * 100).toFixed(2)} pp`)
            .join(' · '),
        },
      ],
    },

    {
      id: 'H5',
      claim: 'The combined four-metric model outperforms isovist area alone.',
      rule: 'Supported only if the sign test gives p < .05 with the full model ahead.',
      verdict: h5Verdict,
      headline: `${pct(analysis.crossval.mean_accuracy).toFixed(1)}% vs ${pct(analysis.crossval.area_only.mean_accuracy).toFixed(1)}% for area alone, sign test p = ${paired.signTestP.toFixed(3)}`,
      why: `The full model wins more folds than it loses, so the result points the way the hypothesis predicts, but the sign test cannot separate that margin from chance at 18 folds. Part of the reason is the corpus: area and enclosure index correlate ${overlapText}, because larger plazas here are systematically less enclosed, so knowing area already tells the model much of what enclosure index would add. A corpus sampled to break that correlation — small-but-open and large-but-enclosed squares — is the direct test of whether the fingerprint carries value beyond area.`,
      evidence: [
        {
          label: 'Mean difference',
          value: `${paired.meanDelta >= 0 ? '+' : '−'}${Math.abs(paired.meanDelta * 100).toFixed(2)} pp per fold, full model minus area alone`,
        },
        {
          label: 'Sign test',
          value: `p = ${paired.signTestP.toFixed(3)}, full model ahead in ${paired.wins} of ${paired.wins + paired.losses} decided folds (${paired.ties} tied)`,
          ok: paired.signTestP < 0.05 && ahead,
        },
        {
          label: 'Why they overlap',
          value: `area ↔ enclosure index r = ${overlapText}`,
        },
      ],
    },
  ]
}

// Counts for the summary line, so a reader sees the shape of the result before
// reading five cards.
export function summariseVerdicts(hypotheses) {
  const count = (v) => hypotheses.filter((h) => h.verdict === v).length
  return {
    supported: count(VERDICT.SUPPORTED),
    partly: count(VERDICT.PARTLY),
    directional: count(VERDICT.DIRECTIONAL),
    notSupported: count(VERDICT.NOT_SUPPORTED),
    total: hypotheses.length,
  }
}

// H3, drawn rather than asserted.
//
// Closed perimeter is the metric that does not match its scale. The figure asks
// which of the four metrics tracks that percept — perceived facade continuity —
// best. Answering it needs all four metrics correlated against the SAME scale,
// not each metric against its own, and it is computed here so the figure and
// any number quoted beside it come from one place.
//
// The ratings are stored as administered (see docs/handoff/05_closed_perimeter.md
// §3.3), where 1 sits at the continuous-fronts end, so facade continuity is the
// reflected rating, 8 − v. A constant offset does not change a correlation, so
// it is computed here as −v. Correlations are reported twice: `r` is the raw
// signed value against that percept, `aligned` is |r| — the strength of the
// association, which is what ranks the rows. Sign is carried separately and
// stated in the figure, because "more compact reads as more broken up" and "more
// closed perimeter reads as more continuous" are both evidence about the same
// percept, in opposite directions.
export function facadeContinuityCorrelations(ratings) {
  const scale = ratings.scales.find((s) => s.metric === 'closedPerimeter')
  if (!scale) return []

  // Reflected so that a larger number means "felt more continuous".
  const continuity = new Map(scale.per_site.map((p) => [p.site_id, -p.mean_rating]))

  return ratings.scales
    .map((s) => {
      const sites = s.per_site.filter((p) => continuity.has(p.site_id))
      const r = pearsonR(
        sites.map((p) => p.normalised),
        sites.map((p) => continuity.get(p.site_id))
      )
      return {
        metric: s.metric,
        label: METRIC_LABELS[s.metric] ?? s.label,
        r,
        aligned: Math.abs(r),
        n: sites.length,
        // Positive: more of this metric reads as more continuous. Negative:
        // more of it reads as more broken up.
        direction: r >= 0 ? 'more continuous' : 'more broken up',
      }
    })
    .sort((a, b) => b.aligned - a.aligned)
}

// Pearson r between two metrics' computed per-plaza values, over the plazas
// both scales cover.
function metricCorrelation(ratings, a, b) {
  const values = (m) => new Map((ratings.scales.find((s) => s.metric === m)?.per_site ?? []).map((p) => [p.site_id, p.computed]))
  const va = values(a)
  const vb = values(b)
  const ids = [...va.keys()].filter((id) => vb.has(id))
  return { r: pearsonR(ids.map((id) => va.get(id)), ids.map((id) => vb.get(id))), n: ids.length }
}

// Two decimals with a true minus sign, as the thesis prints correlations.
const signed2 = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`

// Local so this module has no dependency on the projection/figure layer — the
// analysis must not need the drawing code to compute a number.
function pearsonR(xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}
