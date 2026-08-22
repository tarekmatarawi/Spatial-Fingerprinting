// The perceptual survey (P3) — triplet assembly, panorama conventions, and the
// semantic-differential rating block.
//
// One instrument, two tasks, always in this order:
//
//   1. TRIPLET COMPARISON — TRIPLET_COUNT rounds of three plazas, mark the two
//      that feel most alike. This is what the perceptual weights are fitted on.
//      It measures the metrics *against each other*: a judgement only reveals
//      which differences mattered most, not whether any single one was noticed.
//
//   2. SEMANTIC DIFFERENTIAL — each plaza the participant actually saw, rated on
//      four bipolar scales. This measures each metric *on its own*, so a metric
//      that loses the competition in the triplet task can still show that people
//      perceive it. The two answer different questions and neither replaces the
//      other.
//
// The ratings must come second. Showing explicit scales first would tell people
// which dimensions to attend to, and the triplet judgements would stop being
// spontaneous.

import { buildBalancedPool, mulberry32, hashString, MIN_PAIR_COVERAGE } from './triplets.js'

// How many triplets one participant answers before the rating block.
export const TRIPLET_COUNT = 12

// Tags every stored session. `panoramic_v0` marks the earlier sessions that ran
// the triplet task alone, before ratings existed — they are real data but have
// no rating block, which analysis must read as missing rather than absent.
export const SURVEY_VERSION = 'panoramic_v1'
export const TASK_TRIPLET = 'triplet_comparison'
export const TASK_RATING = 'semantic_differential'

// Panorama framing — the controlled variables of the study.
//
// Every plaza must be framed identically or the comparisons mean nothing, so
// these are module constants with no setter anywhere in the codebase. They are
// also written into every stored session, because a study about spatial framing
// is not interpretable later without a record of what the framing was.
export const PANORAMA_SETTINGS = {
  // Clamped so nobody spends a comparison looking at sky or pavement.
  // Asymmetric on purpose: the ground plane (paving, feet, tripod) carries far
  // less of the spatial cues this study cares about than the walls and sky do,
  // so the downward range is trimmed a little further than the upward one —
  // a nudge away from the floor, not a hard cut.
  PITCH_LIMIT_UP_DEG: 12,
  PITCH_LIMIT_DOWN_DEG: 9,
  // One fixed horizontal field of view for all 18 sites. Not adjustable by the
  // participant and not per-site.
  HFOV_DEG: 75,
}

// ---------------------------------------------------------------- panoramas

export const PANORAMA_DIR = 'panoramas'

