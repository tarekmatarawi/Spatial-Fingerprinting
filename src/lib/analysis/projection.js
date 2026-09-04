// Turning the fitted space into pictures.
//
// The model's whole content is a distance: two plazas are alike to the extent
// that their four normalised metrics are close, weighted by how much each
// dimension actually drove people's choices. Every figure here is a different
// way of looking at that one quantity —
//
//   weightedDistance   the quantity itself, between any two plazas
//   classicalMDS       all 18 laid out in 2D so the distances are visible
//   correlationMatrix  how far the four dimensions are really independent
//
// Kept out of the components so the arithmetic can be tested, and so a figure
// and a reported number can never disagree about what the space is.

// Weighted Euclidean distance — the same metric the choice model uses, with the
// same weights. Written once here so a figure cannot drift from the fit.
export function weightedDistance(a, b, weights) {
  let sum = 0
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k]
    sum += weights[k] * d * d
  }
  return Math.sqrt(sum)
}

export function distanceMatrix(points, weights) {
  const n = points.length
  const D = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = weightedDistance(points[i], points[j], weights)
      D[i][j] = d
      D[j][i] = d
    }
  }
  return D
}

// Classical (Torgerson) MDS: the 2D arrangement whose straight-line distances
// best reproduce the weighted distances above.
//
// It is the honest way to draw "which plazas are alike" — nothing is fitted to
// make the picture tidy, the layout is simply the best flat shadow of the real
// 4D arrangement. `stress` reports how much was lost in flattening, so a reader
// can tell whether the picture is trustworthy: below ~0.15 the 2D view is a
// fair summary, above ~0.25 it is a rough sketch and pairs that look close may
// not be.
export function classicalMDS(points, weights, { dimensions = 2 } = {}) {
  const n = points.length
  const D = distanceMatrix(points, weights)

  // Double-centre the squared distances: B = -0.5 * J D² J. This converts
  // distances into inner products about the centroid, which is what makes the
  // eigenvectors the coordinates.
  const sq = D.map((row) => Array.from(row, (v) => v * v))
  const rowMean = sq.map((r) => r.reduce((a, b) => a + b, 0) / n)
  const grand = rowMean.reduce((a, b) => a + b, 0) / n
  const B = Array.from({ length: n }, (_, i) =>
    Float64Array.from({ length: n }, (_, j) => -0.5 * (sq[i][j] - rowMean[i] - rowMean[j] + grand))
  )

  // Full symmetric eigendecomposition by Jacobi rotation.
  //
  // Not power iteration with deflation, which is the obvious cheaper choice and
  // is wrong here: whenever two eigenvalues are equal — a perfectly symmetric
  // arrangement, for instance — power iteration converges to an arbitrary
  // mixture of that degenerate pair, and deflating by it destroys the second
  // component instead of isolating it. A square grid came out as a line.
  // Jacobi has no such failure mode, and at n = 18 the cost is irrelevant.
  const { values, vectors } = jacobiEigen(B)

  // Largest eigenvalue first; negative ones are the part of the distance
  // structure that no Euclidean arrangement can reproduce, and contribute
  // nothing to the layout.
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a])
  const coords = Array.from({ length: n }, () => new Array(dimensions).fill(0))
  const eigenvalues = []

  for (let d = 0; d < dimensions; d++) {
    const idx = order[d]
    const lambda = Math.max(values[idx], 0)
    eigenvalues.push(lambda)
    const scale = Math.sqrt(lambda)
    for (let i = 0; i < n; i++) coords[i][d] = vectors[i][idx] * scale
  }

  // Kruskal stress-1 between the original distances and the projected ones.
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0
      for (let d = 0; d < dimensions; d++) {
        const diff = coords[i][d] - coords[j][d]
        s += diff * diff
      }
      const projected = Math.sqrt(s)
      num += (D[i][j] - projected) ** 2
      den += D[i][j] ** 2
    }
  }

  return {
    coords,
    eigenvalues,
    stress: den > 0 ? Math.sqrt(num / den) : 0,
    distances: D,
  }
}

// Cyclic Jacobi eigendecomposition for a real symmetric matrix. Returns
// eigenvalues and the matrix of eigenvectors in columns. Exact to machine
// precision for the sizes used here, and — unlike deflated power iteration —
// correct when eigenvalues repeat.
function jacobiEigen(input, { sweeps = 100, tolerance = 1e-12 } = {}) {
  const n = input.length
  const a = input.map((row) => Float64Array.from(row))
  // Identity, accumulating each rotation so the columns end up as eigenvectors.
  const v = Array.from({ length: n }, (_, i) =>
    Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  )

  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j]
    }
    if (Math.sqrt(off) < tolerance) break

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        // Rotation angle that zeroes a[p][q].
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        for (let k = 0; k < n; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }

  return { values: Array.from({ length: n }, (_, i) => a[i][i]), vectors: v }
}

export function pearson(xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

// Pairwise correlations between the metric columns — the evidence behind the
// claim that the four dimensions are not independent in real squares.
export function correlationMatrix(points) {
  const dims = points[0].length
  const columns = Array.from({ length: dims }, (_, k) => points.map((p) => p[k]))
  return Array.from({ length: dims }, (_, i) =>
    Array.from({ length: dims }, (_, j) => (i === j ? 1 : pearson(columns[i], columns[j])))
  )
}

// Least-squares fit, for drawing a trend line through a scatter.
export function linearFit(xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: my - slope * mx }
}
