// Pooled coverage of the triplet survey — how well the responses collected so
// far cover the 18 sites and the pairs between them.
//
// Why this exists: each participant's triplets are drawn independently, with no
// coordination between participants (see src/lib/triplets.js and the Phase 4
// section of docs/spec.md). Balanced pooled coverage is therefore an
// *expectation* about independent random sampling at the target scale, not
// something the sampler enforces. These functions turn that expectation into a
// number the researcher can watch converge as real responses arrive.
//
// Everything here is counted from `site_a/site_b/site_c` on stored responses —
// the triplets participants were actually shown — never from a re-simulation of
// the sampler. A coverage report that re-ran the sampler would only ever confirm
// its own assumptions.

import { recordAttentionCheckPassed } from './session'

// Order-independent key for a pair. Site ids contain spaces, so the key is never
// parsed back apart — each entry carries its own `a`/`b` instead.
const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

// Every unordered pair of the given sites — the denominator for pair coverage.
export function possiblePairs(siteIds) {
  const out = []
  for (let i = 0; i < siteIds.length; i++) {
    for (let j = i + 1; j < siteIds.length; j++) out.push([siteIds[i], siteIds[j]])
  }
  return out
}

// Counts one participant session's genuine triplets into the running tallies.
// Attention checks are skipped: they repeat a site against itself, so they carry
// no pair information and are excluded from the Phase 5 fit anyway.
function tallySession(record, active, siteCounts, pairs, stats) {
  for (const response of record?.responses ?? []) {
    if (response.is_attention_check) continue

    // Defensive dedupe: a genuine triplet should hold three distinct sites, but
    // counting a malformed one twice would silently inflate coverage.
    const trio = [...new Set([response.site_a, response.site_b, response.site_c])].filter(
      (id) => id != null
    )
    // A triplet naming a site that has since been excluded from the study can't
    // count toward coverage of the active set — it is reported separately rather
    // than dropped silently.
    if (trio.length < 3 || !trio.every((id) => active.has(id))) {
      stats.skipped++
      continue
    }

    stats.judged++
    for (const id of trio) siteCounts.set(id, siteCounts.get(id) + 1)
    for (let i = 0; i < trio.length; i++) {
      for (let j = i + 1; j < trio.length; j++) {
        const entry = pairs.get(pairKey(trio[i], trio[j]))
        if (entry) entry.count++
      }
    }
  }
}

// Pooled coverage across every session, computed live from stored responses.
//
// `fitEligibleOnly` drops sessions that failed their attention check — those are
// excluded from the Phase 5 weight fit, so their triplets don't count toward the
// coverage the fit will actually see. Sessions that haven't reached the check yet
// are kept either way: "not answered" is not "failed".
export function pooledCoverage(records, siteIds, { fitEligibleOnly = false } = {}) {
  const active = new Set(siteIds)
  const siteCounts = new Map(siteIds.map((id) => [id, 0]))
  const pairs = new Map(possiblePairs(siteIds).map(([a, b]) => [pairKey(a, b), { a, b, count: 0 }]))
  const stats = { judged: 0, skipped: 0 }

  const sessions = (records ?? []).filter(
    (r) => !fitEligibleOnly || recordAttentionCheckPassed(r) !== false
  )
  for (const record of sessions) tallySession(record, active, siteCounts, pairs, stats)

  const pairList = [...pairs.values()]
  const counts = pairList.map((p) => p.count)
  const total = counts.reduce((s, c) => s + c, 0)

  return {
    sessions: sessions.length,
    excludedSessions: (records ?? []).length - sessions.length,
    judged: stats.judged,
    skipped: stats.skipped,

    // Sorted ascending so the sites lagging behind head the list — the whole
    // point of the panel is spotting what is under-covered, not what is ahead.
    siteCounts: [...siteCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => x.count - y.count || x.id.localeCompare(y.id)),

    pairs: pairList,
    pairCount: (a, b) => pairs.get(pairKey(a, b))?.count ?? 0,
    pairsPossible: pairList.length,
    pairsSeenOnce: counts.filter((c) => c >= 1).length,
    pairsSeenTwice: counts.filter((c) => c >= 2).length,
    zeroPairs: pairList.filter((p) => p.count === 0),

    minPair: counts.length ? Math.min(...counts) : 0,
    maxPair: counts.length ? Math.max(...counts) : 0,
    meanPair: counts.length ? total / counts.length : 0,
  }
}

export const RAMP_MAX_STEPS = 4

// How many ramp steps are in play. Early in collection the largest pair count is
// tiny, and slicing 4 bands out of a maximum of 2 would print overlapping ranges
// ("1–1", "1–2") in the legend — so the ramp shortens to one step per whole
// observation until there are enough to fill it.
export function rampSteps(max) {
  return Math.max(0, Math.min(RAMP_MAX_STEPS, max))
}

// Bins a pair count onto the sequential ramp used by the matrix. Step 0 is
// reserved for "never seen", which is a state rather than a magnitude and gets
// its own status styling. The ramp is relative to the current maximum so it
// stays readable both at five participants and at fifty.
export function rampStep(count, max) {
  if (count <= 0) return 0
  const steps = rampSteps(max)
  if (steps <= 1) return 1
  return Math.min(steps, Math.max(1, Math.ceil((count / max) * steps)))
}

// The count range each ramp step currently stands for, for the scale legend —
// a continuous fill has to be readable as numbers, not colour alone.
export function rampBands(max) {
  const steps = rampSteps(max)
  if (steps === 0) return []
  // Inverts rampStep exactly: it assigns step = ceil(count / max * steps), so
  // step s holds the counts in ((s-1)·max/steps, s·max/steps]. Deriving the
  // edges any other way lets the legend disagree with the fills it explains.
  return Array.from({ length: steps }, (_, i) => {
    const step = i + 1
    const lo = Math.floor(((step - 1) * max) / steps) + 1
    const hi = Math.floor((step * max) / steps)
    return { step, lo, hi }
  })
}
