#!/usr/bin/env node
// Do people perceive the four dimensions the way the geometry measures them?
//
//   npm run validate:ratings
//   npm run validate:ratings -- --quick
//
// This is a validation step, NOT part of the weight fit. The weights in
// analysis-panoramic.json come from the triplet task alone, with every plaza
// placed by measured geometry. Nothing here feeds back into them.
//
// What it asks instead: for each of the four dimensions, does the plaza that
// the engine calls larger / more compact / more occluded / more enclosed also
// read that way to the people who stood in it? Each plaza gets one mean rating
// per scale from the participants who saw it, and that is correlated against
// the computed value across the 18 plazas.
//
// The result licenses how each weight may be READ. A dimension that correlates
// well is one where a weight means "people used this property". A dimension
// that does not is one where a weight can only mean "this number happened to
// separate the plazas" — the construct and the measurement have come apart,
// and the thesis has to say so rather than name the weight after the percept.
//
// ------------------------------------------------------------------ direction
//
// The scales are bipolar and plain-language, and one of them runs BACKWARDS
// relative to its metric. Occlusivity is metres of view-blocking edge, so more
// is more hidden — but the scale's 7 end reads "Clear sightlines, nothing
// hidden", which is LESS occlusivity. A raw r of −0.6 there is strong
// agreement, not disagreement. EXPECTED_SIGN below encodes this once, and the
// reported `aligned r` is the raw r multiplied by it, so all four numbers mean
// the same thing: positive is agreement, negative is contradiction.
//
// ------------------------------------------------------------------- ceiling
//
// A low correlation has two very different causes and they must not be
// confused. The metric may be a poor formalisation of the percept — or the
// participants may simply not have agreed with each other, in which case there
// is no stable percept for any formula to match. Split-half reliability
// separates them: it correlates the mean ratings from one random half of the
// participants against the other half's, Spearman–Brown corrected up to the
// full sample. That is the ceiling. No measurement can correlate with a group
// mean better than that mean correlates with itself.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites } from '../src/lib/site.js'
import { mulberry32 } from '../src/lib/triplets.js'
import { METRICS, METRIC_LABELS, buildFingerprints } from '../src/lib/analysis/fingerprints.js'
import { RATING_SCALES, RATING_MIN, RATING_MAX } from '../src/lib/survey360.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const args = new Set(process.argv.slice(2))
const QUICK = args.has('--quick')

const FOV_MODE = 'perceptual_360'
const RESPONSES = 'src/data/survey-responses-360.json'

// +1 where the scale's 7 end is the metric's high end, −1 where it is reversed.
// Derived from RATING_SCALES rather than restated, so a reworded anchor cannot
// silently flip a result — see the assertion in main().
const EXPECTED_SIGN = {
  area: +1, // "Spacious and open" = large isovist
  compactness: +1, // "Compact, regular shape" = high 4πA/P²
  occlusivity: -1, // "Clear sightlines, nothing hidden" = LOW occluding edge
  enclosure: +1, // "Tall walls, strongly enclosed" = high subtended angle
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length

function pearson(xs, ys) {
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

// Average ranks for ties, so repeated values cannot bias the rank correlation.
function ranks(vs) {
  const order = vs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(vs.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k][1]] = r
    i = j + 1
  }
  return out
}

const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys))

// Assumption-free p-value: how often does shuffling the plaza labels produce a
// correlation at least this extreme? With 18 plazas the usual t-approximation
// is workable but the permutation costs nothing and assumes nothing.
function permutationP(xs, ys, observed, correlate, { shuffles, seed }) {
  const rng = mulberry32(seed)
  const y = [...ys]
  let atLeastAsExtreme = 0
  for (let s = 0; s < shuffles; s++) {
    for (let i = y.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[y[i], y[j]] = [y[j], y[i]]
    }
    if (Math.abs(correlate(xs, y)) >= Math.abs(observed) - 1e-12) atLeastAsExtreme++
  }
  // +1 in both terms: the observed arrangement is itself one of the possible
  // ones, and this keeps p strictly above zero.
  return (atLeastAsExtreme + 1) / (shuffles + 1)
}

// 95% interval on Pearson r via the Fisher z transform. `sign` aligns the
// interval the same way the point estimate is aligned; negating reverses an
// interval, so the bounds are swapped back into order rather than left as a
// backwards pair that no longer reads as an interval at all.
function fisherCI(r, n, sign = 1) {
  if (n < 4 || Math.abs(r) >= 1) return { lo: null, hi: null }
  const z = 0.5 * Math.log((1 + r) / (1 - r))
  const se = 1 / Math.sqrt(n - 3)
  const t = (v) => (Math.exp(2 * v) - 1) / (Math.exp(2 * v) + 1)
  const a = t(z - 1.96 * se) * sign
  const b = t(z + 1.96 * se) * sign
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a }
}