export function panoramaFileName(site) {
  const fromPhoto = site?.street_view_image?.split('/').pop()
  if (fromPhoto) return fromPhoto.replace(/\.(jpg|jpeg|png|webp)$/i, '.jpg')
  return `${String(site?.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
}

export function panoramaPath(site) {
  return `${PANORAMA_DIR}/${panoramaFileName(site)}`
}

// Vite injects BASE_URL; Node (tests, scripts) has no import.meta.env at all,
// so this file stays importable from both.
const BASE_URL = typeof import.meta.env === 'undefined' ? '/' : import.meta.env.BASE_URL

export function panoramaUrl(site) {
  return BASE_URL + panoramaPath(site)
}

// Where each panorama starts before the participant drags it.
//
// An equirectangular image has an arbitrary yaw origin: the centre column is
// whatever direction the camera faced when it was stitched. To open every plaza
// on the SAME compass heading, each site must declare how its image is
// oriented — `pano_north_offset_deg`, the compass bearing of the image's centre
// column. Until that is set the offset is 0 and each panorama simply opens at
// its own centre: consistent and reproducible, but not a shared heading.
export function panoramaOpeningYawDeg(site, reading) {
  const offset = Number(site?.pano_north_offset_deg)
  if (!Number.isFinite(offset)) return 0
  const heading = Number(reading?.direction_deg)
  if (!Number.isFinite(heading)) return 0
  return ((heading - offset + 540) % 360) - 180
}

export function hasCalibratedNorth(site) {
  return Number.isFinite(Number(site?.pano_north_offset_deg))
}

export function expectedPanoramas(siteList) {
  return siteList.map((site) => ({
    id: site.id,
    name: site.name,
    path: panoramaPath(site),
    url: panoramaUrl(site),
    calibrated: hasCalibratedNorth(site),
  }))
}

// ---------------------------------------------------------------- triplets

function shuffleWith(list, rng) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Builds one participant's triplet block: a seeded slice of the balanced pool,
// with no attention check.
export function assembleSurvey(siteIds, participantId, length = TRIPLET_COUNT) {
  if (!siteIds || siteIds.length < 3) return []

  const rng = mulberry32(hashString(`panoramic:${participantId}`))
  const pool = shuffleWith(buildBalancedPool(siteIds, MIN_PAIR_COVERAGE, rng), rng)

  const out = []
  for (let i = 0; i < length; i++) {
    const trio = pool[i % pool.length]
    out.push({
      triplet_id: `${participantId}:${i}`,
      order: i,
      // Shuffled so panel position isn't correlated with anything.
      site_ids: shuffleWith(trio, rng),
      is_attention_check: false,
      expected_same_id: null,
    })
  }
  return out
}

// ------------------------------------------------------- semantic differential

// The four bipolar scales, one per geometric metric.
//
// Anchors are deliberately plain language. A participant must never meet the
// words "isovist", "compactness", "occlusivity" or "enclosure ratio" — naming
// the construct would teach them what to look for and turn a perceptual report
// into a guess at the researcher's intent.
//
// `low` is always the value-1 end of the CANONICAL scale and `high` the value-7
// end, whichever way round they happen to be drawn for a given participant.
export const RATING_SCALES = [
  {
    id: 'area',
    metric: 'area',
    low: 'Tight and confined',
    high: 'Spacious and open',
  },
  {
    id: 'compactness',
    metric: 'compactness',
    low: 'Irregular, stretched-out shape',
    high: 'Compact, regular shape',
  },
  {
    id: 'occlusivity',
    metric: 'occlusivity',
    low: 'Views blocked, hidden corners',
    high: 'Clear sightlines, nothing hidden',
  },
  {
    id: 'enclosure',
    metric: 'enclosure',
    low: 'Low walls, exposed to the sky',
    high: 'Tall walls, strongly enclosed',
  },
]

export const RATING_MIN = 1
export const RATING_MAX = 7

// The distinct plazas a participant actually saw, in a per-participant random
// order.
//
// Deliberately NOT all 18: rating a plaza nobody showed you is a different task.
// Because triplets overlap, this is typically 10–15 sites rather than a fixed
// number, so no two participants rate quite the same set — which is why the
// session records `rated_site_ids` and the dashboard reports per-site coverage.
export function ratingSitesFor(triplets, participantId) {
  const seen = []
  for (const t of triplets) {
    for (const id of t.site_ids) if (!seen.includes(id)) seen.push(id)
  }
  return shuffleWith(seen, mulberry32(hashString(`ratings:${participantId}`)))
}

// Which way round each scale is drawn for this participant.
//
// Fixed per participant rather than per screen: flipping between sites would
// make the task feel unstable and invite mis-clicks. `true` means the scale is
// drawn reversed — the value-7 anchor on the LEFT.
//
// The stored `value` is always canonical (1 = the `low` anchor above) whatever
// the drawn direction, so the data needs no post-hoc unflipping. The direction
// is recorded anyway, so position bias can be tested for.
export function anchorDirections(participantId) {
  const rng = mulberry32(hashString(`anchors:${participantId}`))
  const out = {}
  for (const scale of RATING_SCALES) out[scale.id] = rng() < 0.5
  return out
}

export function anchorLabel(reversed) {
  return reversed ? 'high_left' : 'low_left'
}

// How many rating answers a participant owes, for progress display.
export function expectedRatingCount(siteCount) {
  return siteCount * RATING_SCALES.length
}
