// P8 — the matched-view validation instrument.
//
// P7 can show that Chamfer pairs a view in one plaza with a view in another.
// Nothing in P7 says whether a person agrees. This phase asks them.
//
// THE TRIAL. One reference view on top, two candidate views below it, all three
// rendered from the same building masses the isovist ran on, at the same 120°
// field. "Which of the two feels more like the space above?" Two alternatives,
// forced choice, no skip and no "about the same" — a middle option would let a
// participant decline the judgement the phase exists to collect, and the
// binomial test has no cell to put it in.
//
// HOW ONE TRIAL ADJUDICATES THREE MEASURES. Each candidate plaza is represented
// by ITS OWN view closest to the reference. That constraint is what makes the
// screen fair to all three measures rather than rigged for the view-level one:
//
//   chamfer   picks the candidate whose VIEW is nearer the reference view. This
//             is Chamfer's own internal pairing (matchViews), exposed rather
//             than averaged away.
//   centroid  picks the candidate whose PLAZA CLOUD centroid is nearer the
//             reference plaza's. Blind to which view was shown, by construction.
//   gaussian  picks the candidate whose PLAZA CLOUD is nearer by 2-Wasserstein.
//
// Centroid and Gaussian are set-to-set measures and have no view-level pairing
// of their own, so "which plaza, ignoring which view" is not a weakened version
// of their prediction — it IS their prediction. Which is exactly the question
// worth adjudicating: does knowing which view you are standing at add anything
// over knowing which plaza you are in?
//
// If a foil were drawn at random instead of being each plaza's own best match,
// the view-level measure would win trivially and the comparison would be
// worthless. The constraint costs nothing and removes that.
//
// TWO STRATA, NEVER POOLED INTO ONE HEADLINE.
//
//   agreement      all three measures name the same candidate. Tests the
//                  framework as a whole against chance.
//   discriminating chamfer names one candidate, centroid AND gaussian both name
//                  the other. This is the adjudication.
//
// Reporting a single pooled accuracy across both would be an estimate of each
// measure's general accuracy computed on trials selected BECAUSE the measures
// disagree — biased by construction, in a direction that depends on the mix.
// The analysis reports the strata separately and says so.
//
// LAYER: perceptual_120 throughout, inherited from the P7 clouds the bank is
// built from. No 360° reading may enter.

export const MATCHED_VIEW_VERSION = 'matched_view_v1'
export const TASK_MATCHED_VIEW = 'matched_view_2afc'
export const MATCHED_VIEW_FOV_MODE = 'perceptual_120'

// The two strata, and how many of each one participant answers.
//
// Equal counts, because the two strata answer different questions and both are
// reported: an unequal split would buy power for one at the other's expense
// with no principle behind the exchange rate.
//
// 12 trials — two to three minutes. This instrument is deliberately SHORT. A
// 2AFC judgement between two rendered views takes a few seconds, not the minute
// of panning a P3 panorama triplet costs, and the phase asks one narrow
// question rather than P3's two tasks. Keeping it brief is also what makes it
// realistic to recruit a second cohort at all, having already asked this
// population for fifteen minutes once.
//
// The cost is stated rather than hidden: power comes from PARTICIPANTS here,
// not from trials per person. At 40 participants this collects 240 judgements
// per stratum, which is ample for the pooled binomial and adequate for the
// McNemar adjudication if the effect is real, but it leaves the per-participant
// accuracies coarse — six trials can only land on seven values — so the
// participant-level sign test is the weakest of the three tests reported. One
// constant changes it if the study later wants more.
export const STRATA = ['agreement', 'discriminating']
export const TRIALS_PER_STRATUM = 6
export const BLOCK_LENGTH = STRATA.length * TRIALS_PER_STRATUM

// No attention check, matching P3.
//
// The earlier static-photo study's check discriminated nobody across 50
// participants, and a check screen spends trials the short instrument cannot
// spare. The cost is that a bare accuracy has no ceiling to be read against —
// "68% correct" means something different if attentive people score 95% than if
// they score 70%. That ceiling is recovered from the real trials instead of
// bought with extra ones: accuracy is reported as a function of prediction
// MARGIN, and a rising curve is the evidence that participants were judging
// rather than clicking. See accuracyByMargin() in lib/analysis/matchedView.js.
export const HAS_ATTENTION_CHECK = false

// The three measures a trial carries a prediction for. Order is the reporting
// order: the two cloud-level measures first, then the view-level one the phase
// is actually testing, so a reader meets the incumbents before the challenger.
export const PREDICTORS = ['centroid', 'gaussian', 'chamfer']

export const PREDICTOR_LABELS = {
  centroid: 'Centroid',
  gaussian: 'Gaussian',
  chamfer: 'Chamfer',
}

// Which side of the pair a prediction names. Candidates are stored in a fixed
// order in the bank and shuffled for display, so 'a'/'b' are bank identities,
// never screen positions.
export const SIDES = ['a', 'b']

/* ------------------------------------------------------------ the trial bank */

