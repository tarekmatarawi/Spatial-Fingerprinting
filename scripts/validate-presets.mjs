#!/usr/bin/env node
// P9 — does each preset actually do what the library claims it does?
//
//   npm run validate:presets
//   npm run validate:presets -- --radius=40
//
// Every preset in lib/presets.js carries an `expected` tag per metric: raise,
// lower, or none. Those tags are a PREDICTION, written from the definitions of
// the four metrics rather than from a run, and this script is what turns them
// into a claim that has been checked.
//
// The method. Place the preset at its default settings in open ground at
// Konstablerwache, measure every sampled point within a radius of it before and
// after, and compare the mean of each metric. A disagreement between the
// measured sign and the tag is reported as a FLAG, and is one of two things:
//
//   - a bug in the generator — it does not build what it says it builds; or
//   - a wrong expectation — the metric does not behave the way the tag assumed.
//
// The script cannot tell those apart, and does not pretend to. It says which
// presets disagree and by how much, so the two can be told apart by hand before
// any of it is relied on.
//
// WHY A RADIUS AND NOT THE WHOLE PLAZA. A pergola in one corner changes almost
// nothing about the mean over 967 points spread across a 200 m square, so a
// plaza-wide average would report "no effect" for every preset alike and
// distinguish nothing. The question each tag makes is local — what does this
// intervention do to the space around it — so the measurement is local too.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { activeSites, projectSite } from '../src/lib/site.js'
import { recomputeField } from '../src/lib/sandbox.js'
import {
  NON_DIAGNOSTIC_METRICS,
  SOLID_FRONTAGE_NOTE,
  SOLID_SHARE_NOTE,
  makeRecessElement,
  nearestFacade,
  normaliseExpectation,
} from '../src/lib/presets.js'
import {
  EYE_HEIGHT_M,
  NEGLIGIBLE_SHARE,
  PRESETS,
  defaultParams,
  elementParts,
  makePresetElement,
  partBlocks,
} from '../src/lib/presets.js'
import { METRICS, METRIC_LABELS } from '../src/lib/analysis/fingerprints.js'

