// P7 — comparing plazas as SETS of views rather than single points.
//
// Every phase up to here has represented a plaza by one reading: its canonical
// 120° fingerprint, matched to the photograph people were shown. That is the
// right object for P5, because it is the thing participants judged. It is a
// poor description of the plaza itself. Stand in a different corner of
// Alexanderplatz, face a different way, and the four metrics change more than
// they do between some pairs of plazas — the workflow's own evidence for this
// is why plaza-level typology was cut from scope.
//
// A view cloud is the honest alternative: several 120° readings from positions
// a person could actually stand in, kept as a set. The question P7 asks is how
// to measure the distance between two SETS, and the answer is not obvious —
// which is the point. Three measures are computed, they disagree, and where
// they disagree is the finding:
//
//   centroidDistance  collapse each cloud to its mean, then measure between the
//                     means. Cheap, familiar, and blind by construction: two
//                     clouds with the same mean read as identical however
//                     differently they are arranged around it.
//   gaussianDistance  fit a Gaussian to each cloud and take the 2-Wasserstein
//                     distance between them. Sees position AND spread/shape,
//                     but only as far as a Gaussian can describe a cloud — it
//                     cannot see multiple modes.
//   chamferDistance   average nearest-neighbour distance, both directions. Makes
//                     no distributional assumption at all: it asks, for every
//                     view in A, how close the most similar view in B is.
//
// The gate for this phase (test/clouds.test.js) is a constructed case where
// centroid — and then Gaussian — report zero distance between clouds that share
// no similar views at all, and only Chamfer reports the difference.
//
// LAYER: perceptual_120 throughout. Cloud markers are normalised against the
// perceptual_120 bounds from the 18 canonical fingerprints, never against the
// 360° bounds P6 uses. See the layer-separation note in docs/spec.md.

import { jacobiEigen } from './projection.js'

/* ------------------------------------------------------- the weighted space */

// The weights enter once, here, and never again.
//
// A weighted Euclidean distance Σ wₖ(aₖ−bₖ)² is exactly a plain Euclidean
// distance after scaling each axis by √wₖ. Doing that scaling once up front
// means every measure below is ordinary Euclidean geometry — no measure has to
// remember to apply the weights, and no measure can apply them differently from
// another. It also makes the Gaussian covariance the covariance OF THE WEIGHTED
// SPACE, which is what the distance is supposed to compare.
export function whiten(points, weights) {
  const scale = weights.map((w) => Math.sqrt(w))
  return points.map((p) => p.map((v, k) => v * scale[k]))
}

function euclid(a, b) {
  let s = 0
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2
  return Math.sqrt(s)
}

export function centroid(points) {
  const dims = points[0].length
  const mean = new Array(dims).fill(0)
  for (const p of points) for (let k = 0; k < dims; k++) mean[k] += p[k]
  return mean.map((v) => v / points.length)
}

// Sample covariance (n−1 denominator) of an already-whitened cloud.
//
// n−1, not n, because a view cloud is a SAMPLE of the positions a person could
// stand in, not the population of them — the researcher placed eight, they
// could have placed a different eight. With clouds this small (8 points in 4
// dimensions) the estimate is genuinely noisy, and that is not a defect to be
// hidden: it is exactly why the Gaussian measure is reported beside Chamfer
// rather than instead of it.
export function covariance(points, mean = centroid(points)) {
  const n = points.length
  const dims = mean.length
  const C = Array.from({ length: dims }, () => new Float64Array(dims))
  if (n < 2) return C
  for (const p of points) {
    for (let i = 0; i < dims; i++) {
      for (let j = 0; j < dims; j++) C[i][j] += (p[i] - mean[i]) * (p[j] - mean[j])
    }
  }
  for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) C[i][j] /= n - 1
  return C
}

/* -------------------------------------------------------------- the measures */

// 1. CENTROID — the distance between the two mean views.
//
// Included precisely because it is the measure a reader would reach for first,
// and because P5's whole 18-plaza picture is built on single points. Its
// failure mode is demonstrated rather than asserted; see the gate test.
export function centroidDistance(cloudA, cloudB, weights) {
  const A = whiten(cloudA, weights)
  const B = whiten(cloudB, weights)
  return euclid(centroid(A), centroid(B))
}

