// P5 — which responses enter the fit, and an auditable account of why the rest
// do not.
//
// The rule, fixed before any result was looked at:
//
//   • Attention-check triplets are dropped. The check repeats one site against
//     itself, so there is no similarity judgement in it to learn from.
//   • Participants who FAILED the check are dropped entirely.
//   • Participants who never REACHED the check are dropped entirely. Their
//     answers are real, but unverified, and one rule applied consistently is
//     worth more than the handful of responses.
//   • Everyone else is kept — including partial sessions. Someone who answered
//     20 of 27 and passed the check gave 20 usable judgements, and discarding
//     them would throw away good data for the sake of a tidy denominator.
//   • Triplets naming a site that has since been excluded from the study, or
//     malformed in any way, are dropped and counted separately.
//
// `summarise()` returns the full accounting so the app can state it plainly
// rather than presenting a bare n.

import { recordAttentionCheckPassed } from '../session.js'
import { chosenPairIndex, prepareTriplet } from './model.js'

export const DROP_REASONS = {
  FAILED_CHECK: 'failed_attention_check',
  NEVER_REACHED_CHECK: 'never_reached_attention_check',
  ATTENTION_TRIPLET: 'attention_check_triplet',
  INACTIVE_SITE: 'names_an_excluded_site',
  MALFORMED: 'malformed_response',
}

// Is this participant's session eligible at all?
export function participantEligibility(record) {
  const passed = recordAttentionCheckPassed(record)
  if (passed === true) return { eligible: true, reason: null }
  if (passed === false) return { eligible: false, reason: DROP_REASONS.FAILED_CHECK }
  return { eligible: false, reason: DROP_REASONS.NEVER_REACHED_CHECK }
}

// Filters the raw session records down to prepared triplets, with a full
// breakdown of everything dropped along the way.
export function selectTriplets(records, fingerprints, activeSiteIds) {
  const active = new Set(activeSiteIds)
  const triplets = []

  const participants = { eligible: [], dropped: [] }
  const dropped = {
    [DROP_REASONS.FAILED_CHECK]: 0,
    [DROP_REASONS.NEVER_REACHED_CHECK]: 0,
    [DROP_REASONS.ATTENTION_TRIPLET]: 0,
    [DROP_REASONS.INACTIVE_SITE]: 0,
    [DROP_REASONS.MALFORMED]: 0,
  }

  for (const record of records ?? []) {
    const { eligible, reason } = participantEligibility(record)
    const answers = record.responses ?? []

    if (!eligible) {
      participants.dropped.push({ participant_id: record.participant_id, reason, answers: answers.length })
      dropped[reason] += answers.filter((r) => !r.is_attention_check).length
      continue
    }

    let kept = 0
    for (const response of answers) {
      if (response.is_attention_check) {
        dropped[DROP_REASONS.ATTENTION_TRIPLET]++
        continue
      }

      const trio = [response.site_a, response.site_b, response.site_c]
      if (new Set(trio).size !== 3 || !trio.every((id) => active.has(id))) {
        dropped[DROP_REASONS.INACTIVE_SITE]++
        continue
      }
      if (chosenPairIndex(trio, response.chosen_pair) < 0) {
        dropped[DROP_REASONS.MALFORMED]++
        continue
      }

      triplets.push(prepareTriplet(response, fingerprints))
      kept++
    }

    participants.eligible.push({ participant_id: record.participant_id, used: kept })
  }

  return { triplets, participants, dropped }
}

// The account the UI shows: collected → eligible → fitted, every drop named.
export function summarise(records, selection) {
  const collected = (records ?? []).length
  const collectedAnswers = (records ?? []).reduce((s, r) => s + (r.responses ?? []).length, 0)
  const { participants, dropped, triplets } = selection

  return {
    participants: {
      collected,
      used: participants.eligible.length,
      dropped: participants.dropped.length,
      byReason: {
        [DROP_REASONS.FAILED_CHECK]: participants.dropped.filter(
          (p) => p.reason === DROP_REASONS.FAILED_CHECK
        ).length,
        [DROP_REASONS.NEVER_REACHED_CHECK]: participants.dropped.filter(
          (p) => p.reason === DROP_REASONS.NEVER_REACHED_CHECK
        ).length,
      },
    },
    responses: {
      collected: collectedAnswers,
      used: triplets.length,
      dropped: { ...dropped },
    },
    // Whether the attention check actually discriminated anyone. A check that
    // excludes nobody is not evidence of data quality — it is evidence the
    // check was too easy — and the UI must say so rather than imply a filter ran.
    attentionCheckDiscriminated:
      participants.dropped.filter((p) => p.reason === DROP_REASONS.FAILED_CHECK).length > 0,
  }
}

// Distinct participants behind a set of prepared triplets — the resampling unit
// for the bootstrap.
export function participantIds(triplets) {
  return [...new Set(triplets.map((t) => t.participant))]
}
