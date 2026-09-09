// P8 — builds the frozen matched-view trial bank.
//
//   npm run trials:matched-view
//   → src/data/matched-view-trials.json
//
// WHY THIS IS A BATCH SCRIPT AND P7'S ARITHMETIC IS NOT.
//
// P7 computes its distances live in the browser, deliberately, because the
// numbers have to respond while views are being placed. A survey instrument is
// the opposite case. The bank is the study's stimulus set: every participant
// must judge the same trials, and a trial's prediction must be the one that was
// current when it was answered. If the bank were derived live from
// view-clouds.json, nudging one marker after data collection began would
// silently change what earlier participants had been asked, and there would be
// no way afterwards to say which version anyone saw. So it is computed once,
// written to disk with its provenance, and read as a fixed file.
//
// WHAT IT SELECTS. For every ordered pair of candidate plazas (B, C) against a
// reference view in plaza A, each candidate is represented by its own view
// nearest the reference — see lib/matchedView.js for why that constraint is
// what makes the trial fair to all three measures. The trial is then labelled:
//
//   agreement      centroid, gaussian and chamfer all name the same candidate
//   discriminating centroid and gaussian agree, chamfer names the other one
//
// Trials where centroid and gaussian split from EACH OTHER are discarded rather
// than kept as a third stratum. They exist, but they test the two cloud-level
// measures against one another, which is not this phase's question, and a third
// stratum would take trials from the two that are.
//
// HOW IT CHOOSES AMONG THOUSANDS. Roughly 12,000 agreement and 5,700 clean
// discriminating trials are available, far more than a bank needs. Selection is
// on three criteria, in this order:
//
//   1. A margin floor, everywhere. A trial where the measures prefer their
//      candidate by 0.001 is not evidence about anything; it is a coin flip
//      wearing a prediction, and it drags every accuracy toward 50% no matter
//      how carefully a participant judged. MIN_STRENGTH drops those before
//      anything else is considered.
//   2. Balance. Every plaza serves as reference the same number of times, and
//      candidate appearances are levelled by a greedy least-used-first pass.
//      Without this the bank concentrates on whichever plazas happen to sit at
//      the extremes of the weighted space — a first run put one plaza in 39
//      trials and another in 6 — and the result would describe those squares
//      rather than the corpus.
//   3. Decisiveness, for discriminating trials. Ranked by the SMALLER of the
//      view-level and cloud-level margins, strongest first, so a trial only
//      qualifies when BOTH sides of the disagreement are confident. This makes
//      the discriminating accuracy an estimate on DECISIVE disagreements rather
//      than on all disagreements, which is a deliberate trade of generality for
//      power and is reported as such.
//   4. Margin spread, for agreement trials. Sampled ACROSS the margin range in
//      equal-count bins rather than from its top, because this stratum carries
//      the study's substitute for the attention check it does not run: accuracy
//      has to be measurable as a function of margin, which needs easy and hard
//      trials side by side. A flat line through one x value says nothing.
//
// SEEDED. Every random choice runs off a fixed seed, so re-running the script on
// unchanged inputs reproduces the bank byte for byte and a diff means an input
// actually changed.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites } from '../src/lib/site.js'
import { buildClouds, TARGET_PER_SITE } from '../src/lib/viewClouds.js'
import {
  centroidDistance,
  gaussianDistance,
  whiten,
} from '../src/lib/analysis/clouds.js'
import {
  MATCHED_VIEW_FOV_MODE,
  MATCHED_VIEW_VERSION,
  hashString,
  mulberry32,
  validateTrialBank,
} from '../src/lib/matchedView.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dirname, '..')
const read = (p) => JSON.parse(readFileSync(path.resolve(root, p), 'utf8'))

const OUT = 'src/data/matched-view-trials.json'
const SEED = 'matched-view-bank-v1'

// How many trials the bank holds per stratum.
//
// Sized against the instrument, not chosen for roundness. Each participant
// answers TRIALS_PER_STRATUM (6) per stratum, so with a target of 30–50
// participants the bank collects 180–300 judgements per stratum however large
// it is; what the bank size actually decides is how those judgements are SPREAD.
// A larger bank covers more of the corpus but leaves each individual trial with
// one or two answers, which makes the per-trial agreement table unreadable.
//
// 54 is three trials per plaza as reference — every one of the 18 plazas still
// anchors its own trials, while each trial collects roughly three to six
// independent judgements. That is the balance point between corpus coverage and
// per-trial replication; the pooled analyses are unaffected either way.
const PER_STRATUM = 54
const PER_SITE = PER_STRATUM / 18

