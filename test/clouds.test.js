// P7's gate.
//
// The phase claims that comparing plazas as sets of views, rather than as
// single points, tells you something a single point cannot. That claim is only
// worth making if there is a case where the point-based measure is
// demonstrably, not just theoretically, wrong. These tests construct it.
//
// The constructions are deliberately trivial arrangements in a 4D space whose
// answers can be worked out by hand — the point is to pin the FAILURE MODES of
// each measure, not to check arithmetic against a fixture.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  centroidDistance,
  gaussianDistance,
  chamferDistance,
  cloudDistanceMatrix,
  covariance,
  centroid,
  globalNearestViews,
  matchViews,
  matrixSqrt,
  nearestPair,
  rankAgreement,
  spearman,
  whiten,
} from '../src/lib/analysis/clouds.js'

const UNIT = [1, 1, 1, 1]
// The fitted P5 weights, to check nothing degenerates on the real ones.
const FITTED = [0.3122, 0.2749, 0.2065, 0.2064]

// A cloud of points that differ only along the first metric; the other three
// are held at a constant so every construction below is easy to reason about.
const along = (...values) => values.map((v) => [v, 0.5, 0.5, 0.5])

describe('clouds — the weighted space', () => {
  test('whitening turns weighted distance into plain Euclidean distance', () => {
    const [a, b] = whiten(
      [
        [0, 0, 0, 0],
        [1, 1, 0, 0],
      ],
      [0.25, 0.25, 1, 1]
    )
    // Σ w(Δ)² = 0.25 + 0.25 = 0.5, so the distance is √0.5.
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    assert.ok(Math.abs(d - Math.sqrt(0.5)) < 1e-12, `got ${d}`)
  })

  test('every measure is zero between a cloud and itself, and symmetric', () => {
    const A = along(0.1, 0.4, 0.9)
    const B = along(0.2, 0.3, 0.35, 0.8)
    for (const fn of [centroidDistance, gaussianDistance, chamferDistance]) {
      assert.ok(fn(A, A, FITTED) < 1e-12, `${fn.name} on itself: ${fn(A, A, FITTED)}`)
      assert.ok(
        Math.abs(fn(A, B, FITTED) - fn(B, A, FITTED)) < 1e-12,
        `${fn.name} is not symmetric`
      )
    }
  })
})

describe('clouds — THE GATE: the centroid-failure case', () => {
  // Cloud A is two tight groups of views, far apart: half the plaza is a tight
  // enclosed corner, half is wide open. Cloud B is a single group sitting
  // exactly between them — a uniformly middling plaza, which resembles NEITHER
  // half of A.
  const A = along(0.0, 0.02, 0.98, 1.0)
  const B = along(0.49, 0.5, 0.5, 0.51)

  test('centroid calls the two clouds nearly identical', () => {
    const d = centroidDistance(A, B, FITTED)
    assert.ok(d < 0.01, `centroid should collapse this difference, got ${d}`)
  })

  test('Chamfer reports the real separation', () => {
    const d = chamferDistance(A, B, FITTED)
    // Every view in B is ~0.5 (unweighted) from the nearest view in A, scaled by
    // √0.3122 ≈ 0.559 — so roughly 0.27, orders above the centroid's answer.
    assert.ok(d > 0.2, `Chamfer should see it, got ${d}`)
    assert.ok(
      d > 20 * centroidDistance(A, B, FITTED),
      'Chamfer must be dramatically larger than centroid here, not marginally'
    )
  })

  test('Gaussian also sees it, because the spreads differ', () => {
    // The Gaussian measure is not blind to THIS case — the two clouds have very
    // different variance. It is the next test that finds its limit.
    assert.ok(gaussianDistance(A, B, FITTED) > 0.2)
  })
})

describe('clouds — the Gaussian-failure case', () => {
  // Harder, and the real argument for Chamfer. These two clouds have the SAME
  // mean and the SAME covariance, so any measure built on the first two moments
  // — centroid and Gaussian alike — must call them identical. They are not: A
  // is two separated groups of views, B has its views spread through the middle
  // where A has none.
  //
  // Constructed so the variances match exactly: A sits at ±1, B at ±√2 and 0,
  // both with population variance 1 over four points.
  const s = Math.SQRT2
  const A = along(0.5 - 0.1, 0.5 - 0.1, 0.5 + 0.1, 0.5 + 0.1)
  const B = along(0.5 - 0.1 * s, 0.5, 0.5, 0.5 + 0.1 * s)

  test('the construction really does match on both moments', () => {
    const [wa, wb] = [whiten(A, FITTED), whiten(B, FITTED)]
    const [ma, mb] = [centroid(wa), centroid(wb)]
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(ma[k] - mb[k]) < 1e-12)
    const [ca, cb] = [covariance(wa, ma), covariance(wb, mb)]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        assert.ok(Math.abs(ca[i][j] - cb[i][j]) < 1e-12, `covariance differs at ${i},${j}`)
      }
    }
  })

  test('centroid and Gaussian both report zero — they cannot tell these apart', () => {
    assert.ok(centroidDistance(A, B, FITTED) < 1e-12)
    assert.ok(gaussianDistance(A, B, FITTED) < 1e-9, `got ${gaussianDistance(A, B, FITTED)}`)
  })

  test('Chamfer separates them', () => {
    assert.ok(chamferDistance(A, B, FITTED) > 0.01, 'the modes must survive')
  })
})