// Resamples PARTICIPANTS with replacement and recomputes the correlation each
// time, so the interval reflects the fact that each plaza's mean rating is an
// estimate from ~35 people rather than a known quantity.
//
// This is the interval that matters here, and it is not the Fisher one. Fisher
// treats the mean ratings as fixed and asks only how much 18 plazas pin down a
// correlation; it is blind to the possibility that a different 40 participants
// would have produced different means. Watching the correlations move as the
// sample grew from 20 to 30 to 40 showed exactly that: area and enclosure
// barely shifted, while compactness went 0.23 → 0.12 → 0.52 and occlusivity
// −0.53 → −0.49 → −0.18. Both intervals are reported, because they answer
// different questions and a dimension is only well established when both are
// narrow.
function bootstrapCorrelation(flat, siteIds, scale, computedFor, sign, { resamples, seed }) {
  const rng = mulberry32(seed)
  const ids = [...new Set(flat.map((r) => r.participant))]
  const byParticipant = new Map(ids.map((id) => [id, flat.filter((r) => r.participant === id && r.scale === scale)]))
  const draws = []

  for (let b = 0; b < resamples; b++) {
    const bag = {}
    for (let i = 0; i < ids.length; i++) {
      for (const row of byParticipant.get(ids[Math.floor(rng() * ids.length)])) {
        ;(bag[row.site] ??= []).push(row.value)
      }
    }
    const xs = []
    const ys = []
    for (const id of siteIds) {
      const computed = computedFor(id)
      if (!bag[id]?.length || computed == null) continue
      xs.push(computed)
      ys.push(mean(bag[id]))
    }
    // A resample that happens to cover too few plazas cannot support a
    // correlation; dropping it is honest, and the kept count is reported.
    if (xs.length < 6) continue
    draws.push(pearson(xs, ys) * sign)
  }

  if (!draws.length) return { lo: null, hi: null, pPositive: null, draws: 0 }
  draws.sort((a, b) => a - b)
  return {
    lo: draws[Math.floor(0.025 * draws.length)],
    hi: draws[Math.min(draws.length - 1, Math.floor(0.975 * draws.length))],
    pPositive: draws.filter((v) => v > 0).length / draws.length,
    draws: draws.length,
  }
}

// How well the group mean agrees with itself. Participants are split at random
// into halves, each half's per-plaza mean is taken, and the two are correlated
// across plazas; Spearman–Brown scales that half-sample figure up to the
// reliability of the full sample. Averaged over many splits so the answer does
// not depend on one lucky partition.
//
// Only plazas rated by at least one participant in BOTH halves can contribute,
// which is why the count is reported alongside.
function splitHalfReliability(perParticipant, siteIds, scale, { splits, seed }) {
  const rng = mulberry32(seed)
  const ids = [...new Set(perParticipant.map((r) => r.participant))]
  const estimates = []
  let minPlazas = Infinity

  for (let s = 0; s < splits; s++) {
    const shuffled = [...ids]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const halfA = new Set(shuffled.slice(0, Math.floor(shuffled.length / 2)))

    const a = []
    const b = []
    for (const id of siteIds) {
      const rows = perParticipant.filter((r) => r.site === id && r.scale === scale)
      const va = rows.filter((r) => halfA.has(r.participant)).map((r) => r.value)
      const vb = rows.filter((r) => !halfA.has(r.participant)).map((r) => r.value)
      if (!va.length || !vb.length) continue
      a.push(mean(va))
      b.push(mean(vb))
    }
    minPlazas = Math.min(minPlazas, a.length)
    if (a.length < 4) continue

    const rHalf = pearson(a, b)
    // Spearman–Brown: two half-samples were correlated, the study reports the
    // full sample's mean, which is more reliable than either half.
    const rFull = (2 * rHalf) / (1 + rHalf)
    estimates.push(Math.max(-1, Math.min(1, rFull)))
  }

  return estimates.length
    ? { reliability: mean(estimates), splits: estimates.length, minPlazas }
    : { reliability: null, splits: 0, minPlazas: null }
}

// Holm–Bonferroni. Four dimensions are tested on one dataset, so the chance of
// at least one spurious "significant" result is well above 5% if each is read
// at 0.05 on its own. Holm controls that without the blunt loss of power of a
// plain Bonferroni divide-by-four.
function holm(entries) {
  const sorted = [...entries].sort((a, b) => a.p - b.p)
  let running = 0
  return sorted.map((e, i) => {
    running = Math.max(running, (sorted.length - i) * e.p)
    return { ...e, pAdjusted: Math.min(1, running) }
  })
}

