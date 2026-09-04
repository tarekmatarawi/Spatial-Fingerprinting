#!/usr/bin/env node
// P5 runner — fits the perceptual weights and writes src/data/analysis.json.
//
//   npm run analyze              full analysis on the real survey responses
//   npm run analyze -- --selftest   the validation gate (no output file written)
//   npm run analyze -- --quick   fewer resamples/permutations, for iterating
//
// The self-test is the gate for this phase: until synthetic weight recovery and
// permutation-null uniformity both pass, no number produced from real responses
// means anything.
//
// LAYER AND SOURCE MUST MATCH. The stimulus a participant judged and the
// geometry the fit reads have to be the same measurement of the same thing:
// panoramic responses are judgements of the full surround, so they belong with
// perceptual_360 readings, while the archived static-photo responses are
// judgements of one directed view and belong with perceptual_120. Crossing them
// fits perceptual weights to geometry nobody was shown. The pairing is
// therefore declared in one place — SOURCES below — and chosen by name rather
// than assembled from two independent flags that could disagree:
//
//   npm run analyze -- --source=panoramic   (default) panoramic survey × 360°
//   npm run analyze -- --source=archive     archived static-photo survey × 120°
//
// THE FIT READS THE TRIPLETS ONLY. Each plaza is placed by measured geometry
// and nothing else. The rating block is not folded into the coordinates.
//
// An earlier version blended the two, placing each plaza midway between what
// the engine measured and what participants reported. It was dropped on two
// grounds. First, the mixture fraction was unjustifiable: 50/50 is a stated
// preference, not a quantity the study can derive, and a thesis should not rest
// on a free parameter chosen by the author. Second, and fatally, it is
// circular — locating plazas by participants' ratings and then predicting those
// same participants' choices uses one sample twice, and the
// leave-one-participant-out test in scripts/perceived-holdout.mjs showed the
// apparent gain vanishing entirely once no one helped place the plazas used to
// predict their own answers.
//
// The rating block is not discarded, it is repurposed. It answers a different
// and cleaner question — do people perceive these four dimensions the way the
// geometry measures them? — as an independent validation, in
// scripts/validate-ratings.mjs. Ratings never touch the weights.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { activeSites } from '../src/lib/site.js'
import { mulberry32 } from '../src/lib/triplets.js'
import { METRICS, METRIC_LABELS, buildFingerprints, FOV_MODES } from '../src/lib/analysis/fingerprints.js'
import { PAIRS, N_METRICS, pairProbabilities } from '../src/lib/analysis/model.js'
import { fitWeights } from '../src/lib/analysis/fit.js'
import { selectTriplets, summarise } from '../src/lib/analysis/exclusions.js'
import { bootstrapWeights, ENCLOSURE_INDEX } from '../src/lib/analysis/resample.js'
import {
  leaveOnePlazaOut,
  areaOnlyBaseline,
  pairedFoldComparison,
  permutationTest,
  summarisePermutation,
  DEFAULT_SEED,
  CHANCE,
} from '../src/lib/analysis/crossval.js'
import { leaveOneMetricOut, assessH3 } from '../src/lib/analysis/ablation.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const ANALYSIS_VERSION = '1.0.0'
const args = new Set(process.argv.slice(2))
const QUICK = args.has('--quick')
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

// The valid pairings of survey instrument to geometry layer. Adding a source
// means naming both halves together; there is deliberately no way to select one
// without the other.
// Sight lines run to 200 m in both layers. A 100 m variant was built and tested
// against Gehl's social field of vision and is not carried here: the plazas
// reorder very little between the two, and 200 m is what the Grasshopper
// reference toolchain uses, so it keeps this study comparable to the
// established isovist literature rather than to one reading of one author.
const SOURCES = {
  panoramic: {
    responses: 'src/data/survey-responses-360.json',
    fovMode: 'perceptual_360',
    label: 'panoramic survey × 360° readings (200 m)',
  },
  archive: {
    responses: 'src/data/survey-responses.json',
    fovMode: 'perceptual_120',
    label: 'archived static-photo survey × 120° readings',
  },
}