describe('clouds — Gaussian distance', () => {
  test('reduces to the centroid distance when the spreads are identical', () => {
    // Two clouds of the same shape, one shifted: the Bures term vanishes and W₂
    // is exactly the distance between the means.
    const A = along(0.1, 0.2, 0.3)
    const B = along(0.5, 0.6, 0.7)
    const g = gaussianDistance(A, B, FITTED)
    const c = centroidDistance(A, B, FITTED)
    assert.ok(Math.abs(g - c) < 1e-9, `${g} vs ${c}`)
  })

  test('charges for a difference in spread alone', () => {
    // Same mean, different spread — the whole distance is the Bures term.
    const tight = along(0.45, 0.5, 0.55)
    const wide = along(0.1, 0.5, 0.9)
    assert.ok(centroidDistance(tight, wide, FITTED) < 1e-12)
    assert.ok(gaussianDistance(tight, wide, FITTED) > 0.05)
  })

  test('survives a rank-deficient cloud without producing NaN', () => {
    // Eight points in four dimensions that vary along ONE axis: the covariance
    // is singular, which is what breaks the inverse-based W₂ formula. This is
    // not a corner case — a plaza whose views differ mainly in area produces
    // very nearly this.
    const flat = along(0.1, 0.2, 0.3, 0.4)
    const other = along(0.6, 0.7, 0.8, 0.9)
    const d = gaussianDistance(flat, other, FITTED)
    assert.ok(Number.isFinite(d) && d > 0, `got ${d}`)
  })

  test('a two-point cloud is still comparable', () => {
    // The minimum a covariance can be estimated from. One point would give no
    // spread at all; the guard in covariance() returns zeros rather than
    // dividing by n−1 = 0.
    const d = gaussianDistance(along(0.2, 0.4), along(0.6, 0.9), FITTED)
    assert.ok(Number.isFinite(d) && d > 0)
    const single = gaussianDistance(along(0.2), along(0.8), FITTED)
    assert.ok(Number.isFinite(single), 'a one-point cloud must not produce NaN')
  })
})

describe('clouds — matrix square root', () => {
  test('squares back to the original matrix', () => {
    const C = covariance(
      whiten(
        [
          [0.1, 0.9, 0.3, 0.5],
          [0.7, 0.2, 0.8, 0.1],
          [0.4, 0.4, 0.2, 0.9],
          [0.9, 0.6, 0.5, 0.3],
        ],
        FITTED
      )
    )
    const R = matrixSqrt(C)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0
        for (let k = 0; k < 4; k++) s += R[i][k] * R[k][j]
        assert.ok(Math.abs(s - C[i][j]) < 1e-10, `(${i},${j}): ${s} vs ${C[i][j]}`)
      }
    }
  })
})

describe('clouds — matrix and ranking helpers', () => {
  const clouds = [along(0.1, 0.2), along(0.5, 0.6), along(0.85, 0.95)]

  test('the distance matrix is symmetric with a zero diagonal', () => {
    for (const m of ['centroid', 'gaussian', 'chamfer']) {
      const D = cloudDistanceMatrix(clouds, FITTED, m)
      for (let i = 0; i < 3; i++) {
        assert.equal(D[i][i], 0, `${m} diagonal`)
        for (let j = 0; j < 3; j++) assert.ok(Math.abs(D[i][j] - D[j][i]) < 1e-12)
      }
    }
  })

  test('an unknown measure fails loudly rather than defaulting', () => {
    assert.throws(() => cloudDistanceMatrix(clouds, FITTED, 'euclidean'), /Unknown cloud measure/)
  })

  test('nearest pair finds the closest two views across the clouds', () => {
    const { a, b, distance } = nearestPair(along(0.1, 0.2), along(0.25, 0.9), UNIT)
    assert.equal(a, 1)
    assert.equal(b, 0)
    assert.ok(Math.abs(distance - 0.05) < 1e-12)
  })

  test('Spearman handles ties by average rank', () => {
    assert.ok(Math.abs(spearman([1, 2, 3], [2, 4, 6]) - 1) < 1e-12)
    assert.ok(Math.abs(spearman([1, 2, 3], [6, 4, 2]) + 1) < 1e-12)
    // All-tied input has no rank variation and no defined correlation; 0 is the
    // documented fallback rather than NaN leaking into a figure.
    assert.equal(spearman([1, 1, 1], [1, 2, 3]), 0)
  })

  test('rank agreement is 1 when two measures order the pairs identically', () => {
    const D = cloudDistanceMatrix(clouds, FITTED, 'centroid')
    const scaled = D.map((row) => row.map((v) => v * 3))
    assert.ok(Math.abs(rankAgreement(D, scaled) - 1) < 1e-12)
  })
})

