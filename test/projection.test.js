// The figures are only worth showing if the projection behind them is honest.
// These tests pin the arithmetic, especially the failure mode that a picture
// would hide: a layout that looks tidy while misrepresenting the distances.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  classicalMDS,
  distanceMatrix,
  dimensionLoadings,
  nearestNeighbours,
  histogram,
  kde,
  placeLabels,
  weightedDistance,
  correlationMatrix,
  linearFit,
  pearson,
} from '../src/lib/analysis/projection.js'

const UNIT = [1, 1, 1, 1]

describe('projection — weighted distance', () => {
  test('weights scale each dimension\'s contribution', () => {
    const a = [0, 0, 0, 0]
    const b = [1, 0, 0, 0]
    assert.equal(weightedDistance(a, b, UNIT), 1)
    assert.equal(weightedDistance(a, b, [0.25, 1, 1, 1]), 0.5)
    // A dimension with zero weight cannot separate anything.
    assert.equal(weightedDistance(a, b, [0, 1, 1, 1]), 0)
  })
})

describe('projection — classical MDS', () => {
  test('reproduces a flat arrangement exactly', () => {
    // A 4x4 grid living in a 4D space is genuinely two-dimensional, so the
    // projection must be lossless.
    const grid = []
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) grid.push([x, y, 0, 0])
    const m = classicalMDS(grid, UNIT)

    assert.ok(m.stress < 1e-9, `flat data must project without loss, got stress ${m.stress}`)
    for (let i = 0; i < grid.length; i++) {
      for (let j = i + 1; j < grid.length; j++) {
        const truth = weightedDistance(grid[i], grid[j], UNIT)
        const drawn = Math.hypot(m.coords[i][0] - m.coords[j][0], m.coords[i][1] - m.coords[j][1])
        assert.ok(Math.abs(truth - drawn) < 1e-9, `pair ${i},${j}: ${truth} vs ${drawn}`)
      }
    }
  })

  test('survives repeated eigenvalues', () => {
    // The square grid above has two identical eigenvalues. Deflated power
    // iteration collapses it to a line here; this asserts both axes survive.
    const grid = []
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) grid.push([x, y, 0, 0])
    const m = classicalMDS(grid, UNIT)
    assert.ok(m.eigenvalues[1] > 0.99 * m.eigenvalues[0], 'the second axis must not be destroyed')
    const spread = (d) => {
      const vs = m.coords.map((c) => c[d])
      return Math.max(...vs) - Math.min(...vs)
    }
    assert.ok(spread(0) > 1 && spread(1) > 1, 'both axes must carry real extent')
  })

  test('reports honest stress when the data will not flatten', () => {
    // A cube is irreducibly 3D; squashing it into 2D must show as loss rather
    // than being silently smoothed away.
    const cube = []
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) cube.push([x, y, z, 0])
    const m = classicalMDS(cube, UNIT)
    assert.ok(m.stress > 0.1, `a cube cannot be flat, got stress ${m.stress}`)
  })

  test('weighting changes the layout, not just the labels', () => {
    const pts = [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ]
    const even = classicalMDS(pts, UNIT)
    const skewed = classicalMDS(pts, [1, 0.01, 1, 1])
    const spread = (m) => {
      const d = []
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++)
          d.push(Math.hypot(m.coords[i][0] - m.coords[j][0], m.coords[i][1] - m.coords[j][1]))
      return d
    }
    assert.notDeepEqual(spread(even), spread(skewed))
  })
})

describe('projection — correlation helpers', () => {
  test('correlation matrix is symmetric with a unit diagonal', () => {
    const pts = [
      [1, 2, 3, 4],
      [2, 1, 5, 3],
      [3, 5, 1, 2],
      [4, 3, 2, 1],
      [5, 4, 4, 5],
    ]
    const C = correlationMatrix(pts)
    for (let i = 0; i < 4; i++) {
      assert.equal(C[i][i], 1)
      for (let j = 0; j < 4; j++) assert.ok(Math.abs(C[i][j] - C[j][i]) < 1e-12)
      for (let j = 0; j < 4; j++) assert.ok(C[i][j] >= -1.000001 && C[i][j] <= 1.000001)
    }
  })

  test('a perfect line correlates at 1 and is fitted exactly', () => {
    const xs = [0, 1, 2, 3, 4]
    const ys = xs.map((x) => 3 * x + 7)
    assert.ok(Math.abs(pearson(xs, ys) - 1) < 1e-12)
    const { slope, intercept } = linearFit(xs, ys)
    assert.ok(Math.abs(slope - 3) < 1e-12)
    assert.ok(Math.abs(intercept - 7) < 1e-12)
  })
})

