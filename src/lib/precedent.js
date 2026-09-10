// P9 — the closest validated precedent view. The bridge back to P7 and P8.
//
// Everything else on the diagnose page is a 360° field measurement: what a
// place IS, independent of which way anyone happens to be looking. That is the
// right layer for a zone diagnosis and it is what the typology was built in.
// It also cannot answer the question a designer asks last, standing at the edge
// of the thing they have just drawn: "has anyone built this before, and what
// does it look like?"
//
// This does. A vantage and a heading inside the sandbox produce one real 120°
// reading, and that reading is ranked against the 144 corpus views P7 assembled
// — the eighteen canonical fingerprints plus the 126 placed markers. What comes
// back is a list of actual positions in actual European squares, nearest first,
// with the closest one rendered.
//
// LAYER: perceptual_120, alone, and never mixed into anything above it.
//
// This is the ONLY perceptual_120 surface in P9. The bounds it normalises
// against are the frozen 120° bounds from the eighteen canonical readings — the
// same ones P5 fitted in and P7 compares in — NOT the 360° field bounds the
// zone diagnosis uses. The two are different measurement systems (docs/spec.md,
// "Layer separation"), and a 120° reading scaled on 360° bounds would be a
// number with no meaning that nonetheless looks entirely reasonable: same four
// names, same 0–1 range, silently wrong by roughly the ratio between what you
// see facing one way and what you see turning all the way round. So the
// normalisation is done here, from the corpus this ranking is against, and the
// result never touches the zone diagnosis or the Tier B composition delta.
//
// WHAT THIS IS NOT. Ranking a drawn view against the corpus does not validate
// the drawn view. It says a measured position exists that is close to it in the
// weighted space, which is a lookup, not evidence. What P8 tested is the
// separate and much narrower claim that when this space says two views are
// alike, people agree — and it tested it on 15 of an intended ~40 participants,
// with one stratum short of significance. The page states those numbers live
// from the analysis rather than repeating a remembered figure; see
// `precedentEvidence` at the foot of this file.

import { buildEdgeIndex, castIsovist, bearingTo } from './isovist.js'
import { METRICS } from './analysis/fingerprints.js'
import { whiten } from './analysis/clouds.js'
import {
  CLOUD_FOV_DEG,
  CLOUD_FOV_MODE,
  CLOUD_RANGE_M,
  CLOUD_RAY_COUNT,
  buildClouds,
} from './viewClouds.js'
import { HEIGHT_AWARE, composeGeometry } from './sandbox.js'
import { pointInPolygon } from './site.js'

// The cast is P7's, exactly: 120 rays over 120° to 200 m. Re-exported under
// P9's own names so a reader here does not have to hold "cloud" in mind, but
// the values are imported rather than restated — two constants that must agree
// are one constant.
export const PRECEDENT_FOV_MODE = CLOUD_FOV_MODE
export const PRECEDENT_FOV_DEG = CLOUD_FOV_DEG
export const PRECEDENT_RAY_COUNT = CLOUD_RAY_COUNT
export const PRECEDENT_RANGE_M = CLOUD_RANGE_M

// Five, and the reason is what a fifth-place precedent is for. One would invite
// the ranking to be read as an answer; a long list would invite it to be read
// as a distribution, which 144 views cannot support. Five is enough to show
// whether the top match stands clear of the field or sits in a cluster of
// near-ties, which is the only thing about the ranking a designer should act on.
export const PRECEDENT_TOP_N = 5

// results.json / view-clouds.json field names → the short metric names.
// Duplicated from viewClouds.js rather than exported from it: this module reads
// the same records, and a shared private map would be one more thing to import
// for four lines of dictionary.
const SOURCE_KEYS = {
  area: 'area_m2',
  compactness: 'compactness',
  occlusivity: 'occlusivity_m',
  enclosure: 'enclosure_ratio',
}

/* ------------------------------------------------------------- the probe */

// The sandbox geometry, and an edge index for casting through it.
//
// HEIGHT-AWARE, like every other cast in P9 — see HEIGHT_AWARE in sandbox.js
// for why the mode is a constant rather than a caller's choice. The index
// records the mode it was built under and castIsovist refuses a mismatch, so
// the two cannot drift apart.
//
// The index is separate from the one recomputeField builds even though both
// describe the same composed geometry. Sharing it would couple a 120° probe to
// the 360° field recompute's lifecycle, and the field recompute is debounced —
// a probe would then be measuring whatever geometry the last settled drag left
// behind rather than what is standing now.
export function buildProbeIndex(geometry, elements = []) {
  const composed = composeGeometry(geometry, elements)
  return {
    composed,
    index: buildEdgeIndex(composed.buildings, { heightAware: HEIGHT_AWARE }),
  }
}

