// P9's precedent panel — the gate on the bridge back to P7 and P8.
//
// The panel makes one claim that is not obvious and that everything else it
// says depends on: a 120° reading cast HEIGHT-AWARE inside the P9 sandbox is
// comparable to the 144 corpus readings, every one of which was cast UNFLAGGED
// by P7. Those are two different modes of the same engine. If they disagreed on
// real geometry, every distance in the ranking would be part intervention and
// part measurement artefact, and the artefact would be invisible — the numbers
// would look entirely reasonable and the ranking would be wrong.
//
// The first test below settles it by brute force, over all 144 corpus views on
// all eighteen real sites rather than on a constructed case. It comes out at
// exactly zero, and the reason it can is worth stating: height-aware mode drops
// a footprint only when it fails to straddle 1.6 m, and there is exactly ONE
// such footprint in the whole corpus — a 1.2 m structure at Gendarmenmarkt,
// which sits 840 m from the nearest Gendarmenmarkt vantage and so is beyond the
// 200 m sight line of every view in the study. The equivalence is therefore a
// fact about this corpus, not a general one, which is precisely why it is
// asserted against the corpus and would fail loudly if a low structure were
// ever added near a plaza.
//
// The rest of the file pins the layer separation (120° bounds, never the 360°
// field's), the exclusion rule, and the P8 evidence summary's refusal to
// describe an unfinished study as validated.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRECEDENT_FOV_DEG,
  PRECEDENT_FOV_MODE,
  PRECEDENT_RANGE_M,
  PRECEDENT_RAY_COUNT,
  buildCorpusViews,
  buildProbeIndex,
  defaultHeading,
  normaliseReading,
  precedentEvidence,
  probeView,
  rankPrecedents,
  segmentLabelFits,
  standableVantage,
} from '../src/lib/precedent.js'
import { buildEdgeIndex, castIsovist } from '../src/lib/isovist.js'
import { activeSites, projectSite } from '../src/lib/site.js'
import { analyseMatchedView } from '../src/lib/analysis/matchedView.js'
import { makePresetElement, defaultParams } from '../src/lib/presets.js'
import { METRICS } from '../src/lib/analysis/fingerprints.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const CASE_SITE_ID = 'Konstablerwache-Frankfurt am Main'
const sites = read('src/data/sites.json')
const readings = read('src/data/results.json')
const cloudFile = read('src/data/view-clouds.json')
const zones = read('src/data/zones.json')
const fieldIndex = read('src/data/fields/index.json')

const active = activeSites(sites)
const activeIds = active.map((s) => s.id)
const WEIGHTS = zones.weighted_by.weights

const corpus = buildCorpusViews(readings, cloudFile.markers ?? [], activeIds)
const site = active.find((s) => s.id === CASE_SITE_ID)
const geometry = projectSite(site)

describe('height-aware and unflagged agree on the surveyed corpus', () => {
  // THE GATE. Without this the panel is comparing two measurement systems.
  test('all 144 corpus views measure identically in both modes', () => {
    let checked = 0

    for (const s of active) {
      const g = projectSite(s)
      const plain = buildEdgeIndex(g.buildings)
      const aware = buildEdgeIndex(g.buildings, { heightAware: true })
      const options = {
        fov: PRECEDENT_FOV_DEG,
        rayCount: PRECEDENT_RAY_COUNT,
        range: PRECEDENT_RANGE_M,
      }

      for (const view of corpus.views.filter((v) => v.siteId === s.id)) {
        const m = view.marker
        const vantage = { x: m.local_x, y: m.local_y }
        const heading = (m.direction_deg * Math.PI) / 180

        const a = castIsovist(vantage, heading, g.buildings, { ...options, index: plain })
        const b = castIsovist(vantage, heading, g.buildings, {
          ...options,
          index: aware,
          heightAware: true,
        })

        // Exact equality, not a tolerance. The two casts should be walking the
        // same edge list; a tolerance here would let a real discrepancy hide
        // under it and would turn this from a gate into a reassurance.
        for (const k of ['area', 'compactness', 'occlusivity', 'enclosureRatio']) {
          assert.equal(a[k], b[k], `${s.id} view ${view.viewNumber}: ${k} differs between modes`)
        }
        checked++
      }
    }

    assert.equal(checked, 144, 'expected 18 plazas × 8 views')
  })

  test('exactly one corpus footprint sits below eye height, and it is out of every sight line', () => {
    // The fact the gate above rests on, asserted separately so that if a low
    // structure is ever added the failure names the cause rather than showing
    // up as an unexplained metric mismatch.
    const low = []
    for (const s of active) {
      const g = projectSite(s)
      for (const b of g.buildings) {
        if (!(b.height > 1.6)) low.push({ siteId: s.id, building: b })
      }
    }
    assert.equal(low.length, 1, `expected one sub-eye-height footprint, found ${low.length}`)

    for (const { siteId, building } of low) {
      const centroid = building.footprint.reduce(
        (acc, p, _i, arr) => ({ x: acc.x + p.x / arr.length, y: acc.y + p.y / arr.length }),
        { x: 0, y: 0 }
      )
      for (const view of corpus.views.filter((v) => v.siteId === siteId)) {
        const d = Math.hypot(view.marker.local_x - centroid.x, view.marker.local_y - centroid.y)
        assert.ok(
          d > PRECEDENT_RANGE_M,
          `${siteId} view ${view.viewNumber} is ${d.toFixed(0)} m from a sub-eye-height ` +
            'footprint — inside the sight line, so the two cast modes can no longer agree'
        )
      }
    }
  })
})