// 2. GAUSSIAN — the 2-Wasserstein distance between the fitted Gaussians.
//
//   W₂² = ‖μA − μB‖² + tr(ΣA + ΣB − 2(ΣA^½ ΣB ΣA^½)^½)
//
// The second term is the Bures distance between the covariances: the cost of
// reshaping one cloud's spread into the other's. Read plainly, W₂ is the least
// total effort needed to move one cloud of views onto the other — so unlike the
// centroid it charges for a difference in how spread out or how oriented the
// two sets of views are, not only for where their middles sit.
//
// The ΣA^½ ΣB ΣA^½ form is used deliberately. The textbook alternative involves
// inverting a covariance, and with eight points in four dimensions the sample
// covariance is close to singular by construction — the inverse form produces
// enormous numbers from rounding error, while this one needs no inverse and
// stays well behaved when a cloud is nearly flat in some direction.
export function gaussianDistance(cloudA, cloudB, weights) {
  const A = whiten(cloudA, weights)
  const B = whiten(cloudB, weights)
  const muA = centroid(A)
  const muB = centroid(B)
  const CA = covariance(A, muA)
  const CB = covariance(B, muB)

  const meanTerm = euclid(muA, muB) ** 2

  const rootA = matrixSqrt(CA)
  const inner = matMul(matMul(rootA, CB), rootA)
  const crossTrace = trace(matrixSqrt(inner))
  const bures = trace(CA) + trace(CB) - 2 * crossTrace

  // Bures is non-negative in exact arithmetic; a tiny negative here is rounding
  // on a near-singular covariance, not a real quantity, so it floors at zero.
  return Math.sqrt(Math.max(0, meanTerm + Math.max(0, bures)))
}

// 3. CHAMFER — mean nearest-neighbour distance, symmetrised.
//
//   (1/|A|) Σ_a min_b ‖a−b‖   averaged with   (1/|B|) Σ_b min_a ‖a−b‖
//
// "For each view in this plaza, how similar is the most similar view in that
// plaza?" — averaged over both plazas so neither is privileged. No mean, no
// covariance, no assumed shape: a cloud with two separate groups of views stays
// two separate groups.
//
// The two directions are AVERAGED rather than summed, so the result stays on the
// same scale as the other two measures and the three can be read on one axis.
//
// Not a metric in the mathematical sense — it can violate the triangle
// inequality — which is one reason the spec forbids clustering these distances.
// It is reported as a distance and used for ranking and matching only.
export function chamferDistance(cloudA, cloudB, weights) {
  const A = whiten(cloudA, weights)
  const B = whiten(cloudB, weights)
  return (meanNearest(A, B) + meanNearest(B, A)) / 2
}

// Mean over `from` of the distance to the closest point in `to`.
function meanNearest(from, to) {
  let sum = 0
  for (const a of from) {
    let best = Infinity
    for (const b of to) {
      const d = euclid(a, b)
      if (d < best) best = d
    }
    sum += best
  }
  return sum / from.length
}

// The single closest pair between two clouds, with its distance — the "matched
// view" P8 puts in front of participants. Indices are into the ORIGINAL point
// arrays, so a caller can recover the marker each one came from.
export function nearestPair(cloudA, cloudB, weights) {
  const A = whiten(cloudA, weights)
  const B = whiten(cloudB, weights)
  let best = { a: -1, b: -1, distance: Infinity }
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      const d = euclid(A[i], B[j])
      if (d < best.distance) best = { a: i, b: j, distance: d }
    }
  }
  return best
}

// Every view in A paired with its closest view in B — the pairings Chamfer
// averages over, kept rather than summed away.
//
// This is the phase's actual finding at the resolution people care about. A
// cloud distance says "these two plazas are somewhat alike"; these pairings say
// WHICH corner of one plaza resembles WHICH edge of another, which is a claim
// about places that can be looked at, argued with, and — in P8 — put in front
// of a participant. Chamfer computes exactly these matches internally and then
// throws them away to return one number; this returns them.
//
// Direction is A→B only: for each view in A, its nearest counterpart in B. The
// reverse direction is not the same set of pairs (nearest-neighbour is not
// symmetric), and drawing both at once is unreadable — callers that want it
// call this again with the clouds swapped.
export function matchViews(cloudA, cloudB, weights) {
  const A = whiten(cloudA, weights)
  const B = whiten(cloudB, weights)
  return A.map((a, i) => {
    let best = { bIndex: -1, distance: Infinity }
    for (let j = 0; j < B.length; j++) {
      const d = euclid(a, B[j])
      if (d < best.distance) best = { bIndex: j, distance: d }
    }
    return { aIndex: i, ...best }
  })
}

