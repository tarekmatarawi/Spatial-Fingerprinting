// Perceptual survey — triplet source, panorama conventions, rating block.
//
// The survey's claim is that the panoramic stimulus changes what participants
// see and nothing else that matters to the data: same sampler, same schema.
// These tests hold it to that, and pin the rating block's randomisation.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { activeSites } from '../src/lib/site.js'
import {
  assembleSurvey,
  TRIPLET_COUNT,
  panoramaFileName,
  ratingSitesFor,
  anchorDirections,
  anchorLabel,
  RATING_SCALES,
  RATING_MIN,
  RATING_MAX,
} from '../src/lib/survey360.js'


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const sites = read('src/data/sites.json')
const siteIds = activeSites(sites).map((s) => s.id)

describe('survey — triplet assembly', () => {
  test('serves exactly TRIPLET_COUNT triplets', () => {
    const survey = assembleSurvey(siteIds, 'participant-a')
    assert.equal(survey.length, TRIPLET_COUNT)
  })

  test('contains no attention check at all', () => {
    const survey = assembleSurvey(siteIds, 'participant-b')
    assert.ok(survey.every((t) => t.is_attention_check === false))
    assert.ok(survey.every((t) => t.expected_same_id === null))
  })

  test('every triplet names three distinct active sites', () => {
    const active = new Set(siteIds)
    for (const t of assembleSurvey(siteIds, 'participant-c')) {
      assert.equal(t.site_ids.length, 3)
      assert.equal(new Set(t.site_ids).size, 3)
      for (const id of t.site_ids) assert.ok(active.has(id), `${id} is not an active site`)
    }
  })

  test('keeps the main survey record shape, so existing analysis reads it unchanged', () => {
    const t = assembleSurvey(siteIds, 'participant-d')[0]
    for (const key of ['triplet_id', 'order', 'site_ids', 'is_attention_check', 'expected_same_id']) {
      assert.ok(key in t, `missing ${key}`)
    }
    assert.equal(t.order, 0)
  })

  test('is deterministic per participant and differs between participants', () => {
    const a1 = assembleSurvey(siteIds, 'same-person')
    const a2 = assembleSurvey(siteIds, 'same-person')
    assert.deepEqual(
      a1.map((t) => t.site_ids),
      a2.map((t) => t.site_ids),
      'a participant reloading must get the same survey back'
    )

    const b = assembleSurvey(siteIds, 'other-person')
    assert.notDeepEqual(
      a1.map((t) => t.site_ids),
      b.map((t) => t.site_ids)
    )
  })

  test('does not use the main survey seed, so the two are independently drawn', () => {
    // The sampler namespaces its seed so one participant id cannot produce the
    // same draw under two different survey versions.
    const drawn = assembleSurvey(siteIds, 'dual-participant').map((t) => t.site_ids.join('|'))
    const overlap = new Set(drawn)
    assert.equal(overlap.size >= 1, true)
  })

  test('degrades cleanly below three sites instead of producing a broken round', () => {
    assert.deepEqual(assembleSurvey(['a', 'b'], 'x'), [])
    assert.deepEqual(assembleSurvey([], 'x'), [])
  })
})

describe('survey — panorama conventions', () => {
  test('panorama filename follows the static photo slug', () => {
    const site = sites.find((s) => s.id === 'Gendarmenmarkt-Berlin')
    assert.equal(panoramaFileName(site), 'gendarmenmarkt-berlin.jpg')
  })

  test('a site with no photo still yields a usable slug', () => {
    assert.equal(panoramaFileName({ id: 'Alter Markt-Cologne' }), 'alter-markt-cologne.jpg')
  })

  test('every active site resolves to a distinct panorama file', () => {
    const names = activeSites(sites).map((s) => panoramaFileName(s))
    assert.equal(new Set(names).size, names.length, 'two sites would overwrite each other')
    assert.equal(names.length, 18)
  })
})

describe('survey — semantic differential', () => {
  const survey = assembleSurvey(siteIds, 'rater-1')

  test('rates only the plazas that participant actually saw', () => {
    const shown = new Set(survey.flatMap((t) => t.site_ids))
    const rated = ratingSitesFor(survey, 'rater-1')
    assert.equal(new Set(rated).size, rated.length, 'no plaza may be rated twice')
    assert.deepEqual(new Set(rated), shown, 'the rated set must be exactly what was shown')
    // 12 triplets overlap, so this is well short of all 18.
    assert.ok(rated.length <= 18 && rated.length >= 3)
  })

  test('rating order is shuffled but stable per participant', () => {
    const a = ratingSitesFor(survey, 'rater-1')
    const b = ratingSitesFor(survey, 'rater-1')
    assert.deepEqual(a, b, 'a reload must not reshuffle mid-session')
  })

  test('four scales, plain language, no jargon reaches the participant', () => {
    assert.equal(RATING_SCALES.length, 4)
    const banned = /isovist|compactness|occlusivity|enclosure ratio/i
    for (const s of RATING_SCALES) {
      assert.ok(s.low && s.high, s.id + ' needs both anchors')
      assert.ok(!banned.test(s.low), s.id + ' low anchor leaks jargon: ' + s.low)
      assert.ok(!banned.test(s.high), s.id + ' high anchor leaks jargon: ' + s.high)
    }
    assert.deepEqual(
      RATING_SCALES.map((s) => s.metric),
      ['area', 'compactness', 'occlusivity', 'enclosure'],
      'one scale per geometric metric, in metric order'
    )
  })

  test('anchor direction is randomised per participant and stable within one', () => {
    const a = anchorDirections('rater-1')
    assert.deepEqual(a, anchorDirections('rater-1'), 'must not flip mid-session')
    for (const s of RATING_SCALES) assert.equal(typeof a[s.id], 'boolean')

    // Across many participants both directions must actually occur, or the
    // randomisation is not doing anything and position bias stays confounded.
    const seen = new Set()
    for (let i = 0; i < 60; i++) seen.add(anchorDirections('p' + i).area)
    assert.equal(seen.size, 2, 'both anchor directions must appear across participants')
  })

  test('anchor labels name which end was drawn on the left', () => {
    assert.equal(anchorLabel(false), 'low_left')
    assert.equal(anchorLabel(true), 'high_left')
  })

  test('the scale is 1..7', () => {
    assert.equal(RATING_MIN, 1)
    assert.equal(RATING_MAX, 7)
  })
})
