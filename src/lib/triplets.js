// Triplet-comparison survey sampling (P3 — Perceptual Survey).
//
// A "triplet" shows three plazas; the participant marks the two that feel most
// spatially similar. Across the whole pool every pair of sites should co-appear
// a few times so the downstream weight fitting sees balanced evidence. The live
// panoramic survey draws each participant's triplets from this pool in
// survey360.js.

export const MIN_PAIR_COVERAGE = 2

// Target recruitment for the study. This number is the reason the sampler can
// stay uncoordinated: at this many participants, independently drawn subsets are
// expected to cover every site pair several times over without any tracking
// between participants. It is an assumption, not a guarantee — the pooled
// coverage panel on the Results page is what checks it against real responses.
export const TARGET_PARTICIPANTS = { min: 30, max: 50, label: '30–50' }

// Small, fast, seedable PRNG (mulberry32) so a participant id reproduces the
// same survey — useful for resuming and for debugging a specific run.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

function shuffle(list, rng) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickThreeDistinct(ids, rng) {
  const a = shuffle(ids, rng)
  return [a[0], a[1], a[2]]
}

// Greedy balanced pool: keep adding the best of a few random candidate triplets
// (the one covering the most still-undercovered pairs) until every pair has been
// seen at least `minCoverage` times.
export function buildBalancedPool(siteIds, minCoverage = MIN_PAIR_COVERAGE, rng = Math.random) {
  const pairCount = new Map()
  for (let i = 0; i < siteIds.length; i++) {
    for (let j = i + 1; j < siteIds.length; j++) pairCount.set(pairKey(siteIds[i], siteIds[j]), 0)
  }

  const stillUndercovered = () => {
    for (const c of pairCount.values()) if (c < minCoverage) return true
    return false
  }

  const triplets = []
  let guard = 0
  while (stillUndercovered() && guard++ < 10000) {
    let best = null
    let bestScore = -1
    for (let k = 0; k < 40; k++) {
      const [a, b, c] = pickThreeDistinct(siteIds, rng)
      const keys = [pairKey(a, b), pairKey(a, c), pairKey(b, c)]
      const score = keys.reduce((s, key) => s + (pairCount.get(key) < minCoverage ? 1 : 0), 0)
      if (score > bestScore) {
        bestScore = score
        best = { sites: [a, b, c], keys }
      }
    }
    best.keys.forEach((key) => pairCount.set(key, pairCount.get(key) + 1))
    triplets.push(best.sites)
  }
  return triplets
}
