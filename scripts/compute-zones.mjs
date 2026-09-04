#!/usr/bin/env node
// P6 — clusters the pooled field points into a GLOBAL zone typology.
//
//   npm run zones                 diagnostics for k = 2..12, then fit the choice
//   npm run zones -- --k=5        skip selection and fit a stated k
//   npm run zones -- --dry        report without writing
//
// GLOBAL, NOT PER-SITE. Every plaza's grid points go into one pool and one
// clustering. A zone type therefore means the same thing everywhere: "zone 3 at
// Zeil" and "zone 3 at Burgplatz" are the same kind of place, which is what
// makes the cross-site composition chart a comparison rather than eighteen
// unrelated colour schemes.
//
// THE SPACE IS WEIGHTED. Distances use P5's fitted weights, so the typology is
// carved along the dimensions that actually drove human similarity judgements
// rather than treating all four as equally important. This is the transfer
// assumption recorded in docs/spec.md: relative metric importance is assumed to
// hold from the perceptual layer to the field layer. An unweighted clustering
// is computed alongside as a robustness check, and belongs in the methods
// disclosure only — never as a headline result.
//
// Silhouette and inertia are both computed in that SAME weighted space. Scoring
// a weighted clustering with unweighted diagnostics would judge the result by a
// geometry it was not built in.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeJsonAtomic } from './writeJsonAtomic.js'
import { mulberry32 } from '../src/lib/triplets.js'
import { METRICS, METRIC_LABELS } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const K_ARG = args.find((a) => a.startsWith('--k='))?.split('=')[1]

const K_MIN = 2
const K_MAX = 12
const RESTARTS = 10
const MAX_ITERS = 100
const SEED = 20260904
// Silhouette on 11,580 points is O(n²) — 134 million distance pairs per k, for
// eleven values of k. A seeded sample gives the same answer to two decimals for
// a fraction of the cost, and the sample is fixed so the diagnostic is
// reproducible rather than drifting between runs.
const SILHOUETTE_SAMPLE = 2500

// Thresholds for the k choice — see the selection block in main() for why
// silhouette alone is not sufficient here.
//
// A zone counts towards a plaza's total when it holds at least 5% of that
// plaza's points, so a handful of stray assignments does not read as structure.
const SILHOUETTE_TOLERANCE = 0.04 // how far below the peak is still acceptable
const MIN_ZONES_PER_PLAZA = 2.0 // the map must describe places, not plazas
const MAX_SINGLE_ZONE_PLAZAS = 5 // at most this many plazas may be one zone
const ZONE_PRESENCE_SHARE = 0.05

// How much of the structure lies inside plazas rather than between them: how
// many plazas are essentially one zone, and how many zones an average plaza
// actually contains.
function withinPlazaStructure(assign, owner, k) {
  const bySite = {}
  for (let i = 0; i < assign.length; i++) {
    ;(bySite[owner[i]] ??= new Int32Array(k))[assign[i]]++
  }
  const ids = Object.keys(bySite)
  let uniform = 0
  let zoneSum = 0
  for (const id of ids) {
    const tally = bySite[id]
    const n = tally.reduce((a, b) => a + b, 0)
    if (Math.max(...tally) / n > 0.9) uniform++
    zoneSum += [...tally].filter((c) => c / n >= ZONE_PRESENCE_SHARE).length
  }
  return { uniform, perPlaza: zoneSum / ids.length, siteCount: ids.length }
}

// ------------------------------------------------------------------ k-means

function weightedDist2(a, b, w) {
  let s = 0
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k]
    s += w[k] * d * d
  }
  return s
}

// k-means++ seeding: after a random first centre, each subsequent centre is
// drawn with probability proportional to its squared distance from the nearest
// existing centre. Plain random seeding on this data reliably lands two centres
// inside the same dense cluster and leaves a real one unrepresented.
function seedPlusPlus(points, k, w, rng) {
  const centres = [points[Math.floor(rng() * points.length)].slice()]
  const d2 = new Float64Array(points.length).fill(Infinity)
  while (centres.length < k) {
    let total = 0
    for (let i = 0; i < points.length; i++) {
      const d = weightedDist2(points[i], centres[centres.length - 1], w)
      if (d < d2[i]) d2[i] = d
      total += d2[i]
    }
    let target = rng() * total
    let pick = points.length - 1
    for (let i = 0; i < points.length; i++) {
      target -= d2[i]
      if (target <= 0) {
        pick = i
        break
      }
    }
    centres.push(points[pick].slice())
  }
  return centres
}