describe('the layer stays separate', () => {
  test('the corpus is the 120° layer, scaled on its own bounds', () => {
    assert.equal(corpus.fovMode, 'perceptual_120')
    assert.equal(PRECEDENT_FOV_MODE, 'perceptual_120')
    assert.equal(corpus.total, 144)
    assert.equal(corpus.siteIds.length, 18)

    // The bounds must NOT be the field layer's. Both name the same four metrics
    // and both run 0–1, so a mix-up produces numbers that look right — this is
    // the one place it can be caught mechanically.
    for (const m of METRICS) {
      assert.notEqual(
        corpus.bounds[m].min,
        fieldIndex.bounds[m].min,
        `${m}: 120° bounds coincide with the 360° field bounds — a layer has leaked`
      )
    }
  })

  test('a probe and a corpus view land on one ruler', () => {
    // normaliseReading must reproduce, to the bit, the normalised vectors
    // buildClouds computed for the corpus. If it did not, the probe would be
    // measured against a scale nothing else on the page uses.
    for (const view of corpus.views) {
      const n = normaliseReading(view.marker, corpus.bounds)
      for (let k = 0; k < METRICS.length; k++) {
        assert.equal(n[k], view.n[k], `${view.siteId} view ${view.viewNumber}, ${METRICS[k]}`)
      }
    }
  })

  test('a probe declares its own layer on every record', () => {
    const { composed, index } = buildProbeIndex(geometry, [])
    const probe = probeView({
      vantage: geometry.centroid,
      headingRad: 0,
      composed,
      index,
    })
    assert.equal(probe.fov_mode, 'perceptual_120')
    assert.equal(probe.fov_deg, 120)
    assert.equal(probe.ray_count, 120)
    assert.equal(probe.range_m, 200)
    assert.equal(probe.rays.length, 120)
    // 200 m everywhere, P1 through P9. A second viewing range would make this
    // panel's distances incomparable with every other number in the platform.
    assert.equal(PRECEDENT_RANGE_M, 200)
  })
})

