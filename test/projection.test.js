// The figures are only worth showing if the projection behind them is honest.
// These tests pin the arithmetic, especially the failure mode that a picture
// would hide: a layout that looks tidy while misrepresenting the distances.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  classicalMDS,
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