// Can a person stand here?
//
// The same two conditions every other layer of the platform applies: inside the
// plaza boundary, and at least 1 m clear of anything that obstructs at eye
// height. P6's grid uses it, P7's marker editor uses it, and Tier B's recompute
// uses it — a probe that could be placed somewhere those three would refuse
// would be a 120° reading from a position no 360° reading could ever be taken
// at, which is not a place any precedent could be a precedent FOR.
//
// `composed` is the sandbox geometry, so a mass drawn in Tier B blocks a
// vantage exactly as a surveyed building does, and a pergola roof or a
// knee-high wall does not — they never reach the slice, and you can stand under
// one. That falls out of composeGeometry having already dropped the non-
// blocking parts rather than being decided again here.
//
// A KNOWN CONSERVATISM, matching P6 rather than reality: a recessed arcade is
// carved out of its host at eye height, but the host's footprint is untouched,
// so the loggia floor still reads as "inside a building" and is refused. You
// could of course stand in a loggia. P6's lattice excludes those positions for
// the same reason, and a probe allowed somewhere the field has no points would
// have nothing on this page to be compared against.
export function standableVantage(point, composed, boundary, clearance = 1) {
  if (!point) return false
  if (boundary && !pointInPolygon(point, boundary)) return false
  for (const b of composed.buildings) {
    if (pointInPolygon(point, b.footprint)) return false
    if (distanceToRing(point, b.footprint) < clearance) return false
  }
  return true
}

// P2's convention, unchanged: an unaimed view faces the middle of the square.
//
// Not the capture protocol's convention, which is a different thing and is
// deliberately not reused here — the canonical fingerprints face where a Street
// View camera stood, which is a fact about a photograph rather than a sensible
// default for a point someone just clicked. The centroid is where a person
// standing in a plaza tends to be looking, and it is re-aimable in one gesture.
export function defaultHeading(vantage, centroid) {
  return bearingTo(vantage, centroid)
}

// One 120° reading, in the shape the corpus records are already in.
//
// The four metrics are named as they are in results.json and view-clouds.json
// (`area_m2`, `occlusivity_m` …) so a probe and a corpus view are the same kind
// of object everywhere downstream — the readout below a render, the metric
// table, the normalisation. A probe with its own field names would mean every
// consumer carrying a branch for which of the two it was handed.
//
// Rays come back too. The plan draws the wedge from them, which is what makes
// the aim gesture legible: you see the cone you are about to measure, not an
// arrow and a promise.
export function probeView({ vantage, headingRad, composed, index }) {
  const m = castIsovist(vantage, headingRad, composed.buildings, {
    fov: PRECEDENT_FOV_DEG,
    rayCount: PRECEDENT_RAY_COUNT,
    range: PRECEDENT_RANGE_M,
    index,
    heightAware: HEIGHT_AWARE,
  })

  return {
    local_x: round(vantage.x, 2),
    local_y: round(vantage.y, 2),
    // Stored to 2 dp, matching the capture protocol's precision note in
    // docs/spec.md. At a plaza with street openings a sub-degree rotation can
    // flip a ray between a near facade and a 200 m escape, so the number of
    // decimals a heading is recorded to is not cosmetic.
    direction_deg: round(normaliseDegrees((headingRad * 180) / Math.PI), 2),
    area_m2: round(m.area, 2),
    compactness: round(m.compactness, 4),
    occlusivity_m: round(m.occlusivity, 2),
    enclosure_ratio: round(m.enclosureRatio, 4),
    fov_mode: PRECEDENT_FOV_MODE,
    fov_deg: PRECEDENT_FOV_DEG,
    ray_count: PRECEDENT_RAY_COUNT,
    range_m: PRECEDENT_RANGE_M,
    rays: m.rays,
    origin: 'probe',
  }
}

/* ------------------------------------------------------------ the corpus */

