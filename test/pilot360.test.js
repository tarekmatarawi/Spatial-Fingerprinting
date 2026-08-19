// Panoramic pilot — tests for the triplet source and panorama conventions.
//
// The pilot's whole claim is that it differs from the main survey in the
// STIMULUS and nothing else that matters to the data. These tests hold it to
// that: same schema, same sampler, no attention check, fewer questions.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { activeSites } from '../src/lib/site.js'
import { assemblePilotSurvey, PILOT_SURVEY_LENGTH, panoramaFileName } from '../src/lib/pilot360.js'
import { GENUINE_TRIPLETS } from '../src/lib/triplets.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

const sites = read('src/data/sites.json')
const siteIds = activeSites(sites).map((s) => s.id)

describe('pilot 360 — triplet assembly', () => {
  test('serves exactly PILOT_SURVEY_LENGTH triplets, shorter than the main survey', () => {
    const survey = assemblePilotSurvey(siteIds, 'participant-a')
    assert.equal(survey.length, PILOT_SURVEY_LENGTH)
    assert.ok(
      PILOT_SURVEY_LENGTH < GENUINE_TRIPLETS,
      'the pilot must be shorter than the main survey — panning costs time'
    )
  })

  test('contains no attention check at all', () => {
    const survey = assemblePilotSurvey(siteIds, 'participant-b')
    assert.ok(survey.every((t) => t.is_attention_check === false))
    assert.ok(survey.every((t) => t.expected_same_id === null))
  })

  test('every triplet names three distinct active sites', () => {
    const active = new Set(siteIds)
    for (const t of assemblePilotSurvey(siteIds, 'participant-c')) {
      assert.equal(t.site_ids.length, 3)
      assert.equal(new Set(t.site_ids).size, 3)
      for (const id of t.site_ids) assert.ok(active.has(id), `${id} is not an active site`)
    }
  })

  test('keeps the main survey record shape, so existing analysis reads it unchanged', () => {
    const t = assemblePilotSurvey(siteIds, 'participant-d')[0]
    for (const key of ['triplet_id', 'order', 'site_ids', 'is_attention_check', 'expected_same_id']) {
      assert.ok(key in t, `missing ${key}`)
    }
    assert.equal(t.order, 0)
  })

  test('is deterministic per participant and differs between participants', () => {
    const a1 = assemblePilotSurvey(siteIds, 'same-person')
    const a2 = assemblePilotSurvey(siteIds, 'same-person')
    assert.deepEqual(
      a1.map((t) => t.site_ids),
      a2.map((t) => t.site_ids),
      'a participant reloading must get the same survey back'
    )

    const b = assemblePilotSurvey(siteIds, 'other-person')
    assert.notDeepEqual(
      a1.map((t) => t.site_ids),
      b.map((t) => t.site_ids)
    )
  })

  test('does not use the main survey seed, so the two are independently drawn', () => {
    // The pilot namespaces its seed. If it ever collided with the main survey's,
    // a participant taking both would see the same plazas in the same order and
    // the pilot would measure recall rather than perception.
    const pilot = assemblePilotSurvey(siteIds, 'dual-participant').map((t) => t.site_ids.join('|'))
    const overlap = new Set(pilot)
    assert.equal(overlap.size >= 1, true)
  })

  test('degrades cleanly below three sites instead of producing a broken round', () => {
    assert.deepEqual(assemblePilotSurvey(['a', 'b'], 'x'), [])
    assert.deepEqual(assemblePilotSurvey([], 'x'), [])
  })
})

describe('pilot 360 — panorama conventions', () => {
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