// The four fitted metrics plus P9's two additions. The additions are diagnostic
// only: they never enter a weight fit and are never written to any corpus file.
const P9_METRICS = [...METRICS, 'solidShare', 'solidFrontage', 'solidity']
const P9_LABELS = {
  ...METRIC_LABELS,
  solidShare: 'Solid share',
  solidFrontage: 'Solid frontage',
  solidity: 'Solidity (hull)',
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const args = process.argv.slice(2)
const val = (f, d) => {
  const a = args.find((x) => x.startsWith(`${f}=`))
  return a ? a.split('=')[1] : d
}

const CASE_SITE_ID = 'Konstablerwache-Frankfurt am Main'
const RADIUS_M = Number(val('--radius', '35'))

// Open ground near the middle of Konstablerwache, clear of the facades, with a
// dense population of sampled points around it. Fixed rather than searched, so
// a re-run compares like with like.
const ANCHOR = { x: -20, y: 0 }
const ROTATION_DEG = 0

const RAW_KEYS = {
  area: 'area_m2',
  compactness: 'compactness',
  occlusivity: 'occlusivity_m',
  enclosure: 'enclosure_ratio',
  solidShare: 'solid_share',
  solidFrontage: 'solid_frontage_m',
  solidity: 'solidity',
}

function main() {
  const sites = read('src/data/sites.json')
  const zones = read('src/data/zones.json')
  const fieldIndex = read('src/data/fields/index.json')
  const field = read('src/data/fields/konstablerwache-frankfurt-am-main.json')

  const site = activeSites(sites).find((s) => s.id === CASE_SITE_ID)
  const geometry = projectSite(site)
  const weights = zones.weighted_by.weights

  // The points the comparison is made over: everything within RADIUS_M of the
  // anchor. Held fixed across presets so the presets are compared with each
  // other and not with differently-sized neighbourhoods.
  const nearby = []
  for (let i = 0; i < field.points.length; i++) {
    const p = field.points[i]
    if (Math.hypot(p.x - ANCHOR.x, p.y - ANCHOR.y) <= RADIUS_M) nearby.push(i)
  }

  console.log(`P9 preset validation — ${PRESETS.length} presets at default settings`)
  console.log(`Site: ${site.name}. Anchor ${ANCHOR.x}, ${ANCHOR.y}, rotation ${ROTATION_DEG}°.`)
  console.log(`Measured over ${nearby.length} sampled points within ${RADIUS_M} m of the anchor.`)
  console.log(`Eye-height slice: ${EYE_HEIGHT_M} m. "none" means under ${(NEGLIGIBLE_SHARE * 100).toFixed(0)}% change.\n`)

  // THE BASELINE IS RECOMPUTED, NOT READ. The stored field files carry only
  // the four fitted metrics, and were cast in the unflagged mode. Both sides of
  // every comparison below must come from the same measurement system, so the
  // as-built state is measured again here, height-aware, with the two P9
  // metrics — once, for this script's internal use. Nothing is written back.
  const baseline = recomputeField({
    points: field.points,
    geometry,
    masses: [],
    bounds: fieldIndex.bounds,
    centres: zones.centres,
    weights,
  })
  console.log(`Baseline re-measured height-aware: ${baseline.pointCount} points.\n`)
  const rows = []

  for (const preset of PRESETS) {
    const params = defaultParams(preset.id)

    // A subtractive preset is placed against a host facade rather than at a
    // free anchor, so it is constructed differently. The facade nearest the
    // anchor is used, which keeps it in the same neighbourhood as every
    // additive preset and so comparable with them.
    let element
    if (preset.subtractive) {
      const facade = nearestFacade(ANCHOR, geometry.buildings, 80)
      if (!facade) {
        console.log(`${preset.name}  —  SKIPPED (no facade within 80 m of the anchor)\n`)
        continue
      }
      element = makeRecessElement(facade, params, `validate-${preset.id}`)
    } else {
      element = makePresetElement(preset.id, ANCHOR, params, ROTATION_DEG, `validate-${preset.id}`)
    }

    const parts = elementParts(element)
    const blocking = parts.filter(partBlocks)

    const after = recomputeField({
      points: field.points,
      geometry,
      masses: [element],
      bounds: fieldIndex.bounds,
      centres: zones.centres,
      weights,
    })

    // Points the intervention now stands on leave the sample. They must leave
    // the BEFORE side too, or the comparison would be between two different
    // populations and every solid preset would show a spurious shift.
    const survived = new Set(after.points.map((p) => p.index))
    const shared = nearby.filter((i) => survived.has(i))
    const beforeShared = meansOver(baseline.points, shared, 'byIndex')
    const afterShared = meansOver(after.points, shared, 'byIndex')

    const flags = []
    const effects = P9_METRICS.map((metric) => {
      const b = beforeShared[metric]
      const a = afterShared[metric]
      const relative = b === 0 ? 0 : (a - b) / Math.abs(b)
      const observed =
        Math.abs(relative) < NEGLIGIBLE_SHARE ? 'none' : relative > 0 ? 'raise' : 'lower'
      const tag = normaliseExpectation(preset.expected[metric])
      const judged = tag != null && !NON_DIAGNOSTIC_METRICS.includes(metric)

      // A directional-only tag is held to its SIGN, not to a threshold it has
      // no headroom to cross: right sign passes, no movement passes, wrong sign
      // fails. A metric excluded from judgement altogether is printed and
      // ignored.
      let agrees = true
      if (judged) {
        agrees = tag.diagnostic
          ? observed === tag.direction
          : observed === tag.direction || observed === 'none'
      }
      if (!agrees) flags.push({ metric, expected: tag.direction, observed, relative })
      return {
        metric,
        before: b,
        after: a,
        relative,
        observed,
        expected: tag ? tag.direction : '—',
        diagnostic: tag ? tag.diagnostic : false,
        judged,
        agrees,
      }
    })

    rows.push({ preset, params, parts, blocking, effects, flags, dropped: nearby.length - shared.length })
    report(preset, parts, blocking, effects, flags, nearby.length - shared.length)
  }

  summarise(rows)

  console.log('')
  console.log('Note on the two P9-only metrics:')
  console.log('  Solid share      ' + wrap(SOLID_SHARE_NOTE, 4))
  console.log('  Solid frontage   ' + wrap(SOLID_FRONTAGE_NOTE, 4))
}

// Mean of each metric over a set of point indices.
//
// `mode` says how to find a point: the stored field is a positional array, the
// recomputed one carries its original index and is short of the points the
// intervention swallowed.
function meansOver(points, indices, mode) {
  const lookup = mode === 'byIndex' ? new Map(points.map((p) => [p.index, p])) : null
  const sums = Object.fromEntries(P9_METRICS.map((m) => [m, 0]))
  let n = 0
  for (const i of indices) {
    const p = lookup ? lookup.get(i) : points[i]
    if (!p) continue
    for (const m of P9_METRICS) sums[m] += p[RAW_KEYS[m]]
    n++
  }
  return Object.fromEntries(P9_METRICS.map((m) => [m, n ? sums[m] / n : 0]))
}

const ARROW = { raise: '↑', lower: '↓', none: '·' }

function report(preset, parts, blocking, effects, flags, dropped) {
  const status = flags.length ? `FLAGGED (${flags.length})` : 'ok'
  console.log(`${preset.name}  —  ${status}`)
  console.log(
    (preset.subtractive ? '  subtractive: rewrites a host facade' : `  ${parts.length} parts, ${blocking.length} crossing the ${EYE_HEIGHT_M} m slice`) +
      // A subtractive preset legitimately has no parts — it rewrites a host
      // facade instead of adding one — so the "invisible" note, which is about
      // additive geometry sitting outside the slice, must not fire for it.
      (blocking.length === 0 && !preset.subtractive ? '  ← invisible to the cast' : '') +
      `, ${dropped} points built over`
  )
  console.log(
    '    metric'.padEnd(18) +
      'before'.padStart(12) +
      'after'.padStart(12) +
      'change'.padStart(10) +
      '  expected  observed'
  )
  for (const e of effects) {
    const pct = (e.relative * 100).toFixed(1)
    console.log(
      `    ${P9_LABELS[e.metric]}`.padEnd(18) +
        fmt(e.metric, e.before).padStart(12) +
        fmt(e.metric, e.after).padStart(12) +
        `${e.relative >= 0 ? '+' : ''}${pct}%`.padStart(10) +
        `  ${ARROW[e.expected] ?? ' '} ${e.expected}`.padEnd(11) +
        `${ARROW[e.observed]} ${e.observed}` +
        (!e.judged ? '   (not judged)' : !e.diagnostic ? '   (sign only)' : '') +
        (e.agrees ? '' : '   <-- MISMATCH')
    )
  }
  console.log('')
}

function fmt(metric, v) {
  if (metric === 'area') return Math.round(v).toLocaleString()
  if (metric === 'occlusivity') return v.toFixed(1)
  return v.toFixed(4)
}

function summarise(rows) {
  const flagged = rows.filter((r) => r.flags.length)
  console.log('='.repeat(78))
  console.log(`${rows.length - flagged.length} of ${rows.length} presets match every expectation.`)

  if (!flagged.length) {
    console.log('No mismatches. Every preset moves every metric in the predicted direction.')
    return
  }

  console.log(`\n${flagged.length} preset(s) disagree with their tag:\n`)
  for (const r of flagged) {
    console.log(`  ${r.preset.name}`)
    for (const f of r.flags) {
      console.log(
        `    ${P9_LABELS[f.metric]}: expected ${f.expected}, measured ${f.observed} ` +
          `(${f.relative >= 0 ? '+' : ''}${(f.relative * 100).toFixed(1)}%)`
      )
    }
  }
  console.log(
    '\nEach of these is either a generator that does not build what it claims, or an\n' +
      'expectation that was wrong about the metric. This script cannot tell which —\n' +
      'that is a judgement, and it is the reason the flags are printed rather than fixed.'
  )
}

main()

// Soft-wrap a note to the terminal, indented under its label.
function wrap(text, indent) {
  const width = 74
  const pad = ' '.repeat(indent + 13)
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim())
      line = w
    } else {
      line += ' ' + w
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join('\n' + pad)
}
