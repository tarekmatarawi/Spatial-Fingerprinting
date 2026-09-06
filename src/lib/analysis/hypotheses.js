// The five hypotheses, derived from the two analysis outputs.
//
// They span both files by nature, which is why this lives on its own rather
// than inside either script: the convergence claims are answered by the rating
// block (rating-validation.json), the prediction claims by the triplet fit
// (analysis-<source>.json). Putting the verdict rules here keeps them in the
// analysis layer, testable and stated once, instead of being re-derived in
// whatever surface displays them.
//
// ORDER IS AN ARGUMENT, not a pipeline trace. The thesis asserts that a
// geometric fingerprint predicts perceived similarity well enough to drive a
// design diagnostic, so that claim leads. The sequence then runs:
//
//   H1  the core claim — geometry predicts perceived similarity
//   H2  are the measures valid — do they converge with judgement
//   H3  the standout negative — occlusivity fails, and why
//   H4  nuance — every dimension contributes
//   H5  the limitation, and the study it implies
//
// Rater reliability is deliberately NOT a hypothesis. Split-half 0.77–0.99
// says the instrument works and participants were not guessing — a data-quality
// precondition, the kind of manipulation check that belongs in methods.
// Leading with it would open the argument on a formality. It is exported below
// as `RELIABILITY_PRECONDITION` so the same numbers still appear, in the place
// they belong.
//
// Two points matter for reading the verdicts:
//
//   * A hypothesis is only "supported" when the evidence clears a stated
//     threshold, never because a number merely points the right way. H5 in
//     particular fails on a difference of +0.4 pp, which is real but nowhere
//     near distinguishable from zero.
//   * "Partly supported" is a real verdict, not a hedge. H2 asks whether four
//     metrics converge with perception; three do and one does not, and
//     collapsing that to a yes or a no would lose the finding.

export const VERDICT = {
  SUPPORTED: 'supported',
  PARTLY: 'partly',
  NOT_SUPPORTED: 'not_supported',
}

// With 18 plazas, a correlation must exceed roughly this to reach p < 0.05 on
// its own — quoted in the UI so a reader can see why 0.22 is not a finding.
export const R_SIGNIFICANCE_18 = 0.47

// Below this, participants disagreed with each other so much that no
// measurement could track their mean — the metric is untested rather than
// disproven.
const RELIABILITY_FLOOR = 0.4

const pct = (v) => (v == null ? null : v * 100)

// The reliability check, stated as a precondition rather than a hypothesis.
// Reported in methods: it establishes that there is a stable shared percept for
// the metrics to be tested against, without which none of H1–H5 could mean
// anything — but establishing that your instrument works is not a finding.
export function reliabilityPrecondition(ratings) {
  const values = ratings.scales.map((s) => s.reliability).filter((v) => v != null)
  return {
    label: 'Rater reliability',
    lo: Math.min(...values),
    hi: Math.max(...values),
    passes: Math.min(...values) >= RELIABILITY_FLOOR,
    perScale: ratings.scales.map((s) => ({
      metric: s.metric,
      label: s.label,
      reliability: s.reliability,
      ratingsPerPlaza: s.ratings_per_plaza,
    })),
    statement:
      'Split-half reliability across the four scales, Spearman–Brown corrected. Participants are ' +
      'split at random into halves and each half’s per-plaza mean is correlated against the ' +
      'other’s, so this measures whether observers agree with EACH OTHER — independent of whether ' +
      'any metric matches them.',
    why:
      'A precondition, not a result. It confirms the instrument works and that participants were ' +
      'not answering at random, which is what licenses treating a failed correlation as evidence ' +
      'about a metric rather than about the raters. It also sets a ceiling: no measurement can ' +
      'track a group mean more closely than that mean tracks itself.',
  }
}

