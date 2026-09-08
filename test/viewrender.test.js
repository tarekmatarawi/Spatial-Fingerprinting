// The one thing in the perspective renderer that can be wrong without looking
// wrong.
//
// The metrics sweep 120° HORIZONTALLY. Three.js cameras are specified by their
// VERTICAL field, and the horizontal extent that produces depends on the aspect
// ratio of the canvas. Hand three.js the 120 directly and the render shows a
// different amount of the world than was measured — a picture that quietly
// disagrees with the numbers printed beneath it, which is the failure mode this
// whole component exists to avoid.
//
// These tests pin the conversion by inverting it: from the vertical FOV the
// function returns, recompute the horizontal one and check it comes back.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { verticalFov, horizontalFov, lookTarget, EYE_HEIGHT_M } from '../src/lib/viewGeometry.js'

describe('ViewRender — field of view conversion', () => {
  test('round-trips to the horizontal field that was asked for', () => {
    for (const aspect of [16 / 9, 16 / 10, 4 / 3, 1, 2.4]) {
      const v = verticalFov(120, aspect)
      const back = horizontalFov(v, aspect)
      assert.ok(
        Math.abs(back - 120) < 1e-9,
        `aspect ${aspect.toFixed(3)}: got ${back}° horizontal, wanted 120°`
      )
    }
  })

  test('a square frame leaves the field unchanged', () => {
    assert.ok(Math.abs(verticalFov(120, 1) - 120) < 1e-9)
  })

  test('a wider frame needs a narrower vertical field', () => {
    const wide = verticalFov(120, 16 / 9)
    assert.ok(wide < 120, `expected under 120, got ${wide}`)
  })

  test('the naive version — passing 120 straight through — is measurably wrong', () => {
    // What the render would show on a 16:9 frame if the conversion were skipped:
    // 144°, a full 24° more of the world than the isovist counted. Pinned as a
    // number so the size of the error is on the record, not just its direction.
    const naive = horizontalFov(120, 16 / 9)
    assert.ok(Math.abs(naive - 144.0) < 0.1, `expected ~144°, got ${naive.toFixed(1)}°`)
  })

  test('is monotonic in the horizontal field', () => {
    const a = verticalFov(90, 16 / 9)
    const b = verticalFov(120, 16 / 9)
    assert.ok(b > a, 'a wider horizontal field must not narrow the vertical one')
  })
})

describe('view geometry — where the camera looks', () => {
  test('bearings point the compass way, matching bearingTo in isovist.js', () => {
    const at = { x: 0, y: 0 }
    const near = (a, b) => Math.abs(a - b) < 1e-9
    // North, east, south, west. If sin and cos were swapped every render would
    // be mirrored east-for-west — and would look entirely plausible.
    const [nx, ny] = lookTarget(at, 0, 10)
    assert.ok(near(nx, 0) && near(ny, 10), `0° must face north, got ${nx},${ny}`)
    const [ex, ey] = lookTarget(at, 90, 10)
    assert.ok(near(ex, 10) && near(ey, 0), `90° must face east, got ${ex},${ey}`)
    const [sx, sy] = lookTarget(at, 180, 10)
    assert.ok(near(sx, 0) && near(sy, -10), `180° must face south, got ${sx},${sy}`)
    const [wx, wy] = lookTarget(at, 270, 10)
    assert.ok(near(wx, -10) && near(wy, 0), `270° must face west, got ${wx},${wy}`)
  })

  test('the target sits at eye height, level with the camera', () => {
    // A target above or below eye height would tilt the camera, and a tilted
    // 120° frame does not show the 120° that was measured on the ground plane.
    assert.equal(lookTarget({ x: 5, y: 5 }, 33)[2], EYE_HEIGHT_M)
  })

  test('the vantage is carried through unchanged', () => {
    const [x, y] = lookTarget({ x: 100, y: -50 }, 0, 1)
    assert.ok(Math.abs(x - 100) < 1e-9 && Math.abs(y - -49) < 1e-9)
  })
})