describe('clouds — view-level matching', () => {
  test('each view is paired with its actual nearest counterpart', () => {
    const A = along(0.1, 0.5, 0.9)
    const B = along(0.12, 0.88)
    const m = matchViews(A, B, UNIT)
    assert.equal(m.length, 3, 'one match per view in A, not per pair')
    assert.deepEqual(m.map((x) => x.bIndex), [0, 0, 1])
    assert.ok(Math.abs(m[0].distance - 0.02) < 1e-12)
  })

  test('several views may match the same counterpart', () => {
    // Not a defect — it is how Chamfer works, and it is a real finding when it
    // happens: one view in B is the best answer for most of A, which is what a
    // plaza with one dominant character looks like from another plaza.
    const m = matchViews(along(0.5, 0.51, 0.52), along(0.5, 0.99), UNIT)
    assert.deepEqual(m.map((x) => x.bIndex), [0, 0, 0])
  })

  test('matching is directional — swapping the clouds is a different question', () => {
    const A = along(0.1, 0.2)
    const B = along(0.15, 0.9, 0.95)
    assert.equal(matchViews(A, B, UNIT).length, 2)
    assert.equal(matchViews(B, A, UNIT).length, 3)
  })

  test('the mean of the matched distances is Chamfer in one direction', () => {
    const A = along(0.1, 0.4, 0.8)
    const B = along(0.2, 0.9)
    const oneWay = matchViews(A, B, UNIT).reduce((s, m) => s + m.distance, 0) / 3
    const other = matchViews(B, A, UNIT).reduce((s, m) => s + m.distance, 0) / 2
    // chamferDistance averages the two directions; this pins that relationship
    // so the diagram on the page cannot drift from the number beside it.
    assert.ok(Math.abs(chamferDistance(A, B, UNIT) - (oneWay + other) / 2) < 1e-12)
  })
})

describe('clouds — corpus-wide closest views', () => {
  const clouds = [
    { siteId: 'a', points: along(0.10, 0.50) },
    { siteId: 'b', points: along(0.11, 0.90) },
    { siteId: 'c', points: along(0.80, 0.85) },
  ]

  test('returns the genuinely closest cross-plaza pairs, in order', () => {
    const top = globalNearestViews(clouds, UNIT, { topN: 3 })
    assert.equal(top[0].aSite, 'a')
    assert.equal(top[0].bSite, 'b')
    assert.ok(Math.abs(top[0].distance - 0.01) < 1e-12)
    for (let i = 1; i < top.length; i++) {
      assert.ok(top[i].distance >= top[i - 1].distance, 'must be sorted ascending')
    }
  })

  test('same-plaza pairs are excluded by default', () => {
    // Within plaza c the two views are 0.05 apart — closer than most cross-plaza
    // pairs here — and must still not appear.
    const top = globalNearestViews(clouds, UNIT, { topN: 20 })
    assert.ok(top.every((m) => m.aSite !== m.bSite), 'a plaza must not match itself')
    const withSame = globalNearestViews(clouds, UNIT, { topN: 20, excludeSameSite: false })
    assert.ok(withSame.some((m) => m.aSite === m.bSite), 'the flag must actually turn it off')
  })

  test('indices point back at the right views', () => {
    const top = globalNearestViews(clouds, UNIT, { topN: 1 })[0]
    const a = clouds.find((c) => c.siteId === top.aSite).points[top.aIndex]
    const b = clouds.find((c) => c.siteId === top.bSite).points[top.bIndex]
    assert.ok(Math.abs(Math.abs(a[0] - b[0]) - top.distance) < 1e-12)
  })

  test('respects topN', () => {
    assert.equal(globalNearestViews(clouds, UNIT, { topN: 2 }).length, 2)
  })
})