const sourceArg = [...args].find((a) => a.startsWith('--source='))?.split('=')[1] ?? 'panoramic'
const SOURCE = SOURCES[sourceArg]
if (!SOURCE) {
  console.error(`Unknown --source "${sourceArg}". Expected one of: ${Object.keys(SOURCES).join(', ')}`)
  process.exit(1)
}

// ------------------------------------------------------- parallel permutation

// Spreads the permutation replicates across worker threads. Each replicate is
// seeded by its own index, so the null distribution is identical however many
// workers run it — the parallelism is purely a speed choice, not a statistical
// one.
async function permutationTestParallel(triplets, siteIds, observedAccuracy, options = {}) {
  const permutations = options.permutations ?? 1000
  const seed = options.seed ?? DEFAULT_SEED
  const workerCount = Math.max(1, Math.min(os.cpus().length - 1, permutations))
  const workerFile = path.join(root, 'scripts/permutation-worker.mjs')

  // Round-robin so every worker gets a comparable share.
  const chunks = Array.from({ length: workerCount }, () => [])
  for (let i = 0; i < permutations; i++) chunks[i % workerCount].push(i)

  const accuracies = new Array(permutations).fill(null)
  let done = 0

  await Promise.all(
    chunks.map(
      (indices) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(workerFile, {
            workerData: { triplets, siteIds, indices, seed },
          })
          worker.on('message', (msg) => {
            msg.indices.forEach((index, i) => {
              accuracies[index] = msg.accuracies[i]
            })
            done += msg.indices.length
            process.stdout.write(`\r  ${done}/${permutations} replicates`)
          })
          worker.on('error', reject)
          worker.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`permutation worker exited ${code}`))
          )
        })
    )
  )
  process.stdout.write('\n')

  return summarisePermutation(accuracies, observedAccuracy, { permutations, seed })
}

// ---------------------------------------------------------------- self-test

// Draws a chosen pair from the model's own probabilities, so synthetic data is
// generated by exactly the process the fitter assumes.
function sampleChoice(triplet, weights, rng) {
  const probs = pairProbabilities(triplet, weights)
  const r = rng()
  let acc = 0
  for (let p = 0; p < PAIRS.length; p++) {
    acc += probs[p]
    if (r < acc) return p
  }
  return PAIRS.length - 1
}

// Builds synthetic triplets over the real fingerprints, mirroring the real
// study's shape: a set of participants each answering a run of triplets.
function syntheticTriplets(fingerprints, siteIds, { participants, perParticipant, seed }) {
  const rng = mulberry32(seed)
  const out = []
  for (let p = 0; p < participants; p++) {
    const participant = `synthetic-${p}`
    for (let q = 0; q < perParticipant; q++) {
      const pick = []
      while (pick.length < 3) {
        const id = siteIds[Math.floor(rng() * siteIds.length)]
        if (!pick.includes(id)) pick.push(id)
      }
      const xs = pick.map((id) => fingerprints.get(id))
      const delta = new Float64Array(PAIRS.length * N_METRICS)
      for (let pr = 0; pr < PAIRS.length; pr++) {
        const [i, j] = PAIRS[pr]
        for (let k = 0; k < N_METRICS; k++) {
          const d = xs[i][k] - xs[j][k]
          delta[pr * N_METRICS + k] = d * d
        }
      }
      out.push({ delta, chosen: 0, participant, sites: pick })
    }
  }
  return out
}