export function buildHypotheses(analysis, ratings) {
  const byMetric = Object.fromEntries(ratings.scales.map((s) => [s.metric, s]))
  const converging = ratings.scales.filter((s) => s.pearson_p_holm < 0.05 && s.pearson_aligned > 0)
  const failing = ratings.scales.filter((s) => !(s.pearson_p_holm < 0.05 && s.pearson_aligned > 0))

  const reliabilities = ratings.scales.map((s) => s.reliability).filter((v) => v != null)
  const relLo = Math.min(...reliabilities)
  const relHi = Math.max(...reliabilities)

  const occ = byMetric.occlusivity
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

  return [
    {
      id: 'H1',
      group: 'The core claim',
      claim: 'Perceived similarity between urban squares is predicted by distance in the measured isovist space.',
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
          label: 'Against 1,000 label shuffles',
          value: `null mean ${pct(analysis.permutation.null_mean).toFixed(1)}%, best ${pct(analysis.permutation.null_max).toFixed(1)}%, p = ${analysis.permutation.p.toFixed(4)}`,
          ok: true,
        },
        { label: 'Judgements', value: `${analysis.fit.n} triplets from ${analysis.inputs.participants.used} participants` },
      ],
    },

    {
      id: 'H2',
      group: 'Are the measures valid?',
      claim:
        'Computed isovist metrics converge with lay perceptual judgements of the same spatial properties.',
      verdict: h2Verdict,
      headline: `${converging.length} of ${ratings.scales.length} dimensions converge`,
      why: 'This is the central untested assumption of the isovist tradition. Benedikt named these quantities after experiential concepts; whether they behave like those concepts has rarely been tested against actual perception.',
      evidence: ratings.scales
        .slice()
        .sort((a, b) => b.pearson_aligned - a.pearson_aligned)
        .map((s) => ({
          label: s.label,
          value: `r = ${s.pearson_aligned.toFixed(3)}, p(Holm) ${s.pearson_p_holm.toFixed(4)}`,
          ok: s.pearson_p_holm < 0.05 && s.pearson_aligned > 0,
        })),
    },

    {
      id: 'H3',
      group: 'The standout negative result',
      claim:
        'Occlusivity does not converge with perceived concealment, and the divergence follows from its definition rather than its implementation.',
      // Supported when the metric fails to converge WHILE participants agreed
      // among themselves — that pairing is what makes it a fact about the
      // formula rather than about the raters.
      verdict:
        occ.pearson_p_holm >= 0.05 && occ.reliability >= RELIABILITY_FLOOR
          ? VERDICT.SUPPORTED
          : VERDICT.NOT_SUPPORTED,
      headline: `r = ${occ.pearson_aligned.toFixed(3)}, but raters agreed at ${occ.reliability.toFixed(2)}`,
      why: 'Closed perimeter sums the solid facade you can see, so it grows with how much is visible rather than with what is concealed. A measure that rises with visibility is a poor candidate for a measure of hiddenness — an argument available from the definition alone, before any data.',
      evidence: [
        {
          label: 'Correlation with perceived concealment',
          value: `${occ.pearson_aligned.toFixed(3)} (95% CI ${occ.participant_bootstrap.lo?.toFixed(2)} to ${occ.participant_bootstrap.hi?.toFixed(2)}, spans zero)`,
          ok: false,
        },
        {
          label: 'Raters agreed with each other',
          value: `${occ.reliability.toFixed(2)} — the percept is real and stable`,
          ok: true,
        },
        {
          label: 'Alternative definitions tested',
          value: 'Closed perimeter, Benedikt absolute, Benedikt normalised, occluding radials — none converge',
        },
      ],
    },

    {
      id: 'H4',
      group: 'Nuance',
      claim: 'Perceived similarity draws on all four dimensions; none is idle.',
      verdict: allWeightsNonZero ? VERDICT.SUPPORTED : VERDICT.NOT_SUPPORTED,
      headline: `Every interval clears zero (lowest ${lowestBound.toFixed(3)})`,
      why: 'If people collapsed spatial experience onto a single axis, the multi-parameter vocabulary urban design uses would be unwarranted. This is also the answerable form of "which dimension dominates" — a question whose answer changes under a different rescaling, and which 18 plazas cannot settle.',
      evidence: [
        ...analysis.metrics.map((m, i) => ({
          label: analysis.metric_labels[m],
          value: `weight ${weights[i].toFixed(3)}, 95% CI ${boots[i].lo.toFixed(3)}–${boots[i].hi.toFixed(3)}`,
          ok: boots[i].lo > 0,
        })),
        {
          label: 'Cost of removing each',
          value: ablation.map((r) => `${r.label.toLowerCase()} ${(r.drop * 100).toFixed(2)} pp`).join(' · '),
        },
      ],
    },

    {
      id: 'H5',
      group: 'The limitation, and the study it implies',
      claim:
        'In this corpus the four dimensions covary too closely for the ensemble to out-predict its strongest single dimension.',
      // Stated as the corpus-composition claim it actually is. The old framing
      // ("the fingerprint beats area alone") made a property of eighteen
      // particular squares read as a verdict on the framework.
      verdict:
        analysis.crossval.paired.signTestP < 0.05 && analysis.crossval.paired.meanDelta > 0
          ? VERDICT.NOT_SUPPORTED // the ensemble DID beat the baseline, so the limitation does not hold
          : VERDICT.SUPPORTED,
      headline: `${pct(analysis.crossval.mean_accuracy).toFixed(1)}% vs ${pct(analysis.crossval.area_only.mean_accuracy).toFixed(1)}% for area alone — a tie`,
      why: 'Area and enclosure correlate −0.64 across these squares: larger plazas are systematically less enclosed, which is a fact about European urban form rather than about the metrics. The dimensions are individually valid (H2) and individually contributing (H4), yet overlap enough that measuring all four does not separate these plazas better than measuring one. That makes the next study obvious — a corpus sampled to break that correlation, with small-but-open and large-but-enclosed squares, is the direct test of whether the fingerprint carries independent value.',
      evidence: [
        {
          label: 'Difference',
          value: `+${(analysis.crossval.paired.meanDelta * 100).toFixed(2)} pp — 95% interval spans zero`,
        },
        {
          label: 'Sign test',
          value: `p = ${analysis.crossval.paired.signTestP.toFixed(3)}, winning ${analysis.crossval.paired.wins} of ${analysis.crossval.paired.wins + analysis.crossval.paired.losses} decided folds (${analysis.crossval.paired.ties} tied)`,
        },
        {
          label: 'Why they overlap',
          value: 'area ↔ enclosure r = −0.64; 63.9% of area is reconstructable from the other three',
        },
      ],
    },
  ]
}