// The closest individual view pairs anywhere in the corpus, across plaza
// boundaries — "the most similar two views in the whole dataset, wherever they
// happen to be".
//
// Same-plaza pairs are excluded by default. Two views of the same square being
// alike is not a finding; the phase is about correspondence ACROSS plazas, and
// leaving them in would fill the top of the list with them.
//
// `clouds` is [{ siteId, points }]. At 18 plazas × 8 views this compares about
// 10,000 pairs, which is instant — no index or pruning needed.
export function globalNearestViews(clouds, weights, { topN = 15, excludeSameSite = true } = {}) {
  const flat = []
  for (const c of clouds) {
    whiten(c.points, weights).forEach((point, index) => {
      flat.push({ siteId: c.siteId, index, point })
    })
  }

  const pairs = []
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (excludeSameSite && flat[i].siteId === flat[j].siteId) continue
      pairs.push({
        aSite: flat[i].siteId,
        aIndex: flat[i].index,
        bSite: flat[j].siteId,
        bIndex: flat[j].index,
        distance: euclid(flat[i].point, flat[j].point),
      })
    }
  }

  return pairs.sort((p, q) => p.distance - q.distance).slice(0, topN)
}

export const MEASURES = {
  centroid: {
    id: 'centroid',
    label: 'Centroid',
    fn: centroidDistance,
    blurb: 'Distance between the two clouds’ mean views. Blind to how they are spread.',
  },
  gaussian: {
    id: 'gaussian',
    label: 'Gaussian (2-Wasserstein)',
    fn: gaussianDistance,
    blurb: 'Distance between fitted Gaussians — position and spread, but one mode only.',
  },
  chamfer: {
    id: 'chamfer',
    label: 'Chamfer',
    fn: chamferDistance,
    blurb: 'Mean nearest-neighbour distance both ways. No assumed shape.',
  },
}

// Full symmetric distance matrix over an ordered list of clouds.
//
// `clouds` is an array of point arrays, already normalised into the weighted
// space's 0–1 coordinates. Deliberately returns plain nested arrays: these get
// serialised to JSON and read by the page.
export function cloudDistanceMatrix(clouds, weights, measure = 'chamfer') {
  const fn = MEASURES[measure]?.fn
  if (!fn) throw new Error(`Unknown cloud measure "${measure}"`)
  const n = clouds.length
  const D = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = fn(clouds[i], clouds[j], weights)
      D[i][j] = d
      D[j][i] = d
    }
  }
  return D
}

// How far two measures agree on the ORDERING of pairs.
//
// The interesting comparison between centroid and Chamfer is not whether their
// numbers match — they are on different scales and never will — but whether
// they rank the same plaza pairs as most alike. Spearman's ρ on the off-diagonal
// pairs answers exactly that, and a rank correlation well below 1 is the
// evidence that the choice of measure is a real decision rather than a detail.
export function rankAgreement(D1, D2) {
  const a = []
  const b = []
  for (let i = 0; i < D1.length; i++) {
    for (let j = i + 1; j < D1.length; j++) {
      a.push(D1[i][j])
      b.push(D2[i][j])
    }
  }
  return spearman(a, b)
}

export function spearman(xs, ys) {
  const rx = ranks(xs)
  const ry = ranks(ys)
  const n = rx.length
  const mx = rx.reduce((s, v) => s + v, 0) / n
  const my = ry.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const p = rx[i] - mx
    const q = ry[i] - my
    num += p * q
    dx += p * p
    dy += q * q
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

// Average ranks, so ties do not depend on the input order.
function ranks(values) {
  const order = values.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v)
  const out = new Array(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++
    const mean = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k].i] = mean
    i = j + 1
  }
  return out
}

/* ----------------------------------------------------------- matrix helpers */

function matMul(A, B) {
  const n = A.length
  const out = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const a = A[i][k]
      if (a === 0) continue
      for (let j = 0; j < n; j++) out[i][j] += a * B[k][j]
    }
  }
  return out
}

function trace(A) {
  let s = 0
  for (let i = 0; i < A.length; i++) s += A[i][i]
  return s
}

// Principal square root of a symmetric positive-semidefinite matrix: rebuild it
// from its eigenvectors with each eigenvalue replaced by its square root.
//
// Negative eigenvalues are floored at zero rather than treated as an error. A
// true covariance has none; what appears here are values around −1e−17 produced
// by rounding on a rank-deficient cloud, and the mathematically correct nearest
// PSD matrix is the one with those set to zero.
export function matrixSqrt(A) {
  const { values, vectors } = jacobiEigen(A)
  const n = A.length
  const root = Array.from({ length: n }, () => new Float64Array(n))
  for (let d = 0; d < n; d++) {
    const s = Math.sqrt(Math.max(0, values[d]))
    if (s === 0) continue
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) root[i][j] += s * vectors[i][d] * vectors[j][d]
    }
  }
  return root
}