// Rejects a bank that could not be analysed, before it is written or read.
//
// Validated in the builder AND at read time, not only in the UI: a bank is the
// frozen stimulus set of a study, and a malformed one turns into a silently
// wrong accuracy rather than a visible crash. Every check here corresponds to
// an assumption the analysis makes.
export function validateTrialBank(bank) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
    throw new Error('Expected a trial-bank object')
  }
  if (bank.fov_mode !== MATCHED_VIEW_FOV_MODE) {
    throw new Error(`Trial bank must be ${MATCHED_VIEW_FOV_MODE}, got "${bank.fov_mode}"`)
  }
  if (!Array.isArray(bank.trials) || bank.trials.length === 0) {
    throw new Error('Trial bank has no trials')
  }
  const seen = new Set()
  for (const t of bank.trials) {
    if (!t.trial_id) throw new Error('A trial has no trial_id')
    if (seen.has(t.trial_id)) throw new Error(`Duplicate trial_id "${t.trial_id}"`)
    seen.add(t.trial_id)
    if (!STRATA.includes(t.stratum)) {
      throw new Error(`Trial ${t.trial_id} has unknown stratum "${t.stratum}"`)
    }
    if (!t.reference?.site_id) throw new Error(`Trial ${t.trial_id} has no reference site`)
    if (!Array.isArray(t.candidates) || t.candidates.length !== 2) {
      throw new Error(`Trial ${t.trial_id} must have exactly 2 candidates`)
    }
    const [a, b] = t.candidates
    // Three distinct plazas. Two candidates from the same square would make the
    // choice a within-plaza question, which no cloud-level measure can answer —
    // centroid and Gaussian would report an identical distance for both.
    if (a.site_id === b.site_id) {
      throw new Error(`Trial ${t.trial_id} draws both candidates from ${a.site_id}`)
    }
    if (a.site_id === t.reference.site_id || b.site_id === t.reference.site_id) {
      throw new Error(`Trial ${t.trial_id} has a candidate from the reference plaza`)
    }
    for (const view of [t.reference, a, b]) {
      if (view.fov_mode !== MATCHED_VIEW_FOV_MODE) {
        throw new Error(`Trial ${t.trial_id} carries a ${view.fov_mode} view`)
      }
      for (const k of ['local_x', 'local_y', 'direction_deg']) {
        if (!Number.isFinite(view[k])) {
          throw new Error(`Trial ${t.trial_id} has non-finite ${k}`)
        }
      }
    }
    for (const p of PREDICTORS) {
      if (!SIDES.includes(t.predictions?.[p])) {
        throw new Error(`Trial ${t.trial_id} has no ${p} prediction`)
      }
    }
    // The stratum is a claim about the predictions, so it is checked against
    // them rather than trusted. A mislabelled stratum would put a discriminating
    // trial into the agreement column and quietly flatten the adjudication.
    const { centroid, gaussian, chamfer } = t.predictions
    const unanimous = centroid === gaussian && gaussian === chamfer
    const split = centroid === gaussian && chamfer !== centroid
    if (t.stratum === 'agreement' && !unanimous) {
      throw new Error(`Trial ${t.trial_id} is labelled agreement but the measures disagree`)
    }
    if (t.stratum === 'discriminating' && !split) {
      throw new Error(
        `Trial ${t.trial_id} is labelled discriminating but chamfer does not split from both cloud measures`
      )
    }
  }
  return bank
}

/* ------------------------------------------------- one participant's block */

// Small, fast, seedable PRNG — the same mulberry32 P3's sampler uses, so a
// participant id reproduces the same block for debugging and resuming.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffleWith(list, rng) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// One participant's 24 trials: a seeded draw of TRIALS_PER_STRATUM from each
// stratum, interleaved, with each trial's two candidates assigned to a screen
// side independently.
//
// The two strata are INTERLEAVED rather than blocked. Answering twelve
// agreement trials and then twelve discriminating ones would confound stratum
// with fatigue and with practice — any accuracy difference between them, which
// is the phase's headline comparison, could then be either a fact about the
// measures or a fact about position in the session, with no way to tell them
// apart afterwards.
//
// `leftSide` is which candidate is drawn on the LEFT, per trial per participant.
// Without it the bank's own 'a'/'b' order would become a screen position that
// every participant sees identically, and a general left-hand preference would
// look exactly like evidence for whichever measure the bank happened to list
// first. The chosen side is stored with the answer so position bias stays
// testable rather than assumed away.
export function assembleMatchedViewBlock(bank, participantId, perStratum = TRIALS_PER_STRATUM) {
  const rng = mulberry32(hashString(`matched-view:${participantId}`))

  const drawn = []
  for (const stratum of STRATA) {
    const pool = shuffleWith(
      (bank?.trials ?? []).filter((t) => t.stratum === stratum),
      rng
    )
    // Fewer trials in a stratum than asked for is a bank problem, not a
    // participant problem: take what is there rather than repeating a trial,
    // which would make one judgement count twice in the same person's total.
    drawn.push(...pool.slice(0, Math.min(perStratum, pool.length)))
  }

  return shuffleWith(drawn, rng).map((trial, order) => ({
    trial,
    order,
    leftSide: rng() < 0.5 ? 'a' : 'b',
  }))
}

// Was this participant's answer the one `predictor` named?
//
// Returns null when the trial carries no prediction for that measure, which a
// caller must treat as "not scored" rather than as a miss — an unanswerable
// trial silently counted as wrong would drag every accuracy toward zero.
export function scoredAs(trial, chosenSide, predictor) {
  const predicted = trial?.predictions?.[predictor]
  if (!SIDES.includes(predicted) || !SIDES.includes(chosenSide)) return null
  return chosenSide === predicted
}