describe('projection — figure helpers', () => {
  test('nearest neighbours come back in order, with real indices', () => {
    // Four points on a line: distances from 0 are 1, 2, 4.
    const pts = [[0, 0, 0, 0], [1, 0, 0, 0], [3, 0, 0, 0], [7, 0, 0, 0]]
    const D = distanceMatrix(pts, UNIT)
    const near = nearestNeighbours(D, 0, 3)

    assert.deepEqual(near.map((n) => n.index), [1, 2, 3])
    assert.deepEqual(near.map((n) => n.distance), [1, 3, 7])
    // The regression this pins: distanceMatrix rows are Float64Arrays, whose
    // map() coerces the returned objects back to numbers — every index came
    // back undefined and the map drew leaders to nowhere.
    assert.ok(near.every((n) => Number.isInteger(n.index)))
    // A plaza is never its own neighbour.
    assert.ok(!nearestNeighbours(D, 2, 3).some((n) => n.index === 2))
  })

  test('dimension loadings correlate each metric against each axis', () => {
    // Points that vary only on the first metric must load entirely on the
    // first MDS axis, and not at all on the second.
    const pts = [0, 1, 2, 3, 4, 5].map((v) => [v, 0, 0, 0])
    const { coords } = classicalMDS(pts, UNIT)
    const L = dimensionLoadings(pts, coords)

    assert.equal(L.length, 4)
    assert.equal(L[0].length, 2)
    assert.ok(Math.abs(Math.abs(L[0][0]) - 1) < 1e-9, 'metric 1 must load fully on axis 1')
    assert.ok(Math.abs(L[0][1]) < 1e-6, 'metric 1 must not load on axis 2')
  })

  test('histogram bins every value exactly once, edges included', () => {
    const values = [0, 0.1, 0.5, 0.99, 1]
    const bins = histogram(values, { bins: 4 })
    assert.equal(bins.length, 4)
    assert.equal(bins.reduce((a, b) => a + b.count, 0), values.length)
    // 1.0 belongs to the last bin, not to a fifth one off the end.
    assert.equal(bins[3].count, 2)
  })

  test('the density curve integrates to about one and peaks near the data', () => {
    const values = [0.48, 0.5, 0.5, 0.52]
    const curve = kde(values, { samples: 200 })
    const step = curve[1].x - curve[0].x
    const mass = curve.reduce((a, c) => a + c.density * step, 0)
    assert.ok(Math.abs(mass - 1) < 0.05, `density should integrate to ~1, got ${mass}`)
    const peak = curve.reduce((a, c) => (c.density > a.density ? c : a))
    assert.ok(Math.abs(peak.x - 0.5) < 0.05)
  })

  test('identical values do not divide by a zero bandwidth', () => {
    const curve = kde([0.5, 0.5, 0.5], { samples: 20 })
    assert.ok(curve.every((c) => Number.isFinite(c.density)))
  })

  test('label placement separates labels that would otherwise collide', () => {
    // Three points stacked in one spot: no two labels may end up in the same
    // place, and none may be dropped.
    const items = [
      { x: 100, y: 100, text: 'Alpha' },
      { x: 104, y: 102, text: 'Beta' },
      { x: 108, y: 98, text: 'Gamma' },
    ]
    const placed = placeLabels(items, { width: 400, height: 300 })
    assert.equal(placed.length, 3)
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const same = placed[i].x === placed[j].x && placed[i].y === placed[j].y
        assert.ok(!same, 'two labels landed on the same point')
      }
    }
  })

  test('label placement is deterministic and stays inside the frame', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      x: 20 + (i % 4) * 90,
      y: 20 + Math.floor(i / 4) * 60,
      text: `Plaza ${i}`,
    }))
    const a = placeLabels(items, { width: 400, height: 220 })
    const b = placeLabels(items, { width: 400, height: 220 })
    assert.deepEqual(a, b, 'the same input must always give the same layout')
    // Nothing pushed off the edge: the frame cost dominates every collision.
    for (const l of a) {
      assert.ok(l.x >= -40 && l.x <= 440)
      assert.ok(l.y >= -20 && l.y <= 260)
    }
  })
})