// The smallest normalised margin a trial may carry and still be asked.
//
// `strength` is the weakest of a trial's three margins, each expressed as a
// fraction of its own measure's mean distance. Below this the measures are
// effectively tied, and a participant's answer carries no information about
// whether the prediction was right — it is noise entering the numerator and the
// denominator alike. A first run without this floor put 26 of 72 agreement
// trials under 0.02, which would have pinned that stratum near chance for a
// reason that has nothing to do with perception.
//
// 0.05 is a twentieth of a typical distance, chosen as the point where the
// prediction is at least nominally a claim; it is not tuned against any result,
// and the full pool sizes above and below it are written into the bank.
const MIN_STRENGTH = 0.05

// How far down the preference order the candidate-balance pass may reach.
//
// Balance is a tiebreak among comparable trials, never an override: allowing it
// to pick freely from the whole list would let it trade away a decisive trial
// for an indecisive one purely to level a count. A window of 40, against pools
// of thousands, keeps every chosen trial near the top of its ranking while
// leaving the pass real room to spread the candidates.
const BALANCE_WINDOW = 40

const euclid = (a, b) => {
  let s = 0
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2
  return Math.sqrt(s)
}

function main() {
  const readings = read('src/data/results.json')
  const sites = read('src/data/sites.json')
  const cloudFile = read('src/data/view-clouds.json')
  const analysis = read('src/data/analysis-panoramic.json')

  const weights = analysis.fit.weights_normalised
  const active = activeSites(sites)
  const activeIds = active.map((s) => s.id)
  const nameById = new Map(active.map((s) => [s.id, s.name]))

  const built = buildClouds(readings, cloudFile.markers, activeIds)
  const siteIds = built.siteIds

  // Every cloud must be complete before a bank is built. A plaza with three
  // views and a plaza with eight are not being offered to participants on equal
  // terms, and no amount of care in the selection below can repair that.
  const short = siteIds.filter((id) => built.clouds.get(id).markers.length < TARGET_PER_SITE)
  if (short.length) {
    throw new Error(
      `Cannot build a trial bank: ${short.length} cloud(s) below the ${TARGET_PER_SITE}-view ` +
        `target — ${short.join(', ')}. Finish placing views on the P7 page first.`
    )
  }

  // Whitened once. Every distance below is then ordinary Euclidean geometry in
  // the P5-weighted space, and no step can apply the weights differently from
  // another. Same arrangement as clouds.js.
  const whitened = new Map(
    siteIds.map((id) => [id, whiten(built.clouds.get(id).points, weights)])
  )

  // Plaza-level distance matrices — what the two cloud measures predict from.
  const centroidD = new Map()
  const gaussianD = new Map()
  for (let i = 0; i < siteIds.length; i++) {
    for (let j = i + 1; j < siteIds.length; j++) {
      const a = siteIds[i]
      const b = siteIds[j]
      const pa = built.clouds.get(a).points
      const pb = built.clouds.get(b).points
      const c = centroidDistance(pa, pb, weights)
      const g = gaussianDistance(pa, pb, weights)
      centroidD.set(key(a, b), c)
      gaussianD.set(key(a, b), g)
    }
  }

  // Margins from the three measures live on different scales, so a raw
  // difference cannot be compared across them. Each is divided by the mean
  // off-diagonal distance of its own measure, which makes "decisive" mean the
  // same thing for a view-level margin as for a Gaussian one.
  const viewScale = meanNearestViewDistance(siteIds, whitened)
  const centroidScale = mean([...centroidD.values()])
  const gaussianScale = mean([...gaussianD.values()])

  const candidates = enumerateTrials({
    siteIds,
    whitened,
    centroidD,
    gaussianD,
    viewScale,
    centroidScale,
    gaussianScale,
  })

  const rng = mulberry32(hashString(SEED))
  const agreement = selectAgreement(candidates.agreement, rng)
  const discriminating = selectDiscriminating(candidates.discriminating, rng)

  const trials = [...agreement, ...discriminating].map((t) =>
    materialise(t, built, nameById, cloudFile)
  )

  const bank = {
    version: MATCHED_VIEW_VERSION,
    generated_at: new Date().toISOString(),
    seed: SEED,
    fov_mode: MATCHED_VIEW_FOV_MODE,
    // Provenance, so a bank can always be traced to the inputs that produced it
    // and a stale one is visible rather than assumed current.
    source: {
      weights,
      weights_from: 'analysis-panoramic.json · fit.weights_normalised',
      view_clouds_updated_at: cloudFile.updated_at ?? null,
      marker_count: cloudFile.markers.length,
      site_count: siteIds.length,
      views_per_site: TARGET_PER_SITE,
      bounds: built.bounds,
    },
    scales: {
      view: viewScale,
      centroid: centroidScale,
      gaussian: gaussianScale,
    },
    selection: {
      min_strength: MIN_STRENGTH,
      balance_window: BALANCE_WINDOW,
      per_stratum: PER_STRATUM,
      per_site: PER_SITE,
      agreement_rule: 'equal-count strength bins, spanning the range',
      discriminating_rule: 'most decisive first',
    },
    pool: {
      agreement: candidates.agreement.length,
      discriminating: candidates.discriminating.length,
      // How much of each pool the margin floor removes. Recorded so the floor
      // can be argued with from the numbers rather than taken on trust.
      agreement_below_floor: candidates.agreement.filter((t) => t.strength < MIN_STRENGTH).length,
      discriminating_below_floor: candidates.discriminating.filter((t) => t.strength < MIN_STRENGTH)
        .length,
      // Trials where the two cloud measures split from each other. Counted and
      // reported rather than silently dropped, so the share of the space this
      // bank declines to use is on the record.
      cloud_measures_split: candidates.cloudSplit,
    },
    trials,
  }

  validateTrialBank(bank)
  writeJsonAtomic(path.resolve(root, OUT), bank)

  report(bank)
}

