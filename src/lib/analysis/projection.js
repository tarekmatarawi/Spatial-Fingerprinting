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

// How to read the two MDS axes.
//
// Classical MDS returns axes that are mathematically well-defined but have no
// name: they are whatever directions carry the most spread. Correlating each
// original metric against each axis is what turns them from "Dimension 1" into
// something a reader can interpret — an axis that correlates +0.9 with area is
// an area axis, whatever the algorithm called it.
//
// Returns one row per metric: { r: [rDim1, rDim2] }, Pearson across the plazas.
export function dimensionLoadings(points, coords) {
  const dims = points[0].length
  const axes = coords[0].length
  return Array.from({ length: dims }, (_, k) => {
    const column = points.map((p) => p[k])
    return Array.from({ length: axes }, (_, d) => pearson(column, coords.map((c) => c[d])))
  })
}

// The k plazas closest to `index` in the TRUE weighted space — not in the
// flattened picture. Drawn as leaders when a plaza is pinned, so a reader can
// check the projection against the quantity it approximates: if a leader runs
// to a dot that looks far away, the flattening moved it.
export function nearestNeighbours(D, index, k = 3) {
  // Array.from, not D[index].map: the rows are Float64Arrays, and a typed
  // array's map coerces whatever the callback returns back to a number — every
  // object becomes NaN and the indices are silently lost.
  return Array.from(D[index], (d, j) => ({ index: j, distance: d }))
    .filter((e) => e.index !== index)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
}

/* ------------------------------------------------ univariate distribution */

// Equal-width bins over a fixed domain. Used on the diagonal of the scatterplot
// matrix, where the question is how the 18 plazas spread along one metric
// rather than how two metrics relate.
export function histogram(values, { bins = 6, domain = [0, 1] } = {}) {
  const [lo, hi] = domain
  const width = (hi - lo) / bins
  const counts = new Array(bins).fill(0)
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)))
    counts[idx] += 1
  }
  return counts.map((count, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count }))
}

// Gaussian kernel density estimate, bandwidth by Silverman's rule.
//
// Drawn over the histogram because 18 observations in 6 bins is a shape that
// changes if the bin edges move; the smooth curve is bin-independent and shows
// whether a gap is real or an artefact of where a boundary fell. Neither is
// trusted alone — that is the point of drawing both.
export function kde(values, { samples = 64, domain = [0, 1] } = {}) {
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, n - 1))
  // A degenerate spread would give a zero bandwidth and divide by zero; the
  // floor keeps the curve drawable and visibly narrow, which is the truth.
  const h = Math.max(1e-3, 1.06 * sd * Math.pow(n, -0.2))
  const [lo, hi] = domain
  const out = []
  for (let i = 0; i < samples; i++) {
    const x = lo + ((hi - lo) * i) / (samples - 1)
    let sum = 0
    for (const v of values) {
      const z = (x - v) / h
      sum += Math.exp(-0.5 * z * z)
    }
    out.push({ x, density: sum / (n * h * Math.sqrt(2 * Math.PI)) })
  }
  return out
}

/* ------------------------------------------------------- label placement */

// Greedy non-overlapping label placement for a scatter.
//
// Eighteen names on one plot will overprint if each is simply parked to the
// right of its dot, and overprinted labels are worse than absent ones. Each
// label tries eight positions around its point and takes the first that hits
// neither an already-placed label, nor any point marker, nor the frame; if all
// eight collide it takes the least-bad one, so a label is never dropped.
//
// Deterministic: same input, same layout, every render. A jittered or
// force-simulated placement would move labels between frames and make hovering
// feel unstable.
export function placeLabels(items, { width, height, charWidth = 5.4, lineHeight = 11, gap = 9, markerRadius = 6 } = {}) {
  // Right and left first: horizontal offsets read as belonging to their dot
  // more clearly than a label parked above or below it.
  const CANDIDATES = [
    { dx: 1, dy: 0.32, anchor: 'start' },
    { dx: -1, dy: 0.32, anchor: 'end' },
    { dx: 1, dy: -0.9, anchor: 'start' },
    { dx: -1, dy: -0.9, anchor: 'end' },
    { dx: 1, dy: 1.5, anchor: 'start' },
    { dx: -1, dy: 1.5, anchor: 'end' },
    { dx: 0, dy: -1.35, anchor: 'middle' },
    { dx: 0, dy: 2.1, anchor: 'middle' },
  ]

  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

  // Every marker is an obstacle from the start, including those whose own
  // label has not been placed yet — otherwise early labels sit on later dots.
  const obstacles = items.map((it) => ({
    x0: it.x - markerRadius,
    x1: it.x + markerRadius,
    y0: it.y - markerRadius,
    y1: it.y + markerRadius,
  }))
  const placed = []

  // Left to right, so the reading order of the plot and of the algorithm agree
  // and a crowd resolves outward in a way that looks deliberate.
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x)
  const out = new Array(items.length)

  for (const i of order) {
    const it = items[i]
    const w = it.text.length * charWidth
    let best = null

    for (const c of CANDIDATES) {
      const x = it.x + c.dx * gap
      const y = it.y + c.dy * lineHeight
      const x0 = c.anchor === 'start' ? x : c.anchor === 'end' ? x - w : x - w / 2
      const box = { x0, x1: x0 + w, y0: y - lineHeight * 0.8, y1: y + lineHeight * 0.25 }

      // Off the canvas counts as a collision, weighted heavily: a clipped label
      // is unreadable in a way an overlapping one at least partly is not.
      let cost = 0
      if (box.x0 < 2) cost += (2 - box.x0) * lineHeight * 4
      if (box.x1 > width - 2) cost += (box.x1 - (width - 2)) * lineHeight * 4
      if (box.y0 < 2) cost += (2 - box.y0) * w * 4
      if (box.y1 > height - 2) cost += (box.y1 - (height - 2)) * w * 4
      for (const p of placed) cost += overlap(box, p)
      for (const o of obstacles) cost += overlap(box, o)

      if (best === null || cost < best.cost) best = { cost, x, y, anchor: c.anchor, box }
      if (cost === 0) break
    }

    placed.push(best.box)
    out[i] = { x: best.x, y: best.y, anchor: best.anchor, clean: best.cost === 0 }
  }

  return out
}