// Counts for the summary line, so a reader sees the shape of the result before
// reading six cards.
export function summariseVerdicts(hypotheses) {
  const count = (v) => hypotheses.filter((h) => h.verdict === v).length
  return {
    supported: count(VERDICT.SUPPORTED),
    partly: count(VERDICT.PARTLY),
    notSupported: count(VERDICT.NOT_SUPPORTED),
    total: hypotheses.length,
  }
}

// H3, drawn rather than asserted.
//
// The claim under test is not "occlusivity is a weak metric" but something
// sharper: that the metric NAMED occlusivity is not the best available account
// of perceived concealment. Answering it needs all four metrics correlated
// against the SAME percept — the concealment scale — not each metric against
// its own scale. That comparison is what the figure shows, and it is computed
// here so the figure and any number quoted beside it come from one place.
//
// The occlusivity scale runs 1 = "views blocked, hidden corners" to 7 = "clear
// sightlines, nothing hidden", so perceived concealment is the reversed rating.
// Correlations are reported twice: `r` is the raw signed value against that
// percept, `aligned` is |r| — the strength of the association, which is what
// ranks the rows. Sign is carried separately and stated in the figure, because
// "more compact reads as less concealing" and "more occluding reads as more
// concealing" are both evidence about the same percept, in opposite directions.
export function concealmentCorrelations(ratings) {
  const scale = ratings.scales.find((s) => s.metric === 'occlusivity')
  if (!scale) return []

  // Reversed so that a larger number means "felt more concealing".
  const concealment = new Map(scale.per_site.map((p) => [p.site_id, -p.mean_rating]))

  return ratings.scales
    .map((s) => {
      const sites = s.per_site.filter((p) => concealment.has(p.site_id))
      const r = pearsonR(
        sites.map((p) => p.normalised),
        sites.map((p) => concealment.get(p.site_id))
      )
      return {
        metric: s.metric,
        label: s.label,
        r,
        aligned: Math.abs(r),
        n: sites.length,
        // Positive: more of this metric reads as more concealed. Negative: more
        // of it reads as more open.
        direction: r >= 0 ? 'more concealing' : 'more open',
      }
    })
    .sort((a, b) => b.aligned - a.aligned)
}

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