const key = (a, b) => (a < b ? `${a} ${b}` : `${b} ${a}`)
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length

// The typical distance between a view and its nearest counterpart in another
// plaza — the scale a view-level margin is judged against.
function meanNearestViewDistance(siteIds, whitened) {
  const out = []
  for (const a of siteIds) {
    for (const r of whitened.get(a)) {
      for (const b of siteIds) {
        if (b === a) continue
        let best = Infinity
        for (const p of whitened.get(b)) {
          const d = euclid(r, p)
          if (d < best) best = d
        }
        out.push(best)
      }
    }
  }
  return mean(out)
}

// Every trial the corpus admits, sorted into strata. Around 20,000 of them at
// 18 plazas by 8 views, which is instant to enumerate and needs no pruning.
function enumerateTrials({
  siteIds,
  whitened,
  centroidD,
  gaussianD,
  viewScale,
  centroidScale,
  gaussianScale,
}) {
  const agreement = []
  const discriminating = []
  let cloudSplit = 0

  for (const refSite of siteIds) {
    const refViews = whitened.get(refSite)
    for (let refIndex = 0; refIndex < refViews.length; refIndex++) {
      const r = refViews[refIndex]
      for (let i = 0; i < siteIds.length; i++) {
        const B = siteIds[i]
        if (B === refSite) continue
        for (let j = i + 1; j < siteIds.length; j++) {
          const C = siteIds[j]
          if (C === refSite) continue

          // Each candidate plaza is represented by its own view nearest the
          // reference — the constraint that keeps the trial fair to the
          // cloud-level measures.
          const bBest = nearest(r, whitened.get(B))
          const cBest = nearest(r, whitened.get(C))

          const viewPick = bBest.distance < cBest.distance ? 'a' : 'b'
          const cenB = centroidD.get(key(refSite, B))
          const cenC = centroidD.get(key(refSite, C))
          const gauB = gaussianD.get(key(refSite, B))
          const gauC = gaussianD.get(key(refSite, C))
          const cenPick = cenB < cenC ? 'a' : 'b'
          const gauPick = gauB < gauC ? 'a' : 'b'

          if (cenPick !== gauPick) {
            cloudSplit++
            continue
          }

          const trial = {
            refSite,
            refIndex,
            candidates: [
              { siteId: B, viewIndex: bBest.index, distance: bBest.distance },
              { siteId: C, viewIndex: cBest.index, distance: cBest.distance },
            ],
            predictions: { centroid: cenPick, gaussian: gauPick, chamfer: viewPick },
            margins: {
              view: Math.abs(bBest.distance - cBest.distance) / viewScale,
              centroid: Math.abs(cenB - cenC) / centroidScale,
              gaussian: Math.abs(gauB - gauC) / gaussianScale,
            },
          }
          // The weakest link in a trial's evidence. For a discriminating trial
          // this is what decides whether it is worth a participant's time; for
          // an agreement trial it is the axis accuracy is plotted against.
          trial.strength = Math.min(
            trial.margins.view,
            trial.margins.centroid,
            trial.margins.gaussian
          )

          if (viewPick === cenPick) agreement.push(trial)
          else discriminating.push(trial)
        }
      }
    }
  }

  return { agreement, discriminating, cloudSplit }
}