function kmeans(points, k, w, seed) {
  const rng = mulberry32(seed)
  let centres = seedPlusPlus(points, k, w, rng)
  const assign = new Int32Array(points.length)
  const dim = points[0].length

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const d = weightedDist2(points[i], centres[c], w)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        moved = true
      }
    }

    const sums = Array.from({ length: k }, () => new Float64Array(dim))
    const counts = new Int32Array(k)
    for (let i = 0; i < points.length; i++) {
      counts[assign[i]]++
      for (let d = 0; d < dim; d++) sums[assign[i]][d] += points[i][d]
    }
    for (let c = 0; c < k; c++) {
      // An emptied cluster is re-seeded on the point furthest from its own
      // centre, rather than dropped — silently returning k−1 clusters when k
      // was asked for would corrupt the k-selection comparison.
      if (counts[c] === 0) {
        let far = 0
        let farD = -1
        for (let i = 0; i < points.length; i++) {
          const d = weightedDist2(points[i], centres[assign[i]], w)
          if (d > farD) {
            farD = d
            far = i
          }
        }
        centres[c] = points[far].slice()
        continue
      }
      for (let d = 0; d < dim; d++) centres[c][d] = sums[c][d] / counts[c]
    }
    if (!moved && iter > 0) break
  }

  let inertia = 0
  for (let i = 0; i < points.length; i++) inertia += weightedDist2(points[i], centres[assign[i]], w)
  return { centres, assign, inertia }
}

function bestOf(points, k, w, restarts) {
  let best = null
  for (let r = 0; r < restarts; r++) {
    const fit = kmeans(points, k, w, SEED + k * 1000 + r)
    if (!best || fit.inertia < best.inertia) best = fit
  }
  return best
}

// Mean silhouette over a fixed sample. For each point: a = mean distance to its
// own cluster, b = mean distance to the nearest other cluster, score = (b−a)/max.
// +1 means comfortably inside its own cluster, 0 means on a boundary.
function silhouette(points, assign, k, w, rng) {
  const n = points.length
  const idx = []
  if (n <= SILHOUETTE_SAMPLE) {
    for (let i = 0; i < n; i++) idx.push(i)
  } else {
    const seen = new Set()
    while (idx.length < SILHOUETTE_SAMPLE) {
      const i = Math.floor(rng() * n)
      if (!seen.has(i)) {
        seen.add(i)
        idx.push(i)
      }
    }
  }

  let total = 0
  for (const i of idx) {
    const sums = new Float64Array(k)
    const counts = new Int32Array(k)
    for (const j of idx) {
      if (i === j) continue
      const d = Math.sqrt(weightedDist2(points[i], points[j], w))
      sums[assign[j]] += d
      counts[assign[j]]++
    }
    const own = assign[i]
    if (counts[own] === 0) continue
    const a = sums[own] / counts[own]
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === own || counts[c] === 0) continue
      const m = sums[c] / counts[c]
      if (m < b) b = m
    }
    if (b === Infinity) continue
    total += (b - a) / Math.max(a, b)
  }
  return total / idx.length
}

// ---------------------------------------------------------------------- main