// The 144 views, flattened, with the bounds they are scaled against.
//
// Built through buildClouds rather than by reading view-clouds.json directly,
// so the canonical fingerprint is composed in at read time exactly as P7 does
// it and this page cannot end up ranking against a stale copy of a reading P5
// owns. `bounds` comes back from the same call, which is what guarantees the
// probe and the corpus are scaled on one ruler.
export function buildCorpusViews(readings, placedMarkers, activeSiteIds) {
  const built = buildClouds(readings, placedMarkers, activeSiteIds)

  const views = []
  for (const siteId of built.siteIds) {
    const cloud = built.clouds.get(siteId)
    cloud.markers.forEach((marker, viewIndex) => {
      views.push({
        siteId,
        siteName: marker.site_name ?? siteId,
        // 1-based, matching the "view 3" labels P7 and P8 already use on
        // screen. View 1 is always the canonical reading.
        viewNumber: viewIndex + 1,
        origin: marker.origin,
        marker,
        n: cloud.points[viewIndex],
      })
    })
  }

  return {
    fovMode: built.fovMode,
    bounds: built.bounds,
    views,
    siteIds: built.siteIds,
    total: views.length,
  }
}

/* ----------------------------------------------------------- the ranking */

// Normalise a reading onto the corpus's frozen 120° scale.
//
// NOT clamped, following normaliseValue's rule in fingerprints.js. A probe cast
// inside a colonnade can genuinely be tighter than any of the eighteen surveyed
// vantages, and clipping it to zero would file it alongside every other extreme
// view rather than showing it as the outlier it is. Out-of-range components are
// counted instead, and the panel says so — an extrapolated ranking is still
// worth having as long as nobody mistakes it for an interpolated one.
export function normaliseReading(record, bounds) {
  return METRICS.map((k) => {
    const b = bounds[k]
    return (record[SOURCE_KEYS[k]] - b.min) / (b.max - b.min)
  })
}

// The probe against every corpus view, nearest first.
//
// The distance is plain Euclidean AFTER whitening by the P5 weights — the same
// arrangement clouds.js uses, and the same reason: a weighted squared distance
// Σ wₖ(aₖ−bₖ)² is exactly an unweighted one on axes scaled by √wₖ, so scaling
// once up front means no consumer can apply the weights twice or forget them.
// It also makes these distances directly comparable to the view-level distances
// P7 reports and P8 tested, which is the entire point of ranking against that
// corpus rather than against a fresh one.
//
// The weights are P5's, unrefitted and unrefittable here. Applying them to 120°
// readings from positions that are not the survey's vantages is the same
// transfer assumption P6 and P7 already make and state; it is not a new one,
// and it is not weakened by the geometry being drawn rather than surveyed.
//
// KONSTABLERWACHE'S OWN EIGHT VIEWS ARE EXCLUDED BY DEFAULT. A probe placed in
// Konstablerwache will, unedited, sit close to Konstablerwache — that is a
// statement about the probe being where it is, not a precedent, and left in it
// would fill the top of the list. The toggle exists because the exclusion stops
// being obviously right once Tier B has changed the plaza: "the intervention
// moved this corner away from the square it is in" is a real finding, and the
// only way to see it is to let the home plaza back into the ranking.
export function rankPrecedents({
  probe,
  corpus,
  weights,
  excludeSiteId = null,
  topN = PRECEDENT_TOP_N,
}) {
  const probeN = normaliseReading(probe, corpus.bounds)
  const scale = weights.map((w) => Math.sqrt(w))
  const probeW = probeN.map((v, k) => v * scale[k])

  const pool = excludeSiteId ? corpus.views.filter((v) => v.siteId !== excludeSiteId) : corpus.views

  const scored = whiten(
    pool.map((v) => v.n),
    weights
  ).map((point, i) => ({
    ...pool[i],
    distance: euclid(probeW, point),
    // Where the distance came from, per metric, on the whitened axes. Same
    // decomposition idea as the zone diagnosis one section up the page, and for
    // the same reason: "0.31 away" is not actionable, "0.31 away, three
    // quarters of it occlusivity" is.
    contributions: probeW.map((v, k) => (v - point[k]) ** 2),
  }))

  scored.sort((a, b) => a.distance - b.distance)
  const ranked = scored.slice(0, topN).map((v) => ({
    ...v,
    shares: shareOf(v.contributions),
  }))

  return {
    probeN,
    // Which of the four sit outside the range the eighteen canonical readings
    // span. Named rather than counted, because which metric extrapolates is the
    // interesting part: an out-of-range area means a drawn space larger than
    // any surveyed view, which is a different caution from an out-of-range
    // enclosure.
    outOfRange: METRICS.filter((_, k) => probeN[k] < 0 || probeN[k] > 1),
    ranked,
    pooled: pool.length,
    excluded: corpus.views.length - pool.length,
    // The gap between first and second place, as a share of the first. A top
    // match standing clear of the rest is a different claim from one winning a
    // near-tie, and the number that separates those two cases should not have
    // to be eyeballed off a list.
    separation:
      scored.length > 1 && scored[0].distance > 0
        ? (scored[1].distance - scored[0].distance) / scored[0].distance
        : null,
  }
}