function nearest(point, cloud) {
  let best = { index: -1, distance: Infinity }
  for (let i = 0; i < cloud.length; i++) {
    const d = euclid(point, cloud[i])
    if (d < best.distance) best = { index: i, distance: d }
  }
  return best
}

// Discriminating trials: the most decisive ones, balanced across plazas.
//
// Ranked by `strength`, the smaller of the view-level and cloud-level margins,
// so a trial only qualifies when BOTH sides of the disagreement are confident.
// A trial where chamfer is sure and centroid is nearly indifferent is not an
// adjudication between them — it is chamfer answering a question centroid never
// really asked.
function selectDiscriminating(pool, rng) {
  return balancedPick(pool, rng, 'strongest')
}

// Agreement trials: spread across the margin range, not skimmed off the top.
//
// These carry the study's substitute for an attention check — see MIN_STRENGTH
// and accuracyByMargin(). Each reference plaza's eligible trials are cut into
// PER_SITE equal-count bins by strength and one trial is taken from each, so
// the stratum spans near-threshold to obvious by construction rather than by
// luck of the ranking.
function selectAgreement(pool, rng) {
  return balancedPick(pool, rng, 'spread')
}

// PER_SITE trials for every plaza as reference, preferring distinct reference
// views and levelling candidate appearances.
//
// Balance is enforced per reference plaza rather than globally because the
// reference is what a trial is "about": a bank where Alexanderplatz is the
// reference twelve times and Naschmarkt never would measure the model on
// Alexanderplatz. Candidate balance cannot be exact — which plazas can serve as
// a candidate depends on the reference — so it is a greedy least-used-first
// choice within a quality window, not a constraint.
function balancedPick(pool, rng, mode) {
  const byRef = new Map()
  for (const t of pool) {
    // The margin floor, applied before anything else looks at the trial.
    if (t.strength < MIN_STRENGTH) continue
    if (!byRef.has(t.refSite)) byRef.set(t.refSite, [])
    byRef.get(t.refSite).push(t)
  }

  const candidateUse = new Map()
  const timesUsed = (id) => candidateUse.get(id) ?? 0
  const cost = (t) => timesUsed(t.candidates[0].siteId) + timesUsed(t.candidates[1].siteId)

  const chosen = []
  // Reference plazas are visited in a seeded random order, so whichever plaza
  // goes first does not systematically get the least-contended candidates.
  for (const refSite of shuffleWith([...byRef.keys()], rng)) {
    const group = byRef.get(refSite)
    // `slots` is a list of preference-ordered pools, one per trial to be taken.
    // For 'strongest' every slot draws from the same descending ranking; for
    // 'spread' each slot draws from its own strength bin, which is what
    // guarantees the range.
    const slots = mode === 'spread' ? strengthBins(group) : strongestSlots(group)

    const usedViews = new Set()
    const taken = new Set()
    for (const slot of slots) {
      // Two passes. The first insists on a distinct reference view, so a
      // plaza's four trials look at four different places within it rather than
      // asking about one corner four times. The second fills any shortfall
      // without that constraint — a small plaza may simply not offer four
      // qualifying views, and an unfilled slot would break the reference
      // balance this pass exists to keep.
      let pick = null
      for (const pass of [1, 2]) {
        const eligible = []
        for (const t of slot) {
          if (taken.has(t)) continue
          if (pass === 1 && usedViews.has(t.refIndex)) continue
          eligible.push(t)
          if (eligible.length >= BALANCE_WINDOW) break
        }
        if (eligible.length) {
          // Least-used candidate plazas win; the slot's own ordering breaks
          // ties, so quality still decides among equally balanced options.
          pick = eligible.reduce((best, t) => (cost(t) < cost(best) ? t : best), eligible[0])
          break
        }
      }
      if (!pick) continue
      taken.add(pick)
      usedViews.add(pick.refIndex)
      candidateUse.set(pick.candidates[0].siteId, timesUsed(pick.candidates[0].siteId) + 1)
      candidateUse.set(pick.candidates[1].siteId, timesUsed(pick.candidates[1].siteId) + 1)
      chosen.push(pick)
    }
  }
  return chosen
}

// PER_SITE identical slots, each ranked most decisive first.
function strongestSlots(group) {
  const ranked = group.slice().sort((p, q) => q.strength - p.strength)
  return Array.from({ length: PER_SITE }, () => ranked)
}

