// One participant's survey session record — the shape written to
// src/data/survey-responses.json (and to the Google Sheet once deployed), plus
// the helpers that read it back.
//
// The session is saved after *every* triplet, not once at the end, so a
// participant who closes the tab halfway still leaves their answers behind.
// That means a record on disk is not necessarily a finished survey, and the
// two helpers below are how the rest of the app tells the difference.

// Written status, set by the survey page itself.
export const STATUS_IN_PROGRESS = 'in_progress'
export const STATUS_COMPLETED = 'completed'
// Derived status, never written — see sessionStatus().
export const STATUS_ABANDONED = 'abandoned'

// How long a session may sit untouched before we stop expecting it to come
// back. Generous: the survey takes ~5 minutes, so half an hour of silence means
// the tab is closed, not that someone is thinking hard about a plaza.
export const ABANDON_TIMEOUT_MS = 30 * 60 * 1000

// An attention check repeats one plaza twice alongside a third; the "obviously
// similar" pair is the identical two, so a pass stores as a chosen_pair of two
// matching ids. Returns null when the session hasn't reached its check yet —
// "not answered" is not the same as "failed", and shouldn't count as either.
export function attentionCheckPassed(responses) {
  const checks = (responses ?? []).filter((r) => r.is_attention_check)
  if (!checks.length) return null
  return checks.every((r) => r.chosen_pair?.[0] != null && r.chosen_pair[0] === r.chosen_pair[1])
}

// Prefers the top-level field written since the incremental-save change, and
// falls back to re-deriving it for records collected before that existed.
export function recordAttentionCheckPassed(record) {
  if (typeof record?.attention_check_passed === 'boolean') return record.attention_check_passed
  return attentionCheckPassed(record?.responses)
}

// Most recent sign of life: the last answer's timestamp, else the save stamp,
// else the session start.
export function lastActivityAt(record) {
  const stamps = [
    record?.responses?.[record.responses.length - 1]?.timestamp,
    record?.updated_at,
    record?.started_at,
  ]
  for (const s of stamps) {
    const t = new Date(s).getTime()
    if (Number.isFinite(t)) return t
  }
  return null
}

// 'completed' | 'in_progress' | 'abandoned'.
//
// Abandonment is derived on read rather than stored: nothing runs server-side
// to notice a participant walking away, and the browser that could report it is
// by definition gone. So a session stays 'in_progress' on disk and only *reads*
// as abandoned once it has been quiet past the timeout. Either way the partial
// responses stay on file — abandonment is a label, never a deletion.
export function sessionStatus(record, now = Date.now()) {
  // finished_at without a status is a record from before this field existed.
  if (record?.status === STATUS_COMPLETED || (!record?.status && record?.finished_at)) {
    return STATUS_COMPLETED
  }
  const last = lastActivityAt(record)
  if (last != null && now - last < ABANDON_TIMEOUT_MS) return STATUS_IN_PROGRESS
  return STATUS_ABANDONED
}

export const STATUS_LABELS = {
  [STATUS_COMPLETED]: 'Completed',
  [STATUS_IN_PROGRESS]: 'In progress',
  [STATUS_ABANDONED]: 'Abandoned',
}