/* ------------------------------------------- the decomposition figure's promise */

// Will a segment's percentage fit inside it?
//
// This lives here, next to the numbers, rather than inside the drawing, because
// the figure's caption makes a PROMISE with it: "a band with no figure on it is
// under about 5%". That is a claim about the arithmetic, and a claim this
// project makes on screen is one it pins in a test — otherwise a later change to
// the bar width or the type size quietly turns the caption into a lie while
// everything still renders perfectly.
//
// Mono at 9.5 units runs about 5.9 units a character (measured against the type
// scale in components/charts/tokens.js), plus room to breathe on both sides so a
// label cannot collide with a boundary and read as belonging to its neighbour.
export const LABEL_CHAR_W = 5.9
export const LABEL_PADDING = 10

export function segmentLabelFits(share, barWidth) {
  const label = `${Math.round(share * 100)}%`
  return share * barWidth >= label.length * LABEL_CHAR_W + LABEL_PADDING
}

/* --------------------------------------------------- what P8 actually showed */

// P8's result, read LIVE from the analysis rather than written down here.
//
// The temptation is to put "63%, p = 0.15" in a string and move on. That number
// is from 15 of an intended ~40 participants and will change with every batch
// of responses; a hard-coded copy would keep saying 63% after the sample had
// doubled, and the page would be making a false claim about its own data in the
// most credible-looking way available — a specific figure to two significant
// figures, in the researcher's own interface.
//
// The wording is as careful as the numbers. P8 is INTERIM. Its agreement
// stratum is not significant by the defensible test, and the phrase "validated
// precedent" in this panel's title is doing real work that it has not fully
// earned yet: what it means is "a view from the corpus P8 tested", not "a view
// people have confirmed is similar". `status` below is what the panel prints,
// and it says which of those two it is.
export function precedentEvidence(analysis) {
  if (!analysis?.strata) return null

  const agreement = analysis.strata.agreement
  const discriminating = analysis.strata.discriminating
  if (!agreement || !discriminating) return null

  // Every measure names the same candidate in the agreement stratum by
  // construction, so all three score identically there. Chamfer is read for
  // both because it is the view-level measure this ranking uses.
  const agree = agreement.predictors.chamfer
  const discriminate = discriminating.predictors.chamfer
  const adjudication = discriminating.adjudication.chamfer_vs_centroid

  const significant = agree.participant_level.p_value < 0.05

  return {
    participants: analysis.n_participants,
    judgements: analysis.n_rows,
    agreement: {
      accuracy: agree.accuracy,
      n: agree.n,
      // The sign test, not the pooled binomial. One participant answers twelve
      // trials, so the pooled test treats twelve dependent judgements as twelve
      // independent ones and reports an interval too narrow and a p-value too
      // small. Both are on the P8 page side by side; a one-line summary
      // elsewhere gets the defensible one.
      signP: agree.participant_level.p_value,
      pooledP: agree.pooled.p_value,
      ci: agree.pooled.ci,
      significant,
    },
    discriminating: {
      accuracy: discriminate.accuracy,
      n: discriminate.n,
      mcnemarP: adjudication.p_value,
      discordant: adjudication.discordant,
      significant: adjudication.p_value < 0.05,
    },
    // One sentence, assembled from the live numbers, that a reader can quote
    // without misrepresenting the study.
    status: significant
      ? 'People agreed with this space where the framework predicted they would.'
      : 'Interim: people agreed with the framework more often than chance in the sample so far, ' +
        'but not by enough to rule out chance on the test that counts each participant once.',
  }
}

/* -------------------------------------------------------------------- helpers */

function euclid(a, b) {
  let s = 0
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2
  return Math.sqrt(s)
}

function shareOf(contributions) {
  const total = contributions.reduce((s, v) => s + v, 0)
  return contributions.map((v) => (total > 0 ? v / total : 0))
}

// Bearings come out of atan2 in (−π, π]; a compass reading is 0–360. Wrapping
// here rather than at each display site means a heading is one number
// everywhere, and 315.81° is never also −44.19°.
function normaliseDegrees(deg) {
  return ((deg % 360) + 360) % 360
}

function distanceToRing(point, ring) {
  let min = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distanceToSegment(point, ring[j], ring[i])
    if (d < min) min = d
  }
  return min
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const round = (v, d) => Number(v.toFixed(d))