function runSelfTest(fingerprints, siteIds) {
  const failures = []
  const note = (ok, label, detail) => {
    console.log(`  ${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(label)
  }

  console.log('\nGATE 1 — synthetic weight recovery')
  // Truth vectors span an easy case, a dominant-metric case, and one with a
  // metric at zero (which the ablation sanity check below relies on).
  const truths = [
    [0.1, 0.2, 0.3, 0.4],
    [0.7, 0.1, 0.1, 0.1],
    [0.25, 0.25, 0.25, 0.25],
    [0.5, 0.5, 0.0, 0.0],
  ]

  for (let i = 0; i < truths.length; i++) {
    const truth = truths[i]
    // Scale sets choice sharpness. 12 puts synthetic accuracy in the same band
    // as the real responses, so recovery is tested at a realistic noise level
    // rather than on unrealistically decisive data.
    const scaled = truth.map((w) => w * 12)
    const rng = mulberry32(4242 + i)
    const triplets = syntheticTriplets(fingerprints, siteIds, {
      participants: 60,
      perParticipant: 26,
      seed: 900 + i,
    })
    for (const t of triplets) t.chosen = sampleChoice(t, scaled, rng)

    const fit = fitWeights(triplets)
    const got = fit.weightsNormalised
    const maxErr = Math.max(...truth.map((w, k) => Math.abs(w - got[k])))
    note(
      maxErr < 0.08,
      `truth [${truth.join(', ')}]`,
      `recovered [${got.map((w) => w.toFixed(3)).join(', ')}], max error ${maxErr.toFixed(3)}`
    )
  }

  console.log('\nGATE 2 — permutation null is uniform under shuffled labels')
  // With labels shuffled there is no signal, so leave-one-plaza-out accuracy
  // must sit at chance and the resulting p-values must be ~Uniform(0,1). If the
  // null is not uniform, every p-value the analysis reports is meaningless.
  {
    const triplets = syntheticTriplets(fingerprints, siteIds, {
      participants: 40,
      perParticipant: 26,
      seed: 77,
    })
    const rng = mulberry32(31337)
    for (const t of triplets) t.chosen = Math.floor(rng() * 3)

    const loo = leaveOnePlazaOut(triplets, siteIds)
    note(
      loo.meanAccuracy != null && Math.abs(loo.meanAccuracy - CHANCE) < 0.05,
      'shuffled-label accuracy sits at chance',
      `${pct(loo.meanAccuracy)} vs chance ${pct(CHANCE)}`
    )

    // A handful of independent null datasets, each yielding a p-value. Under a
    // correct null these are uniform, so few should land below 0.05 and the
    // mean should sit near 0.5.
    const ps = []
    for (let r = 0; r < 6; r++) {
      const t2 = syntheticTriplets(fingerprints, siteIds, {
        participants: 15,
        perParticipant: 26,
        seed: 500 + r,
      })
      const rng2 = mulberry32(8000 + r)
      for (const t of t2) t.chosen = Math.floor(rng2() * 3)
      const obs = leaveOnePlazaOut(t2, siteIds)
      const perm = permutationTest(t2, siteIds, obs.meanAccuracy, {
        permutations: 25,
        seed: 9000 + r,
      })
      ps.push(perm.p)
    }
    const meanP = ps.reduce((s, v) => s + v, 0) / ps.length
    const below05 = ps.filter((p) => p < 0.05).length
    note(
      meanP > 0.2 && meanP < 0.8 && below05 <= 2,
      'null p-values are uniform-ish',
      `mean p ${meanP.toFixed(3)}, ${below05}/${ps.length} below 0.05`
    )
  }

  console.log('\nGATE 3 — ablation sanity (a zero-weight metric costs nothing)')
  {
    const truth = [0.4, 0.4, 0.2, 0.0] // enclosure genuinely irrelevant here
    const scaled = truth.map((w) => w * 12)
    const rng = mulberry32(1234)
    const triplets = syntheticTriplets(fingerprints, siteIds, {
      participants: 50,
      perParticipant: 26,
      seed: 321,
    })
    for (const t of triplets) t.chosen = sampleChoice(t, scaled, rng)

    const full = leaveOnePlazaOut(triplets, siteIds)
    const abl = leaveOneMetricOut(triplets, siteIds, full.meanAccuracy)
    const zeroDrop = abl.results[3].drop
    note(
      zeroDrop != null && Math.abs(zeroDrop) < 0.02,
      'dropping the zero-weight metric barely moves accuracy',
      `Δ ${(zeroDrop * 100).toFixed(2)} pp`
    )
    const worst = abl.ranked[0]
    note(
      worst.metric !== 'enclosure',
      'the zero-weight metric is not ranked most costly',
      `most costly is ${worst.label} (${(worst.drop * 100).toFixed(2)} pp)`
    )
  }

  console.log()
  console.log('GATE 4 — layer separation')
  {
    const readings = read('src/data/results.json')
    const canonical = readings.filter((r) => r.canonical === true)

    note(
      readings.every((r) => r.fov_mode != null),
      'every reading declares an fov_mode',
      `${readings.length} readings`
    )
    note(
      canonical.every((r) => FOV_MODES.includes(r.fov_mode)),
      'every canonical reading names a known layer',
      FOV_MODES.join(' · ')
    )

    // Several layers now live in results.json side by side. The invariant is
    // one canonical reading per site PER LAYER — not one per site overall.
    const layers = [...new Set(canonical.map((r) => r.fov_mode))]
    for (const layer of layers) {
      const perSite = new Map()
      for (const r of canonical.filter((x) => x.fov_mode === layer)) {
        perSite.set(r.site_id, (perSite.get(r.site_id) ?? 0) + 1)
      }
      note(
        [...perSite.values()].every((n) => n === 1),
        `exactly one canonical ${layer} reading per site`,
        `${perSite.size} sites`
      )
    }

    // The rule that actually protects the analysis: no two layers may share a
    // normalisation range. If they did, a value from one could be read on the
    // other's scale without anything looking wrong.
    const bounds = layers.map((layer) => ({
      layer,
      b: buildFingerprints(readings, siteIds, layer).bounds,
    }))
    let shared = null
    for (let i = 0; i < bounds.length && !shared; i++) {
      for (let j = i + 1; j < bounds.length && !shared; j++) {
        for (const m of METRICS) {
          if (
            bounds[i].b[m].min === bounds[j].b[m].min &&
            bounds[i].b[m].max === bounds[j].b[m].max
          ) {
            shared = `${bounds[i].layer} and ${bounds[j].layer} share ${m} bounds`
          }
        }
      }
    }
    note(
      !shared,
      'no two layers share normalisation bounds',
      shared ?? `${layers.length} independent layers`
    )
  }

  console.log(
    failures.length
      ? `\nGATE FAILED — ${failures.length} check(s) did not pass:\n  ${failures.join('\n  ')}\n`
      : '\nGATE PASSED — the fitter recovers known weights, the null is uniform,\nablation behaves, and the layers are separate.\n'
  )
  return failures.length === 0
}

// ---------------------------------------------------------------- main

async function main() {
  const sites = read('src/data/sites.json')
  const readings = read('src/data/results.json')
  const siteIds = activeSites(sites).map((s) => s.id)

  const { bounds, fingerprints } = buildFingerprints(readings, siteIds, SOURCE.fovMode)
  const orderedSiteIds = [...fingerprints.keys()].sort()

  if (args.has('--selftest')) {
    process.exitCode = runSelfTest(fingerprints, orderedSiteIds) ? 0 : 1
    return
  }

  console.log(`Source\n  ${SOURCE.label}`)
  console.log(`  ${SOURCE.responses} × fov_mode ${SOURCE.fovMode}\n`)
  let records = read(SOURCE.responses)

  // --limit=N runs the whole analysis on the first N participants in the order
  // they actually took the survey. It exists to answer "did the conclusions
  // change as the sample grew" with the SAME pipeline rather than a re-derived
  // one, which is the only way that comparison means anything.
  //
  // Order is by start time, fixed before any analysis and not chosen by us.
  const limitArg = [...args].find((a) => a.startsWith('--limit='))?.split('=')[1]
  if (limitArg) {
    const n = Number(limitArg)
    if (!Number.isInteger(n) || n < 1) {
      console.error(`--limit must be a positive integer, got "${limitArg}"`)
      process.exit(1)
    }
    records = [...records]
      .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))
      .slice(0, n)
    console.log(`  --limit=${n}: first ${records.length} participants by start time\n`)
  }
  const selection = selectTriplets(records, fingerprints, siteIds)
  const inputs = summarise(records, selection)
  const triplets = selection.triplets

  console.log('Responses')
  console.log(`  participants  ${inputs.participants.used} used of ${inputs.participants.collected} collected`)
  console.log(`  triplets      ${inputs.responses.used} fitted of ${inputs.responses.collected} collected`)
  for (const [reason, n] of Object.entries(inputs.responses.dropped)) {
    if (n > 0) console.log(`                −${n} ${reason.replace(/_/g, ' ')}`)
  }
  if (!inputs.attentionCheckAdministered) {
    console.log('  note          this instrument administers no attention check')
  } else if (!inputs.attentionCheckDiscriminated) {
    console.log('  note          the attention check excluded nobody — it did not discriminate')
  }

  if (triplets.length < 100) {
    console.log('\nToo few usable responses to fit. Collect more before running the analysis.')
    process.exitCode = 1
    return
  }

  const resamples = QUICK ? 100 : 1000
  const permutations = QUICK ? 100 : 1000

  console.log('\nFitting…')
  const full = fitWeights(triplets)
  console.log(`  NLL ${full.nll.toFixed(2)} over ${full.n} triplets (${full.restarts} restarts)`)
  METRICS.forEach((m, k) =>
    console.log(`  ${METRIC_LABELS[m].padEnd(16)} ${full.weightsNormalised[k].toFixed(4)}`)
  )

  console.log('\nCross-validating (leave one plaza out)…')
  // No warm start from `full`: it was fitted using the held-out triplets.
  const loo = leaveOnePlazaOut(triplets, siteIds)
  console.log(`  mean fold accuracy ${pct(loo.meanAccuracy)} over ${loo.folds} folds (chance ${pct(CHANCE)})`)

  const baseline = areaOnlyBaseline(triplets, siteIds)
  console.log(`  area-only baseline ${pct(baseline.meanAccuracy)}`)
  const paired = pairedFoldComparison(loo, baseline)
  console.log(`  full beats area-only in ${paired.wins}/${paired.wins + paired.losses} folds, sign-test p ${paired.signTestP?.toExponential(2)}`)

  console.log(`\nBootstrapping (${resamples} participant resamples)…`)
  const bootstrap = bootstrapWeights(triplets, full, { resamples })
  METRICS.forEach((m, k) => {
    const b = bootstrap.perMetric[k]
    console.log(`  ${METRIC_LABELS[m].padEnd(16)} ${b.mean.toFixed(4)}  [${b.lo.toFixed(4)}, ${b.hi.toFixed(4)}]`)
  })

  console.log('\nAblating (leave one metric out)…')
  const ablation = leaveOneMetricOut(triplets, siteIds, loo.meanAccuracy)
  for (const r of ablation.ranked) {
    const pp = r.drop * 100
    const sign = pp >= 0 ? `−${pp.toFixed(2)}` : `+${(-pp).toFixed(2)}`
    console.log(`  without ${r.label.padEnd(16)} ${sign} pp  (rank ${r.rank})`)
  }

  console.log(`\nPermutation test (${permutations} label shuffles)…`)
  const permutation = await permutationTestParallel(triplets, siteIds, loo.meanAccuracy, {
    permutations,
  })
  console.log(`  null mean ${pct(permutation.nullMean)}, 95th ${pct(permutation.null95)}, p ${permutation.p.toExponential(2)}`)

  const h3 = assessH3(bootstrap, ablation, ENCLOSURE_INDEX)

  const output = {
    analysis_version: ANALYSIS_VERSION,
    generated_at: new Date().toISOString(),
    // Both halves of the pairing travel with the result: a weight vector is
    // only interpretable against the geometry layer AND the instrument it was
    // fitted from, and a later reader must never have to infer either.
    fov_mode: SOURCE.fovMode,
    // Recorded so a later reader never has to infer it: the plazas are placed
    // by measured geometry alone. Ratings are validated separately and never
    // enter the fit. See scripts/validate-ratings.mjs.
    fingerprint_source: 'computed_geometry_only',
    source: { id: sourceArg, label: SOURCE.label, responses: SOURCE.responses },
    metrics: METRICS,
    metric_labels: METRIC_LABELS,
    seeds: { fit: full.seed ?? 20260817, bootstrap: bootstrap.seed, permutation: permutation.seed },
    bounds,
    inputs,
    fit: {
      weights: full.weights,
      weights_normalised: full.weightsNormalised,
      nll: full.nll,
      n: full.n,
      restarts: full.restarts,
      converged: full.converged,
    },
    bootstrap: {
      resamples: bootstrap.resamples,
      failures: bootstrap.failures,
      per_metric: bootstrap.perMetric,
    },
    crossval: {
      chance: CHANCE,
      mean_accuracy: loo.meanAccuracy,
      per_fold: loo.perFold.map(({ site, n, accuracy }) => ({ site, n, accuracy })),
      area_only: {
        mean_accuracy: baseline.meanAccuracy,
        per_fold: baseline.perFold.map(({ site, n, accuracy }) => ({ site, n, accuracy })),
      },
      paired,
    },
    permutation: {
      permutations: permutation.permutations,
      p: permutation.p,
      null_mean: permutation.nullMean,
      null_min: permutation.nullMin,
      null_max: permutation.nullMax,
      null_95: permutation.null95,
    },
    ablation,
    hypotheses: {
      H1: {
        statement:
          'The weighted four-metric model predicts perceived similarity better than chance.',
        accuracy: loo.meanAccuracy,
        chance: CHANCE,
        p: permutation.p,
        supported: loo.meanAccuracy > CHANCE && permutation.p < 0.05,
      },
      H2: {
        statement:
          'A four-metric framework predicts perceptual similarity more accurately than isovist area alone.',
        full: loo.meanAccuracy,
        area_only: baseline.meanAccuracy,
        mean_delta: paired.meanDelta,
        wins: paired.wins,
        losses: paired.losses,
        p: paired.signTestP,
        supported: paired.meanDelta > 0 && paired.signTestP != null && paired.signTestP < 0.05,
      },
      H3: {
        statement: 'Enclosure carries the largest perceptual weight of the four metrics.',
        ...h3,
      },
    },
  }

  // One file per source, so the panoramic result and the archived static-photo
  // result can sit side by side rather than each run destroying the other. The
  // quick flag is in the name too, so a coarse exploratory run can never be
  // mistaken later for the full one it resembles.
  const outFile = `src/data/analysis-${sourceArg}${limitArg ? `-n${records.length}` : ''}${QUICK ? '-quick' : ''}.json`
  writeJsonAtomic(path.join(root, outFile), output)

  console.log('\nHypotheses')
  console.log(`  H1 ${output.hypotheses.H1.supported ? 'supported' : 'NOT supported'} — accuracy ${pct(loo.meanAccuracy)} vs chance ${pct(CHANCE)}, p ${permutation.p.toExponential(2)}`)
  console.log(`  H2 ${output.hypotheses.H2.supported ? 'supported' : 'NOT supported'} — ${pct(loo.meanAccuracy)} vs area-only ${pct(baseline.meanAccuracy)}, p ${paired.signTestP?.toExponential(2)}`)
  console.log(`  H3 ${h3.verdict} — enclosure largest in ${pct(h3.weightEvidence.largestShare)} of draws, ablation rank ${h3.ablationEvidence.rank}/4`)
  console.log(`\nWrote ${outFile}`)
}

await main()