function main() {
  // The anchors are the source of truth for direction. If a scale is reworded
  // so its high end no longer matches the sign asserted above, this stops the
  // run rather than silently reporting a flipped correlation.
  for (const scale of RATING_SCALES) {
    if (!(scale.metric in EXPECTED_SIGN)) {
      throw new Error(`Scale "${scale.id}" has no declared direction in EXPECTED_SIGN.`)
    }
  }
  if (RATING_SCALES.length !== METRICS.length) {
    throw new Error('Every metric needs exactly one rating scale for this validation to be complete.')
  }

  const sites = read('src/data/sites.json')
  const readings = read('src/data/results.json')
  let records = read(RESPONSES)
  const siteIds = activeSites(sites).map((s) => s.id)

  // --limit=N restricts to the first N participants by start time, so the same
  // validation can be run at an earlier sample size and compared like for like.
  const limitArg = [...args].find((a) => a.startsWith('--limit='))?.split('=')[1]
  if (limitArg) {
    records = [...records]
      .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))
      .slice(0, Number(limitArg))
  }
  const nameById = new Map(sites.map((s) => [s.id, s.name ?? s.id]))

  const { fingerprints } = buildFingerprints(readings, siteIds, FOV_MODE)
  const rawByMetric = {}
  for (const m of METRICS) rawByMetric[m] = new Map()
  for (const r of readings) {
    if (r.fov_mode !== FOV_MODE || r.canonical !== true) continue
    rawByMetric.area.set(r.site_id, r.area_m2)
    rawByMetric.compactness.set(r.site_id, r.compactness)
    rawByMetric.occlusivity.set(r.site_id, r.occlusivity_m)
    rawByMetric.enclosure.set(r.site_id, r.enclosure_ratio)
  }

  // Flat list of every rating, one row per participant × plaza × scale.
  const flat = []
  for (const rec of records) {
    for (const row of rec.rating_responses ?? []) {
      if (row.value == null || row.value < RATING_MIN || row.value > RATING_MAX) continue
      flat.push({
        participant: rec.participant_id ?? row.participant_id,
        site: row.site_id,
        scale: row.scale,
        value: row.value,
        anchor: row.anchor_direction,
      })
    }
  }

  const shuffles = QUICK ? 2000 : 20000
  const splits = QUICK ? 200 : 2000

  console.log('Rating validation — do the ratings track the geometry?')
  console.log(`  ${RESPONSES} × fov_mode ${FOV_MODE}`)
  console.log(`  ${records.length} participants, ${flat.length} ratings, ${siteIds.length} plazas\n`)

  // Position-bias check. The scale direction is randomised per participant, so
  // if which side the high anchor was drawn on moves the answers, the ratings
  // carry an artefact of presentation and every correlation below is suspect.
  {
    const byAnchor = { low_left: [], high_left: [] }
    for (const r of flat) if (byAnchor[r.anchor]) byAnchor[r.anchor].push(r.value)
    const mLow = byAnchor.low_left.length ? mean(byAnchor.low_left) : null
    const mHigh = byAnchor.high_left.length ? mean(byAnchor.high_left) : null
    if (mLow != null && mHigh != null) {
      const diff = Math.abs(mLow - mHigh)
      console.log(
        `  anchor position check: mean ${mLow.toFixed(2)} when low drawn left, ` +
          `${mHigh.toFixed(2)} when high drawn left (Δ ${diff.toFixed(2)} of 6)` +
          `${diff > 0.5 ? '   ⚠ possible position bias' : ''}\n`
      )
    }
  }

  const rows = []
  for (const scale of RATING_SCALES) {
    const m = scale.metric
    const xs = []
    const ys = []
    const perSite = []

    for (const id of siteIds) {
      const vals = flat.filter((r) => r.site === id && r.scale === scale.id).map((r) => r.value)
      const computed = rawByMetric[m].get(id)
      if (!vals.length || computed == null) continue
      xs.push(computed)
      ys.push(mean(vals))
      perSite.push({
        site_id: id,
        name: nameById.get(id),
        computed,
        normalised: fingerprints.get(id)?.[METRICS.indexOf(m)] ?? null,
        mean_rating: mean(vals),
        n_raters: vals.length,
      })
    }

    const sign = EXPECTED_SIGN[m]
    const rP = pearson(xs, ys)
    const rS = spearman(xs, ys)
    const rel = splitHalfReliability(flat, siteIds, scale.id, { splits, seed: 4242 })
    const boot = bootstrapCorrelation(flat, siteIds, scale.id, (id) => rawByMetric[m].get(id), sign, {
      resamples: QUICK ? 300 : 2000,
      seed: 7000 + METRICS.indexOf(m),
    })

    // Attenuation correction: what the correlation would be if the ratings
    // carried no sampling noise. An estimate of the ceiling, not a result — it
    // divides by a quantity that is itself estimated, so it is unstable when
    // reliability is low, and is reported only to show how much of a weak
    // correlation is the metric's fault rather than the raters'.
    const disattenuated =
      rel.reliability != null && rel.reliability > 0.1
        ? (rP * sign) / Math.sqrt(rel.reliability)
        : null

    rows.push({
      metric: m,
      label: METRIC_LABELS[m],
      anchors: { low: scale.low, high: scale.high },
      expected_sign: sign,
      n_plazas: xs.length,
      ratings_per_plaza: perSite.length ? mean(perSite.map((s) => s.n_raters)) : 0,
      pearson_raw: rP,
      pearson_aligned: rP * sign,
      // Stored ALIGNED, to match pearson_aligned — the raw r is kept alongside
      // for anyone checking the arithmetic, but the interval a reader plots
      // should be the one that matches the number they are reading.
      pearson_ci: fisherCI(rP, xs.length, sign),
      pearson_p: permutationP(xs, ys, rP, pearson, { shuffles, seed: 1000 + METRICS.indexOf(m) }),
      spearman_raw: rS,
      spearman_aligned: rS * sign,
      spearman_p: permutationP(xs, ys, rS, spearman, { shuffles, seed: 2000 + METRICS.indexOf(m) }),
      participant_bootstrap: boot,
      reliability: rel.reliability,
      reliability_splits: rel.splits,
      disattenuated_pearson: disattenuated,
      per_site: perSite,
    })
  }

  const adjusted = holm(rows.map((r) => ({ metric: r.metric, p: r.pearson_p })))
  for (const r of rows) r.pearson_p_holm = adjusted.find((a) => a.metric === r.metric).pAdjusted

  // ------------------------------------------------------------------ report

  const f = (v, d = 3) => (v == null ? '  —  ' : (v >= 0 ? ' ' : '') + v.toFixed(d))
  console.log('  Correlation of mean rating against computed value, across plazas')
  console.log(
    '  dimension'.padEnd(18) +
      'r'.padStart(8) +
      'rho'.padStart(8) +
      'p(Holm)'.padStart(9) +
      'ceiling'.padStart(9) +
      '   95% CI (plazas)'.padEnd(21) +
      '95% CI (raters)'
  )
  for (const r of rows) {
    const ci = r.pearson_ci
    const b = r.participant_bootstrap
    const ciTxt = ci.lo == null ? '' : `[${ci.lo.toFixed(2)}, ${ci.hi.toFixed(2)}]`
    const bTxt = b.lo == null ? '' : `[${b.lo.toFixed(2)}, ${b.hi.toFixed(2)}]`
    console.log(
      ('  ' + r.label).padEnd(18) +
        f(r.pearson_aligned).padStart(8) +
        f(r.spearman_aligned).padStart(8) +
        r.pearson_p_holm.toFixed(4).padStart(9) +
        f(r.reliability, 2).padStart(9) +
        `   ${ciTxt}`.padEnd(21) +
        bTxt
    )
  }

  console.log(
    '\n  r and rho are ALIGNED: positive always means the ratings agree with the\n' +
      '  geometry. Occlusivity\'s scale runs backwards (its 7 end is "clear\n' +
      '  sightlines", i.e. LOW occlusivity), so its raw r is negated to match.\n' +
      '  "ceiling" is split-half reliability — the most any measurement could\n' +
      '  correlate with these ratings, given how much the raters agreed.\n' +
      '  The two intervals answer different questions: (plazas) asks how well 18\n' +
      '  plazas pin the number down, (raters) asks whether a different 40 people\n' +
      '  would have given the same answer. A dimension is only established when\n' +
      '  BOTH are narrow and clear of zero.'
  )

  console.log('\n  Reading each dimension')
  for (const r of rows) {
    const a = r.pearson_aligned
    const rel = r.reliability
    const b = r.participant_bootstrap
    // "Established" demands both intervals stay on one side of zero — a result
    // that survives only one of the two is a result waiting to move.
    const plazaClear = r.pearson_ci.lo != null && r.pearson_ci.lo > 0
    const raterClear = b.lo != null && b.lo > 0
    const wide = b.lo != null && b.hi - b.lo > 0.35

    let verdict
    if (rel != null && rel < 0.4) {
      verdict = 'raters did not agree — no stable percept to match, metric untested'
    } else if (plazaClear && raterClear && r.pearson_p_holm < 0.05) {
      verdict = 'ESTABLISHED — people perceive this as the geometry measures it'
    } else if (raterClear && wide) {
      verdict = 'positive but UNSTABLE — real direction, magnitude not yet pinned down'
    } else if (b.pPositive != null && b.pPositive < 0.2 && a < 0) {
      verdict = 'leans AGAINST the geometry — people are not reading what we measure'
    } else if (b.lo != null && b.lo < 0 && b.hi > 0) {
      verdict = 'no reliable relationship — interval spans zero'
    } else {
      verdict = 'weak — points the right way but not established'
    }
    console.log(`  ${r.label.padEnd(16)} ${verdict}`)
    if (rel != null && rel >= 0.6 && Math.abs(a) < 0.35) {
      console.log(
        `  ${''.padEnd(16)}   raters agreed strongly (${rel.toFixed(2)}) — the percept is real and stable,`
      )
      console.log(`  ${''.padEnd(16)}   so the gap is in the METRIC, not in the participants.`)
    }
  }

  console.log(
    `\n  With ${rows[0].n_plazas} plazas, r must exceed about 0.47 to reach p < 0.05 on its own,\n` +
      '  and more once Holm corrects for testing four dimensions. A dimension that\n' +
      '  fails here is not thereby unimportant — it means the NUMBER and the\n' +
      '  PERCEPT have come apart, so any weight it carries in the fit describes\n' +
      '  the measurement, not the experience.'
  )

  // Has the answer settled, or is it still moving? Recomputing the correlation
  // on the first N participants in the order they actually arrived shows
  // whether more data is still changing the conclusion. A correlation that has
  // converged barely moves across the last two steps; one that is still
  // swinging is not yet a result, however good its final value looks.
  //
  // This is not a peek at the future — every prefix uses only data already
  // collected, and the order is submission order, fixed before any analysis.
  const ordered = [...records].sort((a, b) =>
    (a.submitted_at ?? a.started_at ?? '').localeCompare(b.submitted_at ?? b.started_at ?? '')
  )
  const checkpoints = [10, 20, 30, records.length].filter(
    (n, i, arr) => n <= records.length && arr.indexOf(n) === i
  )
  const trajectory = {}
  for (const scale of RATING_SCALES) {
    trajectory[scale.metric] = checkpoints.map((n) => {
      const bag = {}
      for (const rec of ordered.slice(0, n)) {
        for (const row of rec.rating_responses ?? []) {
          if (row.scale === scale.id && row.value != null) (bag[row.site_id] ??= []).push(row.value)
        }
      }
      const xs = []
      const ys = []
      for (const id of siteIds) {
        const c = rawByMetric[scale.metric].get(id)
        if (!bag[id]?.length || c == null) continue
        xs.push(c)
        ys.push(mean(bag[id]))
      }
      return { participants: n, plazas: xs.length, r: xs.length >= 6 ? pearson(xs, ys) * EXPECTED_SIGN[scale.metric] : null }
    })
  }

  console.log('\n  Has it settled? Correlation recomputed as participants accumulated')
  console.log('  dimension'.padEnd(18) + checkpoints.map((n) => `n=${n}`.padStart(9)).join(''))
  for (const scale of RATING_SCALES) {
    const t = trajectory[scale.metric]
    const lastTwo = t.slice(-2).map((p) => p.r)
    const drift = lastTwo.every((v) => v != null) ? Math.abs(lastTwo[1] - lastTwo[0]) : null
    console.log(
      ('  ' + METRIC_LABELS[scale.metric]).padEnd(18) +
        t.map((p) => f(p.r).padStart(9)).join('') +
        (drift != null && drift > 0.15 ? '    ⚠ still moving' : drift != null ? '    settled' : '')
    )
  }

  const out = {
    generated_at: new Date().toISOString(),
    stability_trajectory: trajectory,
    purpose:
      'Independent validation that the computed metrics track what participants perceived. ' +
      'Does not enter the weight fit.',
    fov_mode: FOV_MODE,
    responses: RESPONSES,
    participants: records.length,
    ratings: flat.length,
    permutation_shuffles: shuffles,
    reliability_splits: splits,
    scales: rows,
  }
  const outFile = `src/data/rating-validation${limitArg ? `-n${records.length}` : ''}${QUICK ? '-quick' : ''}.json`
  writeJsonAtomic(path.join(root, outFile), out)
  console.log(`\nWrote ${outFile}`)
}

main()