// PER_SITE equal-count bins by strength, weakest bin first. Each bin is itself
// ordered from its own centre outward, so a slot's preferred trial sits in the
// middle of its band rather than on a boundary shared with the next one.
function strengthBins(group) {
  const sorted = group.slice().sort((p, q) => p.strength - q.strength)
  const bins = []
  for (let i = 0; i < PER_SITE; i++) {
    const from = Math.floor((i * sorted.length) / PER_SITE)
    const to = Math.floor(((i + 1) * sorted.length) / PER_SITE)
    const band = sorted.slice(from, Math.max(to, from + 1))
    const mid = (band.length - 1) / 2
    bins.push(
      band
        .map((trial, index) => ({ trial, offset: Math.abs(index - mid) }))
        .sort((p, q) => p.offset - q.offset)
        .map((e) => e.trial)
    )
  }
  return bins
}

function shuffleWith(list, rng) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Turns a selected trial into the record the survey page and the analysis read:
// the actual view geometry, not indices into a cloud that could be rebuilt
// differently later.
//
// Everything a render needs travels IN the trial — vantage, heading, and the
// four measured metrics. The survey page then never rebuilds a cloud, so a
// marker moved after collection began cannot change what a stored answer meant.
function materialise(t, built, nameById, cloudFile) {
  const view = (siteId, index) => {
    const marker = built.clouds.get(siteId).markers[index]
    return {
      site_id: siteId,
      site_name: nameById.get(siteId) ?? siteId,
      view_index: index,
      origin: marker.origin,
      local_x: marker.local_x,
      local_y: marker.local_y,
      direction_deg: marker.direction_deg,
      area_m2: marker.area_m2,
      compactness: marker.compactness,
      occlusivity_m: marker.occlusivity_m,
      enclosure_ratio: marker.enclosure_ratio,
      fov_mode: marker.fov_mode ?? cloudFile.fov_mode,
      fov_deg: marker.fov_deg ?? cloudFile.fov_deg,
      range_m: marker.range_m ?? cloudFile.range_m,
    }
  }

  return {
    trial_id: `${t.refSite}:${t.refIndex}:${t.candidates[0].siteId}:${t.candidates[1].siteId}`,
    stratum: t.predictions.chamfer === t.predictions.centroid ? 'agreement' : 'discriminating',
    reference: view(t.refSite, t.refIndex),
    candidates: [
      view(t.candidates[0].siteId, t.candidates[0].viewIndex),
      view(t.candidates[1].siteId, t.candidates[1].viewIndex),
    ],
    predictions: t.predictions,
    // Distances kept beside the predictions so the analysis never has to
    // recompute them — and so a prediction can be audited against the number
    // that produced it without rebuilding the clouds.
    view_distances: [t.candidates[0].distance, t.candidates[1].distance],
    margins: t.margins,
    strength: t.strength,
  }
}

function report(bank) {
  const counts = { agreement: 0, discriminating: 0 }
  const refUse = new Map()
  const candUse = new Map()
  for (const t of bank.trials) {
    counts[t.stratum]++
    refUse.set(t.reference.site_id, (refUse.get(t.reference.site_id) ?? 0) + 1)
    for (const c of t.candidates) candUse.set(c.site_id, (candUse.get(c.site_id) ?? 0) + 1)
  }
  const cand = [...candUse.values()]

  console.log(`\nMatched-view trial bank → ${OUT}`)
  console.log(`  ${bank.trials.length} trials — ${counts.agreement} agreement, ${counts.discriminating} discriminating`)
  console.log(
    `  pool: ${bank.pool.agreement} agreement, ${bank.pool.discriminating} discriminating, ` +
      `${bank.pool.cloud_measures_split} discarded (cloud measures split from each other)`
  )
  console.log(
    `  below the ${MIN_STRENGTH} margin floor: ${bank.pool.agreement_below_floor} agreement, ` +
      `${bank.pool.discriminating_below_floor} discriminating`
  )
  console.log(`  reference balance: ${[...new Set(refUse.values())].join('/')} trials per plaza, ${refUse.size} plazas`)
  console.log(`  candidate appearances: min ${Math.min(...cand)}, max ${Math.max(...cand)}, ${candUse.size} plazas`)
  for (const stratum of ['agreement', 'discriminating']) {
    const v = bank.trials
      .filter((t) => t.stratum === stratum)
      .map((t) => t.strength)
      .sort((a, b) => a - b)
    console.log(
      `  ${stratum.padEnd(15)} margin: min ${v[0].toFixed(3)}, median ` +
        `${v[Math.floor(v.length / 2)].toFixed(3)}, max ${v.at(-1).toFixed(3)}`
    )
  }
  console.log('')
}

main()