function main() {
  const index = read('src/data/fields/index.json')
  const weightsFile = read('src/data/analysis-panoramic.json')
  const w = weightsFile.fit.weights_normalised

  const points = []
  const owner = []
  for (const s of index.sites) {
    const f = read(`src/data/fields/${s.file}`)
    for (const p of f.points) {
      points.push(p.n)
      owner.push(s.site_id)
    }
  }

  console.log(`P6 zone typology — ${points.length} field points from ${index.sites.length} plazas`)
  console.log(`Weighted space: ${METRICS.map((m, i) => `${m} ${w[i].toFixed(3)}`).join(' · ')}`)
  console.log(`Weights from analysis-panoramic.json (${weightsFile.inputs.participants.used} participants)\n`)

  const rng = mulberry32(SEED)
  const unit = [1, 1, 1, 1]

  let chosenK = K_ARG ? Number(K_ARG) : null
  const diagnostics = []

  if (!chosenK) {
    console.log(
      '  k'.padEnd(6) + 'inertia'.padStart(11) + 'silhouette'.padStart(12) +
        'single-zone plazas'.padStart(20) + 'zones/plaza'.padStart(13)
    )
    for (let k = K_MIN; k <= K_MAX; k++) {
      const fit = bestOf(points, k, w, RESTARTS)
      const sil = silhouette(points, fit.assign, k, w, mulberry32(SEED + k))
      const { uniform, perPlaza, siteCount } = withinPlazaStructure(fit.assign, owner, k)
      diagnostics.push({ k, inertia: fit.inertia, silhouette: sil, singleZonePlazas: uniform, zonesPerPlaza: perPlaza })
      console.log(
        `  ${k}`.padEnd(6) +
          fit.inertia.toFixed(1).padStart(11) +
          sil.toFixed(4).padStart(12) +
          `${uniform} of ${siteCount}`.padStart(20) +
          perPlaza.toFixed(1).padStart(13)
      )
    }

    // TWO criteria, because silhouette alone answers the wrong question here.
    //
    // Silhouette rewards well-separated clusters, and the best-separated
    // structure in this data lies BETWEEN plazas rather than within them: it
    // peaks at k=3, where 13 of 18 plazas come out as a single zone and the map
    // simply restates which plaza you are in. That is plaza-level typology,
    // which docs/spec.md explicitly removes from scope, and it would leave P9 —
    // which diagnoses zone types, not whole-plaza labels — with nothing to
    // operate on.
    //
    // So k is chosen as the smallest value whose silhouette stays within
    // SILHOUETTE_TOLERANCE of the peak AND which resolves real structure inside
    // plazas. Both thresholds are stated here rather than tuned to an outcome,
    // and the full diagnostic table is written to zones.json so the choice can
    // be re-argued from the numbers.
    const peak = Math.max(...diagnostics.map((d) => d.silhouette))
    const viable = diagnostics.filter(
      (d) =>
        d.silhouette >= peak - SILHOUETTE_TOLERANCE &&
        d.zonesPerPlaza >= MIN_ZONES_PER_PLAZA &&
        d.singleZonePlazas <= MAX_SINGLE_ZONE_PLAZAS
    )
    chosenK = viable.length ? viable[0].k : diagnostics.reduce((a, b) => (b.silhouette > a.silhouette ? b : a)).k
    const pick = diagnostics.find((d) => d.k === chosenK)
    console.log(
      `\n  Peak silhouette ${peak.toFixed(4)}. Chose k = ${chosenK} ` +
        `(silhouette ${pick.silhouette.toFixed(4)}, within ${SILHOUETTE_TOLERANCE} of peak;\n` +
        `  ${pick.singleZonePlazas} single-zone plazas, ${pick.zonesPerPlaza.toFixed(1)} zones per plaza).`
    )
  }

  const fit = bestOf(points, chosenK, w, RESTARTS * 2)
  const unweighted = bestOf(points, chosenK, unit, RESTARTS)

  // How far the two partitions agree, as the share of points whose weighted
  // cluster is dominated by the same unweighted cluster. A robustness check on
  // the transfer assumption, not a result.
  const cross = Array.from({ length: chosenK }, () => new Int32Array(chosenK))
  for (let i = 0; i < points.length; i++) cross[fit.assign[i]][unweighted.assign[i]]++
  let agree = 0
  for (let c = 0; c < chosenK; c++) agree += Math.max(...cross[c])
  const agreement = agree / points.length

  const counts = new Int32Array(chosenK)
  for (const a of fit.assign) counts[a]++

  console.log(`\n  Zone profile at k = ${chosenK} (centres in normalised units)\n`)
  console.log(
    '  zone'.padEnd(8) + 'points'.padStart(9) + 'share'.padStart(8) +
      METRICS.map((m) => METRIC_LABELS[m].slice(0, 9).padStart(12)).join('')
  )
  const order = [...Array(chosenK).keys()].sort((a, b) => fit.centres[a][0] - fit.centres[b][0])
  for (const c of order) {
    console.log(
      `  ${c}`.padEnd(8) +
        String(counts[c]).padStart(9) +
        `${((counts[c] / points.length) * 100).toFixed(1)}%`.padStart(8) +
        fit.centres[c].map((v) => v.toFixed(3).padStart(12)).join('')
    )
  }

  console.log(`\n  Unweighted robustness check: ${(agreement * 100).toFixed(1)}% of points keep a`)
  console.log('  corresponding cluster when all four metrics are weighted equally.')

  if (DRY) {
    console.log('\n--dry: nothing written.')
    return
  }

  // Per-site zone assignment, written back beside each field file so the viewer
  // loads one plaza's zones without parsing the whole pool.
  let cursor = 0
  const composition = []
  for (const s of index.sites) {
    const f = read(`src/data/fields/${s.file}`)
    const zones = []
    const tally = new Int32Array(chosenK)
    for (let i = 0; i < f.points.length; i++) {
      const z = fit.assign[cursor++]
      zones.push(z)
      tally[z]++
    }
    writeJsonAtomic(path.join(root, `src/data/fields/${s.file}`), { ...f, k: chosenK, zones })
    composition.push({
      site_id: s.site_id,
      name: s.name,
      point_count: f.points.length,
      shares: [...tally].map((n) => round(n / f.points.length, 4)),
    })
  }

  writeJsonAtomic(path.join(root, 'src/data/zones.json'), {
    generated_at: new Date().toISOString(),
    k: chosenK,
    k_selection: diagnostics.length
      ? {
          range: [K_MIN, K_MAX],
          criterion:
            'smallest k whose mean silhouette is within ' + SILHOUETTE_TOLERANCE + ' of the peak AND ' +
            'which resolves structure inside plazas (>= ' + MIN_ZONES_PER_PLAZA + ' zones per plaza, ' +
            '<= ' + MAX_SINGLE_ZONE_PLAZAS + ' single-zone plazas). Silhouette alone peaks where the ' +
            'clustering separates plazas rather than places within them, which is out of scope for P6 ' +
            'and leaves P9 without zone-level structure to diagnose.',
          zone_presence_share: ZONE_PRESENCE_SHARE,
          diagnostics,
        }
      : null,
    seed: SEED,
    restarts: RESTARTS * 2,
    weighted_by: { source: 'analysis-panoramic.json', weights: w, metrics: METRICS },
    normalisation_source: 'perceptual_360',
    total_points: points.length,
    centres: fit.centres.map((c) => c.map((v) => round(v, 5))),
    counts: [...counts],
    inertia: round(fit.inertia, 4),
    unweighted_agreement: round(agreement, 4),
    composition,
  })

  console.log('\nWrote src/data/zones.json and zone assignments into each field file.')
}

const round = (v, d) => Number(v.toFixed(d))

main()
