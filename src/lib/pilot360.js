// Panoramic pilot (360°) — triplet assembly and panorama conventions.
//
// This is a small feasibility pilot, not a powered study. It reuses the main
// survey's sampler and response schema exactly, so its data drops into the
// existing analysis scripts unchanged; only the STIMULUS differs — a navigable
// 360° panorama instead of a single static photograph.
//
// Deliberate differences from the main survey, both to keep the session short
// enough that panning doesn't exhaust people:
//   • fewer questions (PILOT_SURVEY_LENGTH below)
//   • no attention check
//
// The response schema keeps `is_attention_check` (always false) and
// `attention_check_passed` (always null) so nothing downstream has to special-
// case pilot records.

import { buildBalancedPool, mulberry32, hashString, MIN_PAIR_COVERAGE } from './triplets.js'

// How many triplets one pilot participant answers. Panning a panorama takes
// noticeably longer than glancing at a photo, so this is well short of the main
// survey's 26 — change this one number to lengthen or shorten the pilot.
export const PILOT_SURVEY_LENGTH = 15

export const SURVEY_VERSION = 'pilot_360_area_matched'

// Panorama framing — the controlled variables of this pilot.
//
// Every plaza must be framed identically or the comparisons mean nothing, so
// these are module constants with no setter anywhere in the codebase. They are
// also written into every stored session, because a pilot about framing is not
// interpretable later without a record of what the framing was.
export const PANORAMA_SETTINGS = {
  // Clamped so nobody spends the comparison looking at sky or pavement.
  PITCH_LIMIT_DEG: 12,
  // One fixed horizontal field of view for all 18 sites. Not adjustable by the
  // participant and not per-site.
  HFOV_DEG: 75,
}

// Where a site's equirectangular panorama lives. Same slug the static photos
// use, so `gendarmenmarkt-berlin.jpg` becomes `/panoramas/gendarmenmarkt-berlin.jpg`.
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
// whatever direction the camera happened to face when it was stitched. To open
// every plaza on the SAME compass heading, each site needs to declare how its
// image is oriented — `pano_north_offset_deg`, the compass bearing of the
// image's centre column. Until that is set the offset is 0, which means every
// panorama simply opens at its own centre. That is consistent and reproducible,
// but it is not a shared compass heading, and the pilot page says so plainly.
export function panoramaOpeningYawDeg(site, reading) {
  const offset = Number(site?.pano_north_offset_deg)
  if (!Number.isFinite(offset)) return 0
  // Yaw needed to look at the survey heading, measured from the image centre.
  const heading = Number(reading?.direction_deg)
  if (!Number.isFinite(heading)) return 0
  return ((heading - offset + 540) % 360) - 180
}

export function hasCalibratedNorth(site) {
  return Number.isFinite(Number(site?.pano_north_offset_deg))
}

// Which of the active sites still lack a panorama file. The page can only check
// this by trying to load them, so this returns the expected paths and the survey
// reports failures as they happen.
export function expectedPanoramas(siteList) {
  return siteList.map((site) => ({
    id: site.id,
    name: site.name,
    path: panoramaPath(site),
    url: panoramaUrl(site),
    calibrated: hasCalibratedNorth(site),
  }))
}

// Builds one participant's pilot survey.
//
// Same balanced-pool sampler as the main survey, seeded by participant id, just
// truncated to PILOT_SURVEY_LENGTH and with no attention check spliced in.
export function assemblePilotSurvey(siteIds, participantId, length = PILOT_SURVEY_LENGTH) {
  if (!siteIds || siteIds.length < 3) return []

  const rng = mulberry32(hashString(`pilot360:${participantId}`))
  const pool = buildBalancedPool(siteIds, MIN_PAIR_COVERAGE, rng)

  // Fisher-Yates on a copy, then take the first `length`. Wraps if the pool is
  // somehow shorter than the requested length.
  const shuffled = pool.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const out = []
  for (let i = 0; i < length; i++) {
    const trio = shuffled[i % shuffled.length]
    // Shuffle within the triplet so panel order isn't correlated with anything.
    const order = trio.slice()
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1))
      ;[order[k], order[j]] = [order[j], order[k]]
    }
    out.push({
      triplet_id: `${participantId}:${i}`,
      order: i,
      site_ids: order,
      is_attention_check: false,
      expected_same_id: null,
    })
  }
  return out
}