describe('ranking', () => {
  const { composed, index } = buildProbeIndex(geometry, [])
  const own = corpus.views.filter((v) => v.siteId === CASE_SITE_ID)

  test("a probe at a corpus view's own vantage ranks that view first", () => {
    // The end-to-end check that the probe, the normalisation and the ranking
    // agree with what P7 stored. It is not exactly zero and should not be
    // expected to be: headings and coordinates are stored to two decimals, and
    // at a plaza with street openings a hundredth of a degree can move a ray
    // between a near facade and a 200 m escape (docs/spec.md, precision note).
    for (const view of own) {
      const m = view.marker
      const probe = probeView({
        vantage: { x: m.local_x, y: m.local_y },
        headingRad: (m.direction_deg * Math.PI) / 180,
        composed,
        index,
      })
      const ranked = rankPrecedents({ probe, corpus, weights: WEIGHTS, excludeSiteId: null })
      assert.equal(ranked.ranked[0].siteId, CASE_SITE_ID)
      assert.equal(ranked.ranked[0].viewNumber, view.viewNumber)
      assert.ok(
        ranked.ranked[0].distance < 1e-2,
        `view ${view.viewNumber} recovered at distance ${ranked.ranked[0].distance}`
      )
    }
  })

  test('the home plaza is excluded by default and restored by the toggle', () => {
    const probe = probeView({
      vantage: geometry.centroid,
      headingRad: defaultHeading({ x: geometry.centroid.x + 20, y: geometry.centroid.y }, geometry.centroid),
      composed,
      index,
    })

    const without = rankPrecedents({ probe, corpus, weights: WEIGHTS, excludeSiteId: CASE_SITE_ID })
    assert.equal(without.pooled, 144 - own.length)
    assert.equal(without.excluded, own.length)
    for (const v of without.ranked) assert.notEqual(v.siteId, CASE_SITE_ID)

    const with_ = rankPrecedents({ probe, corpus, weights: WEIGHTS, excludeSiteId: null })
    assert.equal(with_.pooled, 144)
    assert.equal(with_.excluded, 0)
  })

  test('distances are ordered, and contributions sum to the squared distance', () => {
    const probe = probeView({ vantage: geometry.centroid, headingRad: 1.2, composed, index })
    const ranked = rankPrecedents({ probe, corpus, weights: WEIGHTS, excludeSiteId: CASE_SITE_ID })

    assert.equal(ranked.ranked.length, 5)
    for (let i = 1; i < ranked.ranked.length; i++) {
      assert.ok(ranked.ranked[i].distance >= ranked.ranked[i - 1].distance)
    }

    for (const v of ranked.ranked) {
      const sum = v.contributions.reduce((s, c) => s + c, 0)
      assert.ok(
        Math.abs(sum - v.distance ** 2) < 1e-12,
        'the per-metric contributions must decompose the distance exactly, or the figure ' +
          'built from them is describing a different quantity from the ranking'
      )
      const shares = v.shares.reduce((s, c) => s + c, 0)
      assert.ok(Math.abs(shares - 1) < 1e-12)
    }
  })

  test('separation reports the gap between first and second', () => {
    const probe = probeView({ vantage: geometry.centroid, headingRad: 0.4, composed, index })
    const ranked = rankPrecedents({ probe, corpus, weights: WEIGHTS, excludeSiteId: CASE_SITE_ID })
    const expected =
      (ranked.ranked[1].distance - ranked.ranked[0].distance) / ranked.ranked[0].distance
    assert.ok(Math.abs(ranked.separation - expected) < 1e-12)
  })

  test('out-of-range components are named, never clipped', () => {
    // A synthetic reading well past the corpus range. It must survive into the
    // ranking rather than being clamped onto the boundary alongside every other
    // extreme view, and it must be reported.
    const wild = {
      area_m2: fieldIndex.bounds.area.max * 10,
      compactness: 0.15,
      occlusivity_m: 300,
      enclosure_ratio: 0.2,
    }
    const ranked = rankPrecedents({ probe: wild, corpus, weights: WEIGHTS, excludeSiteId: null })
    assert.ok(ranked.probeN[0] > 1, 'an out-of-range value was clipped')
    assert.ok(ranked.outOfRange.includes('area'))
    assert.equal(ranked.ranked.length, 5)
  })
})

describe('where a person may stand', () => {
  const { composed } = buildProbeIndex(geometry, [])

  test('the boundary and the 1 m facade clearance are both enforced', () => {
    assert.ok(standableVantage(geometry.centroid, composed, geometry.boundary))
    assert.ok(
      !standableVantage(
        { x: geometry.centroid.x + 500, y: geometry.centroid.y },
        composed,
        geometry.boundary
      ),
      'a point far outside the boundary was accepted'
    )

    // Half a metre off a real facade corner: inside the boundary, but not
    // somewhere a person stands.
    const wall = geometry.buildings.find((b) => b.footprint.length > 2)
    const corner = wall.footprint[0]
    assert.ok(
      !standableVantage({ x: corner.x + 0.4, y: corner.y + 0.4 }, composed, geometry.boundary),
      'a point inside the facade clearance was accepted'
    )
  })

  test('a drawn mass blocks a vantage; a part that misses eye height does not', () => {
    // A colonnade's columns straddle 1.6 m, so standing in one is refused. Its
    // footprint centre sits between columns and stays open, which is the
    // behaviour that makes height-aware mode worth having — the alternative
    // would delete standable ground from under every pergola in the sandbox.
    const at = { x: geometry.centroid.x, y: geometry.centroid.y }
    const colonnade = makePresetElement('colonnade', at, defaultParams('colonnade'), 0)
    const withMass = buildProbeIndex(geometry, [colonnade])

    const blocked = withMass.composed.buildings.filter((b) => b.sandbox)
    assert.ok(blocked.length > 0, 'the colonnade contributed no obstructing parts')

    const column = blocked[0].footprint
    const inside = column.reduce(
      (acc, p, _i, arr) => ({ x: acc.x + p.x / arr.length, y: acc.y + p.y / arr.length }),
      { x: 0, y: 0 }
    )
    assert.ok(
      !standableVantage(inside, withMass.composed, geometry.boundary),
      'a vantage inside a drawn column was accepted'
    )
    assert.ok(
      standableVantage(inside, composed, geometry.boundary),
      'the same point must be standable before the colonnade is drawn, or this test ' +
        'is measuring the plaza rather than the intervention'
    )
  })
})

describe('the decomposition figure keeps its caption honest', () => {
  // The figure tells the reader "a band with no figure on it is under about 5%".
  // That is arithmetic, not decoration, and it is the kind of promise that rots
  // silently: widen the label column or nudge the type scale and the figure
  // still renders perfectly while the caption has become false.
  //
  // BAR_W mirrors the component's layout (CANVAS_W 900 − labelW 210 − 110 for
  // the distance column). If that changes, this fails and the caption gets
  // rewritten with it, which is the point.
  const BAR_W = 900 - 210 - 110

  test('every share of 5% or more is lettered', () => {
    for (let pct = 5; pct <= 100; pct++) {
      assert.ok(
        segmentLabelFits(pct / 100, BAR_W),
        `${pct}% would go unlabelled, but the caption promises it is shown`
      )
    }
  })

  test('and it holds on the real corpus, not only in principle', () => {
    // The failure this replaces. Bars were once scaled to the largest distance
    // in the set, so the CLOSEST precedents had the shortest bars and lost
    // their labels first — the rows a designer cares about most. Measured
    // against real probes, a 15% share went unlettered on a second-place row.
    // Equal-width bars are what fixed it, and this checks it against the same
    // real geometry rather than trusting the arithmetic above.
    const { composed, index } = buildProbeIndex(geometry, [])
    let worstDropped = 0

    for (const offset of [
      [10, 5],
      [-25, 18],
      [30, -22],
      [0, 0],
      [45, 10],
      [-40, -30],
    ]) {
      const vantage = { x: geometry.centroid.x + offset[0], y: geometry.centroid.y + offset[1] }
      const probe = probeView({
        vantage,
        headingRad: defaultHeading(vantage, geometry.centroid),
        composed,
        index,
      })
      const ranked = rankPrecedents({
        probe,
        corpus,
        weights: WEIGHTS,
        excludeSiteId: CASE_SITE_ID,
      })

      for (const row of ranked.ranked) {
        const total = row.distance ** 2
        for (const contribution of row.contributions) {
          const share = contribution / total
          if (!segmentLabelFits(share, BAR_W)) worstDropped = Math.max(worstDropped, share)
        }
      }
    }

    assert.ok(
      worstDropped < 0.05,
      `a share of ${(worstDropped * 100).toFixed(1)}% went unlabelled — the caption says ` +
        'unlabelled bands are under about 5%'
    )
  })
})

describe('the P8 evidence summary', () => {
  const bank = read('src/data/matched-view-trials.json')
  const responses = read('src/data/matched-view-responses.json')
  const evidence = precedentEvidence(analyseMatchedView(responses, bank))

  test('reads the live analysis rather than a remembered number', () => {
    assert.ok(evidence)
    assert.equal(evidence.participants, 15)
    assert.equal(evidence.judgements, 180)
    assert.equal(evidence.agreement.n, 90)
    assert.equal(evidence.discriminating.n, 90)
    // Not asserted as fixed values: these move with every batch of responses,
    // and pinning them here would make collecting data break the test suite.
    assert.ok(evidence.agreement.accuracy > 0.5 && evidence.agreement.accuracy < 1)
    assert.ok(evidence.discriminating.accuracy > 0 && evidence.discriminating.accuracy < 1)
  })

  test('does not call the agreement stratum significant on the current sample', () => {
    // The point of the whole summary. At 15 of ~40 participants the sign test
    // is p ≈ 0.15, and a panel headed "closest validated precedent view" must
    // not be quietly asserting otherwise.
    assert.equal(evidence.agreement.significant, evidence.agreement.signP < 0.05)
    assert.equal(evidence.agreement.significant, false)
    assert.match(evidence.status, /Interim/)
  })

  test('reports the sign test alongside the pooled one, not instead of it', () => {
    // The pooled binomial treats one participant's twelve answers as twelve
    // independent observations, so it is the optimistic number. Both are
    // carried; a summary offering only the pooled p would be overstating the
    // study by a factor of ten here.
    assert.ok(evidence.agreement.pooledP < evidence.agreement.signP)
    assert.ok(evidence.agreement.ci.low != null && evidence.agreement.ci.high != null)
  })

  test('the adjudication is McNemar on discordant trials only', () => {
    assert.equal(evidence.discriminating.discordant, 90)
    assert.equal(
      evidence.discriminating.significant,
      evidence.discriminating.mcnemarP < 0.05
    )
  })

  test('returns nothing rather than something invented when the analysis is missing', () => {
    assert.equal(precedentEvidence(null), null)
    assert.equal(precedentEvidence({}), null)
    assert.equal(precedentEvidence({ strata: {} }), null)
  })
})
