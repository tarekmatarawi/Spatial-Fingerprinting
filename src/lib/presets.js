// P9 Tier B — the parametric intervention library.
//
// A preset is a GENERATOR, not a shape: named parameters in, a set of solid
// parts out. Nothing here stores a mesh or a footprint literal, so a colonnade
// at 30 m and one at 62 m are the same design idea at two settings rather than
// two unrelated objects, and a slider can drive the geometry — and therefore
// the measured metrics — continuously.
//
// WHAT A PART IS, AND WHY IT CARRIES TWO HEIGHTS.
//
// The ray-caster is a PLANAR SLICE AT EYE HEIGHT. `castIsovist` stops a ray at
// the first footprint edge it meets and consults height only for the enclosure
// angle — so without the base/top pair below, a 300 mm planter edge would block
// sightlines as completely as a cathedral, and a pergola roof four metres up
// would block nothing while its own footprint blocked everything.
//
// So every part declares the band of space it occupies, and only a part that
// STRADDLES eye height obstructs the cast:
//
//     blocks  ⟺  base ≤ 1.6 m < top
//
// This has a consequence the library does not hide: several of the moves that
// plaza design actually consists of — low walls, plinths, steps, canopies, the
// clear space under a raised tree canopy — sit entirely above or below that
// slice, and this instrument cannot see them. That is a real limitation of
// isovist analysis rather than a defect in these generators, and
// `npm run validate:presets` demonstrates it rather than asserting it.
//
// LAYER: none. A preset is geometry. It becomes a field_360 measurement only
// when lib/sandbox.js casts against it.

import { EYE_HEIGHT_M } from './viewGeometry.js'

export { EYE_HEIGHT_M }

// Whether a part obstructs the eye-height slice the isovist is cast in.
export function partBlocks(part) {
  return part.base <= EYE_HEIGHT_M && part.top > EYE_HEIGHT_M
}

// Expected sign of a preset's effect on each metric, at its default settings,
// measured near the intervention. Used by the validation harness in
// scripts/validate-presets.mjs, which flags any preset whose real effect
// disagrees — that being either a generator bug or a wrong expectation, and
// worth knowing which before any of it reaches the thesis.
//
//   'raise'  the metric should go up
//   'lower'  the metric should go down
//   'none'   the metric should barely move (under NEGLIGIBLE_SHARE)
//
// A tag may instead be { direction, diagnostic: false }, which says the SIGN is
// trustworthy but the MAGNITUDE is not resolvable at this site. Only
// solid_share currently needs it — see SOLID_SHARE_NOTE below. Such a tag
// passes on the right sign or on no movement, and fails only on the wrong sign,
// because a measure with two percent of headroom cannot be held to a threshold
// it has no room to cross.
//
// CORRECTED 2026-09-10, after the first validation run. Four presets were
// tagged from architectural intuition and disagreed with what the engine
// actually measured. The generators turned out to be right and the tags wrong,
// for two reasons that are properties of the metric definitions rather than of
// this library — and both are worth stating in the methods, because they run
// against what a designer would assume:
//
// 1. ADDING A FREESTANDING OBJECT LOWERS OCCLUSIVITY. Occlusivity here is
//    CLOSED PERIMETER: it counts an isovist boundary edge only where two
//    consecutive rays land on the same building, or on two buildings within
//    1.5 m of each other. Anything standing free in a square hides long runs of
//    continuous facade behind it and contributes only its own short visible
//    edges in exchange, so the total falls. Measured at Konstablerwache: a
//    kiosk −8.4%, a market row −14.1%, a colonnade −9.0%. The intuition that
//    "more built surface means more occlusivity" is wrong under this
//    definition, and the tags now say so.
//
// 2. COMPACTNESS COLLAPSES UNDER SPARSE SLENDER OBSTACLES. A 250 mm post
//    catches roughly one ray at close range while its neighbours run on for a
//    hundred metres, so each post adds two long radial edges to the isovist
//    perimeter. Perimeter enters compactness SQUARED (4πA/P²), so a pergola
//    that lowers area by 2.5% raises perimeter by 42% and halves compactness.
//    Verified at a single vantage: 1,206 m → 1,706 m of perimeter for 2.5% of
//    area. Nothing about this is a defect; it is what an isoperimetric quotient
//    does when a shape acquires fine-grained fringe.
//
// The tags below therefore encode the MECHANISM rather than the intuition. That
// makes this validation a regression test on the generators from here on — if a
// generator is ever changed such that a sign flips, it flags — rather than the
// open-ended prediction it was on its first run.
export const NEGLIGIBLE_SHARE = 0.02

// Which P9 metrics are allowed to decide whether a preset behaves correctly,
// and how each should be presented. The four fitted metrics are always
// diagnostic; the two additions are not equal to each other and must never be
// shown as if they were.
export const SOLID_SHARE_NOTE =
  'Directionally reliable, but not diagnostic at this site: 98.1% of rays at Konstablerwache ' +
  'already end on a building at the 200 m sight line, leaving about two points of headroom. It ' +
  'rose for every additive intervention and fell for none — the sign is the finding, the size is not.'

export const SOLID_FRONTAGE_NOTE =
  'Reports how much built surface is IN VIEW, not how much was added, so a near object that hides ' +
  'a far facade lowers it (kiosk −9.6%, market row −15.9%). Kept as a field because it is free to ' +
  'compute, but it does not judge an intervention and is not a primary readout.'

// Excluded from every pass/fail judgement — see SOLID_FRONTAGE_NOTE. Still
// computed and still displayed as context, never as a verdict.
export const NON_DIAGNOSTIC_METRICS = ['solidFrontage']

// One tag, in the two forms it may take.
export function normaliseExpectation(tag) {
  if (tag == null) return null
  if (typeof tag === 'string') return { direction: tag, diagnostic: true }
  return { direction: tag.direction, diagnostic: tag.diagnostic !== false }
}

/* ------------------------------------------------------------- local frames */

// A preset is generated in its own (u, v) frame — u along its length, v across
// it — and placed into plaza-local metres by an anchor and a rotation. Doing
// the trigonometry once here means no generator has to think about placement,
// and a preset can be dragged or spun without touching its own geometry.
function frame(anchor, rotationDeg) {
  const r = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return (u, v) => ({
    x: anchor.x + u * cos - v * sin,
    y: anchor.y + u * sin + v * cos,
  })
}

function box(T, u, v, du, dv) {
  return [
    T(u - du / 2, v - dv / 2),
    T(u + du / 2, v - dv / 2),
    T(u + du / 2, v + dv / 2),
    T(u - du / 2, v + dv / 2),
  ]
}

// A round element as a polygon. Eight sides is enough: at 1°-per-ray the cast
// cannot resolve a finer curve, so more vertices would cost edge tests without
// changing a single hit.
function disc(T, u, v, diameter, sides = 8) {
  const r = diameter / 2
  const pts = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    pts.push(T(u + Math.cos(a) * r, v + Math.sin(a) * r))
  }
  return pts
}

// Evenly spaced positions along a run, always including both ends, so a
// colonnade reads as a colonnade rather than as a row that stops short.
function spanPositions(length, spacing) {
  const count = Math.max(2, Math.round(length / spacing) + 1)
  const step = length / (count - 1)
  return Array.from({ length: count }, (_, i) => -length / 2 + i * step)
}

/* ----------------------------------------------------------------- presets */

export const PRESETS = [
  {
    id: 'colonnade',
    name: 'Colonnade / arcade',
    blurb:
      'A run of columns carrying a roof, set in front of a facade or standing free. The classic ' +
      'edge-softening move: it gives a square a sheltered margin without walling it off.',
    params: {
      length: { label: 'Length', min: 6, max: 80, step: 1, default: 30, unit: 'm' },
      depth: { label: 'Depth', min: 2, max: 10, step: 0.5, default: 4, unit: 'm' },
      spacing: { label: 'Column spacing', min: 2, max: 12, step: 0.5, default: 4, unit: 'm' },
      height: { label: 'Height', min: 3, max: 14, step: 0.5, default: 6, unit: 'm' },
    },
    expected: {
      area: 'lower',
      compactness: 'lower',
      // Mechanically LOWER, which is the opposite of the architectural
      // intuition that an arcade adds built surface. Occlusivity here is
      // CLOSED PERIMETER: it counts an isovist edge only where consecutive
      // rays land on the same building, or on two within 1.5 m. A colonnade
      // replaces a long continuous facade with separate columns four metres
      // apart, so those edges stop qualifying. Flagged as a prediction to be
      // tested rather than assumed.
      occlusivity: 'lower',
      enclosure: 'raise',
      // Corrected after the second validation run. Solid share DOES rise —
      // it rose for every additive preset and fell for none, which is the sign
      // fix working — but only from 0.9808 to 0.9820. At a 200 m sight line in
      // a dense city centre 98% of rays already end on a building, so the
      // measure is saturated here and has no room to register anything.
      solidShare: { direction: 'raise', diagnostic: false },
      // Near columns replace far facade, and a near surface subtends less
      // arc than a distant one, so the metres fall even as coverage rises.
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const side = Math.min(0.6, p.depth / 3)
      const parts = spanPositions(p.length, p.spacing).map((u) => ({
        footprint: box(T, u, 0, side, side),
        base: 0,
        top: p.height,
        role: 'column',
      }))
      // The roof sits above eye height and is drawn but never cast against.
      parts.push({
        footprint: box(T, 0, 0, p.length + side, p.depth),
        base: Math.max(EYE_HEIGHT_M + 0.4, p.height - 0.6),
        top: p.height,
        role: 'roof',
      })
      return parts
    },
  },

  {
    id: 'pergola',
    name: 'Pergola / canopy',
    blurb:
      'A light overhead structure on slender posts, giving shade and a sense of room without ' +
      'enclosing anything at eye level.',
    params: {
      width: { label: 'Width', min: 3, max: 40, step: 1, default: 10, unit: 'm' },
      length: { label: 'Length', min: 3, max: 40, step: 1, default: 8, unit: 'm' },
      height: { label: 'Height', min: 2.5, max: 8, step: 0.25, default: 3.5, unit: 'm' },
      openness: { label: 'Roof openness', min: 0, max: 100, step: 5, default: 50, unit: '%' },
    },
    // A KNOWN LIMITATION, documented rather than worked around.
    limitation:
      "Every metric this instrument offers reads negative for a pergola, and none of them captures the shelter it would actually feel like. A canopy works overhead, where a planar eye-height isovist has nothing to measure, so all that registers is a few slender posts subtracting from the view. Read the numbers as a statement about what the instrument can see, not about whether the pergola is a good move.",
    expected: {
      // Corrected after the first validation run. The posts are slender, but
      // slenderness is exactly what wrecks compactness: each post stops a single
      // ray short while its neighbours run on for a hundred metres, adding two
      // long radial edges to the perimeter. Area moves 2.5%, compactness halves.
      area: 'lower',
      compactness: 'lower',
      occlusivity: 'lower',
      // The one metric the posts genuinely leave alone — too thin to shift a
      // mean over 360 rays. The roof, which is the whole point of a pergola, is
      // above the slice and contributes nothing at all.
      enclosure: 'none',
      // THE CLAIM SOLIDITY EXISTS TO TEST, and it holds: compactness falls
      // 53.4% here on fine serration alone while solidity falls 4.2% — an order
      // of magnitude less spurious sensitivity to the same geometry. The tag is
      // 'lower' rather than 'none' because 4.2% is real and in the right
      // direction; the point was never that a hull measure ignores obstacles,
      // only that it does not mistake fringe for collapse.
      solidShare: { direction: 'raise', diagnostic: false },
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const post = 0.25
      const parts = []
      for (const u of spanPositions(p.width, 3.5)) {
        for (const v of [-p.length / 2, p.length / 2]) {
          parts.push({ footprint: box(T, u, v, post, post), base: 0, top: p.height, role: 'post' })
        }
      }
      parts.push({
        footprint: box(T, 0, 0, p.width, p.length),
        base: p.height - 0.2,
        top: p.height,
        role: 'roof',
        // Carried for the 3D view only. Openness describes how much of the
        // roof plane is solid, which a plan-level cast has no way to register.
        openness: p.openness,
      })
      return parts
    },
  },

  {
    id: 'landmark',
    name: 'Freestanding landmark / kiosk',
    blurb:
      'A single solid object standing clear in the space — a pavilion, kiosk, or monument. Small ' +
      'in plan, but it divides a square by standing in the middle of the view across it.',
    params: {
      size: { label: 'Footprint', min: 2, max: 24, step: 0.5, default: 8, unit: 'm' },
      height: { label: 'Height', min: 2, max: 30, step: 0.5, default: 6, unit: 'm' },
    },
    expected: {
      area: 'lower',
      compactness: 'lower',
      // Corrected after the first validation run. The kiosk's own edges DO
      // qualify as closed perimeter — and it still loses, because it hides far
      // more continuous facade than it contributes: −8.4% measured. Standing
      // something free in a square SUBTRACTS occlusivity under this definition.
      occlusivity: 'lower',
      enclosure: 'raise',
      // Saturated — see the colonnade's note. Rises, by 0.2%.
      solidShare: { direction: 'raise', diagnostic: false },
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      return [
        { footprint: box(T, 0, 0, p.size, p.size), base: 0, top: p.height, role: 'solid' },
      ]
    },
  },

  {
    id: 'treeRow',
    name: 'Tree row / planting screen',
    blurb:
      'A line of trees. Whether this instrument can see it at all depends on the clearance under ' +
      'the canopy: raised canopies leave only slender trunks in the eye-height slice, while a ' +
      'canopy that comes down below 1.6 m reads as a hedge and blocks like a wall.',
    params: {
      length: { label: 'Row length', min: 6, max: 100, step: 1, default: 30, unit: 'm' },
      spacing: { label: 'Spacing', min: 3, max: 20, step: 0.5, default: 8, unit: 'm' },
      clearance: { label: 'Clearance under canopy', min: 0.3, max: 6, step: 0.1, default: 2.5, unit: 'm' },
      canopy_diameter: { label: 'Canopy diameter', min: 2, max: 14, step: 0.5, default: 6, unit: 'm' },
      canopy_height: { label: 'Canopy top', min: 3, max: 25, step: 0.5, default: 9, unit: 'm' },
    },
    // A KNOWN LIMITATION, documented rather than worked around.
    limitation:
      "As with the pergola, every metric reads negative and none registers the shade or screening a row of trees provides. At the default clearance the canopy floats above the measured slice and only the trunks are counted. Drop the clearance below 1.6 m and the canopy itself starts blocking, which is the instrument agreeing that a hedge is not a tree.",
    expected: {
      // At the default 2.5 m clearance the canopy floats above the slice and
      // only 400 mm trunks remain in it — the blocking rule flips to the canopy
      // on its own once clearance drops below eye height, with no special case.
      //
      // Corrected after the first validation run: five 400 mm trunks are not
      // nothing. They take 4% off area and HALVE compactness, by the same
      // radial-edge mechanism as the pergola's posts. Enclosure is the only one
      // that genuinely ignores them.
      area: 'lower',
      compactness: 'lower',
      occlusivity: 'lower',
      enclosure: 'none',
      // The same robustness claim as the pergola, and it holds the same way:
      // compactness −49.3% against solidity −3.7% on five 400 mm trunks.
      solidShare: { direction: 'raise', diagnostic: false },
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const trunk = 0.4
      const parts = []
      for (const u of spanPositions(p.length, p.spacing)) {
        parts.push({ footprint: box(T, u, 0, trunk, trunk), base: 0, top: p.clearance, role: 'trunk' })
        parts.push({
          footprint: disc(T, u, 0, p.canopy_diameter),
          base: p.clearance,
          top: Math.max(p.clearance + 1, p.canopy_height),
          role: 'canopy',
        })
      }
      return parts
    },
  },

  {
    id: 'lowWall',
    name: 'Low wall / planter edge',
    blurb:
      'A seat wall or planter rim defining an edge underfoot. Capped at 1.2 m by definition, so ' +
      'it never reaches the 1.6 m slice this instrument measures — expect no movement at all.',
    params: {
      length: { label: 'Length', min: 3, max: 60, step: 1, default: 20, unit: 'm' },
      height: { label: 'Height', min: 0.3, max: 1.2, step: 0.05, default: 0.5, unit: 'm' },
      segments: { label: 'Segments', min: 1, max: 8, step: 1, default: 1, unit: '' },
    },
    expected: {
      // Exactly zero, not merely small: nothing under 1.6 m enters the cast.
      // The clearest demonstration in the library of what the slice cannot see.
      area: 'none',
      compactness: 'none',
      occlusivity: 'none',
      enclosure: 'none',
      // Nothing reaches the slice, so every metric is untouched, new ones included.
      solidShare: { direction: 'none', diagnostic: false },
      solidFrontage: 'none',
      solidity: 'none',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const thickness = 0.4
      const gap = p.segments > 1 ? 1.2 : 0
      const runLength = (p.length - gap * (p.segments - 1)) / p.segments
      const parts = []
      for (let i = 0; i < p.segments; i++) {
        const u = -p.length / 2 + runLength / 2 + i * (runLength + gap)
        parts.push({
          footprint: box(T, u, 0, runLength, thickness),
          base: 0,
          top: p.height,
          role: 'wall',
        })
      }
      return parts
    },
  },

  {
    id: 'marketRow',
    name: 'Market stalls / linear market row',
    blurb:
      'A row of stalls, as a weekly market lays out. How closed the row reads depends on the ' +
      'gaps: stalls within 1.5 m of each other are counted as one continuous surface by the ' +
      'occlusivity measure, wider gaps as separate objects.',
    params: {
      length: { label: 'Row length', min: 6, max: 80, step: 1, default: 30, unit: 'm' },
      depth: { label: 'Stall depth', min: 1.5, max: 8, step: 0.5, default: 3, unit: 'm' },
      height: { label: 'Height', min: 2, max: 5, step: 0.1, default: 2.8, unit: 'm' },
      gap_width: { label: 'Gap between stalls', min: 0, max: 8, step: 0.25, default: 1, unit: 'm' },
    },
    expected: {
      area: 'lower',
      compactness: 'lower',
      // Corrected after the first validation run. At the default 1 m gap the
      // stalls DO read as one continuous run under the 1.5 m touching
      // tolerance — and it still is not enough: the row hides a long stretch of
      // the facade behind it, for a net −14.1%. The largest occlusivity loss of
      // any preset, produced by the intervention that adds the most surface.
      occlusivity: 'lower',
      enclosure: 'raise',
      // Saturated — see the colonnade's note. Rises, by 0.2%.
      solidShare: { direction: 'raise', diagnostic: false },
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const stall = 3
      const pitch = stall + p.gap_width
      const count = Math.max(1, Math.floor((p.length + p.gap_width) / pitch))
      const used = count * pitch - p.gap_width
      const parts = []
      for (let i = 0; i < count; i++) {
        const u = -used / 2 + stall / 2 + i * pitch
        parts.push({
          footprint: box(T, u, 0, stall, p.depth),
          base: 0,
          top: p.height,
          role: 'stall',
        })
      }
      return parts
    },
  },

  {
    id: 'plinth',
    name: 'Raised steps / plinth',
    blurb:
      'A raised platform with steps down to the square. At the usual 0.3–1.5 m it sits under the ' +
      'measured slice; taller than 1.6 m it starts to obstruct like any other mass.',
    params: {
      size: { label: 'Footprint', min: 3, max: 40, step: 1, default: 12, unit: 'm' },
      height: { label: 'Height', min: 0.3, max: 4, step: 0.1, default: 0.9, unit: 'm' },
      sides_open: { label: 'Sides with steps', min: 0, max: 4, step: 1, default: 2, unit: '' },
    },
    expected: {
      // Below eye height at its default, so invisible to the cast — but this
      // preset can cross the threshold, which makes it the one that shows the
      // boundary rather than only sitting on one side of it.
      area: 'none',
      compactness: 'none',
      occlusivity: 'none',
      enclosure: 'none',
      solidShare: { direction: 'none', diagnostic: false },
      solidFrontage: 'none',
      solidity: 'none',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const parts = [
        { footprint: box(T, 0, 0, p.size, p.size), base: 0, top: p.height, role: 'plinth' },
      ]
      // Step treads, for the 3D view. They are lower than the plinth itself and
      // so are never the thing that decides whether this blocks.
      const treads = Math.min(4, Math.max(0, p.sides_open))
      const offsets = [
        { u: 0, v: p.size / 2 + 0.4, du: p.size, dv: 0.8 },
        { u: 0, v: -p.size / 2 - 0.4, du: p.size, dv: 0.8 },
        { u: p.size / 2 + 0.4, v: 0, du: 0.8, dv: p.size },
        { u: -p.size / 2 - 0.4, v: 0, du: 0.8, dv: p.size },
      ]
      for (let i = 0; i < treads; i++) {
        const o = offsets[i]
        parts.push({
          footprint: box(T, o.u, o.v, o.du, o.dv),
          base: 0,
          top: Math.max(0.15, p.height / 2),
          role: 'step',
        })
      }
      return parts
    },
  },
]

PRESETS.push(
  {
    id: 'screenWall',
    name: 'Screen wall',
    blurb:
      'A freestanding wall tall enough to be seen rather than sat on. Unlike the low wall it ' +
      'crosses the 1.6 m slice, so the instrument registers it. Perforation is built as real gaps ' +
      'in the run — a binary ray either passes or it does not, so a screen that is 40% open is ' +
      'modelled as 40% of its length missing rather than as a fractionally transparent surface.',
    params: {
      length: { label: 'Length', min: 3, max: 60, step: 1, default: 14, unit: 'm' },
      height: { label: 'Height', min: 1.8, max: 6, step: 0.1, default: 2.4, unit: 'm' },
      perforation: { label: 'Perforation', min: 0, max: 80, step: 5, default: 0, unit: '%' },
    },
    // A KNOWN LIMITATION, documented rather than worked around.
    limitation:
      "A screen wall LOWERS enclosure, which is worth understanding rather than distrusting. Enclosure is the mean angle the built edge rises to: a 2.4 m screen 8 m away subtends atan(2.4/8) = 16.7 degrees, while the 20 m facade it hides at 60 m subtended atan(20/60) = 18.4 degrees. Putting something low in front of something tall genuinely reduces the angle you look up to, even though it adds a surface. Raise the screen above about 3.5 m at this distance and the sign reverses.",
    expected: {
      area: 'lower',
      compactness: 'lower',
      // Freestanding, so the same subtraction as every other object standing
      // clear in the square: it hides more continuous facade than it adds.
      occlusivity: 'lower',
      // Corrected after the second validation run, and the most interesting
      // correction in the library: a screen wall makes the space LESS enclosed,
      // not more. Enclosure is a mean vertical angle, and a 2.4 m screen 8 m
      // away subtends atan(2.4/8) = 16.7 deg, where the 20 m facade it hides at
      // 60 m subtended atan(20/60) = 18.4 deg. Standing something low in front
      // of something tall lowers the angle the built edge rises to. Measured
      // -1.3%, and it grows with screen length.
      enclosure: 'none',
      // Saturated — see the colonnade's note.
      solidShare: { direction: 'raise', diagnostic: false },
      // The prediction flagged as least confident, and it was wrong for the
      // same reason as the kiosk: near surface replaces far surface, and near
      // surface subtends fewer metres.
      solidFrontage: 'lower',
      solidity: 'lower',
    },
    generate(p, anchor, rotationDeg = 0) {
      const T = frame(anchor, rotationDeg)
      const thickness = 0.3
      const open = Math.min(0.8, Math.max(0, p.perforation / 100))
      if (open <= 0.001) {
        return [
          { footprint: box(T, 0, 0, p.length, thickness), base: 0, top: p.height, role: 'screen' },
        ]
      }
      // Perforation as alternating solid and void along the run. Eight bays is
      // enough to read as a screen rather than as a row of separate walls.
      const bays = 8
      const pitch = p.length / bays
      const solid = pitch * (1 - open)
      const parts = []
      for (let i = 0; i < bays; i++) {
        const u = -p.length / 2 + pitch * i + solid / 2
        parts.push({
          footprint: box(T, u, 0, solid, thickness),
          base: 0,
          top: p.height,
          role: 'screen',
        })
      }
      return parts
    },
  },

  {
    id: 'recessedArcade',
    name: 'Recessed arcade / loggia',
    blurb:
      'Carves a shallow recess into the ground floor of an existing building along a stretch of ' +
      'its facade, leaving piers standing on the original building line. The subtractive ' +
      'counterpart to the colonnade: instead of adding columns in front of a wall, it removes ' +
      'wall from between them.',
    // SUBTRACTIVE. This preset does not add parts — it rewrites a host
    // building's eye-height outline. lib/sandbox.js routes it accordingly.
    subtractive: true,
    params: {
      length: { label: 'Length along facade', min: 4, max: 60, step: 1, default: 24, unit: 'm' },
      depth: { label: 'Recess depth', min: 1, max: 8, step: 0.5, default: 3, unit: 'm' },
      pier_spacing: { label: 'Pier spacing', min: 2, max: 14, step: 0.5, default: 5, unit: 'm' },
    },
    expected: {
      // Corrected after the second validation run. Every one of these moved in
      // the predicted DIRECTION and three fell short of the 2% threshold, not
      // because the mechanism is wrong but because one 24 m recess on one
      // facade is diluted across 598 points spread over a 35 m radius. Measured
      // at a vantage standing in the opening itself, enclosure falls 17%.
      // Tagged by what the standard measurement shows, with the local figures
      // recorded here so the dilution is not mistaken for absence.
      area: 'none',
      // Piers serrate the boundary the same way a colonnade's columns do.
      compactness: 'lower',
      // The one intervention in the library where closed perimeter should RISE:
      // the recess walls belong to the HOST BUILDING, so consecutive rays
      // running along them stay on the same building and keep qualifying. The
      // fragmentation that costs every additive preset does not apply when the
      // new surface is part of the thing it was cut from.
      occlusivity: 'raise',
      // Surfaces move further away, so the angle they rise to falls: -1.0%
      // averaged, -17% measured at the opening.
      enclosure: 'none',
      // Rays that met the facade still meet the building, just deeper in.
      solidShare: { direction: 'none', diagnostic: false },
      // Same coverage, subtended at a greater distance, so more metres: +0.4%.
      solidFrontage: 'none',
      solidity: 'none',
    },
    // Generated against a host facade rather than in a free frame, so it takes
    // a different signature from the additive presets and is called from
    // lib/sandbox.js rather than from elementParts().
    generate() {
      return []
    },
  }
)

export const presetById = new Map(PRESETS.map((p) => [p.id, p]))

export function defaultParams(presetId) {
  const preset = presetById.get(presetId)
  if (!preset) throw new Error(`Unknown preset "${presetId}"`)
  return Object.fromEntries(
    Object.entries(preset.params).map(([key, spec]) => [key, spec.default])
  )
}

/* --------------------------------------------------- subtractive geometry */

// THE STANDING HOST RULE FOR EVERY SUBTRACTIVE PRESET.
//
// Not a patch for the recessed arcade. Any preset that carves into existing
// geometry — present or future — selects its host through nearestFacade() and
// therefore inherits these thresholds; test/presets.test.js asserts that every
// preset marked `subtractive` does so, so a new one cannot quietly reintroduce
// the bug by finding its own host.
//
// ADDED AFTER THE FIRST VALIDATION RUN, which selected a 1.98 m edge on a
// 3.2 m-tall kiosk standing in the middle of Konstablerwache — nearer to the
// click than any real facade, and useless as a host: the 24 m recess was
// clipped to 1.5 m and the intervention did essentially nothing. "Nearest edge"
// is the wrong question; "nearest edge that could hold this" is the right one.
export const MIN_FACADE_LENGTH_M = 8
// Two storeys. A recess is a cut into a GROUND FLOOR, which presupposes there
// is something above it; carving one into a single-storey shed removes the
// whole building rather than recessing it.
export const MIN_FACADE_HEIGHT_M = 6

// The nearest facade edge to a clicked point that could actually host a recess.
//
// Returned with the parameter along that edge where the click projects, so a
// recess can be centred where the designer actually pointed rather than at the
// middle of whatever segment happened to be closest.
export function nearestFacade(
  point,
  buildings,
  maxDistance = 25,
  {
    minLength = MIN_FACADE_LENGTH_M,
    minHeight = MIN_FACADE_HEIGHT_M,
    // Buildings the sandbox has demolished. Passed as a set of INDICES INTO
    // THE ORIGINAL LIST rather than by handing this function an already-
    // filtered array, because the index it returns is stored on the recess
    // element and must keep addressing the site's own building list. Filtering
    // first would shift every later index and cut the recess into the wrong
    // block — with nothing about the result that looks wrong.
    skip = null,
  } = {}
) {
  let best = null
  for (let b = 0; b < buildings.length; b++) {
    if (skip?.has(b)) continue
    const ring = buildings[b].footprint
    if (!ring) continue
    // A sandbox-drawn mass is not a facade to be cut into; only surveyed
    // buildings host a recess.
    if (buildings[b].sandbox) continue
    if ((buildings[b].height ?? 0) < minHeight) continue
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      const vx = c.x - a.x
      const vy = c.y - a.y
      const len2 = vx * vx + vy * vy
      if (len2 === 0) continue
      if (len2 < minLength * minLength) continue
      let t = ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2
      t = Math.max(0, Math.min(1, t))
      const px = a.x + t * vx
      const py = a.y + t * vy
      const d = Math.hypot(point.x - px, point.y - py)
      if (!best || d < best.distance) {
        best = { building: b, edge: i, t, distance: d, length: Math.sqrt(len2) }
      }
    }
  }
  return best && best.distance <= maxDistance ? best : null
}

// Rewrite one building's eye-height outline so a stretch of one facade is
// recessed.
//
// WHY THIS NEEDS NO POLYGON BOOLEAN. A general cut through a footprint can
// split it into two pieces and genuinely requires clipping. A recess along a
// SELECTED FACADE SEGMENT cannot: it removes an interval from one edge and adds
// three walls behind it. That is one-dimensional subtraction along a single
// segment, which is exact, has no degenerate cases worth the name, and needs no
// dependency.
//
// Everything returned belongs to the HOST BUILDING and is emitted as edges
// rather than as a ring, because the resulting outline is not a closed loop —
// it is the original perimeter with a bite taken out and the bite's walls added
// behind it. The engine consumes edges, so no ring is required.
//
// Piers stand on the ORIGINAL building line, spanning the opening. They are
// part of the host building too, which is what makes this the one intervention
// whose new surface does not fragment the occlusivity run.
export function generateRecess(element, hostBuilding) {
  const ring = hostBuilding.footprint
  const p = element.params
  const i = element.edge
  const a = ring[i]
  const c = ring[(i + 1) % ring.length]

  const vx = c.x - a.x
  const vy = c.y - a.y
  const edgeLen = Math.hypot(vx, vy)
  if (edgeLen < 1) return null
  const ux = vx / edgeLen
  const uy = vy / edgeLen

  // Inward normal: perpendicular to the edge, pointing into the footprint. A
  // ring may be wound either way, so the direction is TESTED rather than
  // assumed — carving the recess outward would push a wall into the square.
  let nx = -uy
  let ny = ux
  const probe = { x: (a.x + c.x) / 2 + nx * 0.5, y: (a.y + c.y) / 2 + ny * 0.5 }
  if (!pointInRing(ring, probe.x, probe.y)) {
    nx = -nx
    ny = -ny
  }

  // The recessed interval along the edge, centred on the click and held clear
  // of both ends of the facade.
  //
  // THE INSET IS NOT TIDINESS. A recess starting exactly on a corner puts its
  // return wall right where the adjacent edge begins, and if that edge happens
  // to run inward — which it does wherever the block steps back — the return
  // wall retraces along it and the outline self-intersects. Keeping the span a
  // recess-depth clear of each corner means the returns always meet open
  // facade instead.
  const inset = Math.max(0.5, p.depth)
  const available = edgeLen - 2 * inset
  if (available < 2) return null

  const half = Math.min(p.length, available) / 2
  const centre = Math.min(
    Math.max(inset + half, element.t * edgeLen),
    edgeLen - inset - half
  )
  const s0 = centre - half
  const s1 = centre + half
  if (s1 - s0 < 1) return null

  const at = (s, inward = 0) => ({
    x: a.x + ux * s + nx * inward,
    y: a.y + uy * s + ny * inward,
  })

  // The recess cannot be deeper than the building is BEHIND THIS SPAN.
  //
  // Measured locally, by casting inward from points along the opening to the
  // next wall of the same footprint. The first version measured the deepest
  // vertex anywhere in the ring, which on a 28-corner block meant a 3 m recess
  // being cut into a stretch of facade only 3.2 m deep — punching out the far
  // side and leaving a self-intersecting outline that would not extrude.
  const depth = Math.min(p.depth, 0.8 * depthBehindSpan(ring, i, at, nx, ny, s0, s1))

  const P0 = at(s0)
  const P1 = at(s1)
  const B0 = at(s0, depth)
  const B1 = at(s1, depth)

  const edges = []
  // What survives of the original facade, either side of the opening.
  if (s0 > 0.01) edges.push(segment(a, P0))
  if (s1 < edgeLen - 0.01) edges.push(segment(P1, c))
  // The recess itself: two returns and the back wall.
  edges.push(segment(P0, B0))
  edges.push(segment(B0, B1))
  edges.push(segment(B1, P1))

  // Piers on the original building line, spanning the opening.
  const pierWidth = 0.6
  const positions = []
  const span = s1 - s0
  const bays = Math.max(1, Math.round(span / p.pier_spacing))
  for (let k = 1; k < bays; k++) positions.push(s0 + (span * k) / bays)
  for (const s of positions) {
    const q0 = at(s - pierWidth / 2)
    const q1 = at(s + pierWidth / 2)
    const q2 = at(s + pierWidth / 2, pierWidth)
    const q3 = at(s - pierWidth / 2, pierWidth)
    edges.push(segment(q0, q1), segment(q1, q2), segment(q2, q3), segment(q3, q0))
  }

  return {
    edges,
    // For drawing: the opening's outline, and the piers as footprints.
    opening: [P0, B0, B1, P1],
    piers: positions.map((s) => [
      at(s - pierWidth / 2),
      at(s + pierWidth / 2),
      at(s + pierWidth / 2, pierWidth),
      at(s - pierWidth / 2, pierWidth),
    ]),
    depth,
  }
}

const segment = (p, q) => ({ x1: p.x, y1: p.y, x2: q.x, y2: q.y })

// How much of a building the recess is taken to occupy, for DRAWING ONLY.
//
// The measurement never needs this: the cast is a single slice at 1.6 m, and
// the recess either contains that height or it does not. But a 3D view has to
// decide where the loggia stops and the wall above it begins, so a ground
// storey is assumed. It is a drawing convention, stated here rather than
// buried in the renderer, and no measured number depends on it.
export const GROUND_STOREY_M = 4.5

// The host building's ground-floor outline with the recess notched into it.
//
// A closed ring, not an edge list — and it can be closed, which is what makes a
// truthful 3D loggia possible without a CSG library. The recess replaces one
// edge a→c with the path a→P0→B0→B1→P1→c, and because the notch is shallower
// than the block it is cut into (generateRecess caps the depth at 80% of it),
// the result stays a simple polygon that extrudes correctly.
//
// The ray-caster does not use this. It works from the edge list, where the
// outline legitimately has a gap in it. This exists so the drawing and the
// measurement can be built from the same cut without either compromising for
// the other.
export function recessedGroundRing(hostRing, edgeIndex, cut) {
  const i = ((edgeIndex % hostRing.length) + hostRing.length) % hostRing.length
  const ring = [...hostRing.slice(0, i + 1), ...cut.opening, ...hostRing.slice(i + 1)]
  // Consecutive duplicates would be zero-length edges, which give a triangulator
  // no direction to work from. They arise wherever the opening happens to begin
  // within a millimetre of a corner.
  return ring.filter((p, k) => {
    const prev = ring[(k - 1 + ring.length) % ring.length]
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6
  })
}

// How deep the block actually is directly behind the recess opening.
//
// Sampled across the span rather than taken at its midpoint, because a
// footprint can step back partway along a facade and the recess has to clear
// the SHALLOWEST point it spans, not the average one. The source edge is
// excluded — a ray leaving it would otherwise report a hit on the wall it
// started from at zero distance.
function depthBehindSpan(ring, edgeIndex, at, nx, ny, s0, s1, samples = 8) {
  let shallowest = Infinity
  for (let k = 0; k <= samples; k++) {
    const origin = at(s0 + ((s1 - s0) * k) / samples)
    let nearest = Infinity
    for (let j = 0; j < ring.length; j++) {
      if (j === edgeIndex) continue
      const p = ring[j]
      const q = ring[(j + 1) % ring.length]
      const t = rayHitSegment(origin.x, origin.y, nx, ny, p.x, p.y, q.x, q.y)
      if (t != null && t > 1e-6 && t < nearest) nearest = t
    }
    if (nearest < shallowest) shallowest = nearest
  }
  // A facade with nothing behind it at all (an open-ended sliver) gets a
  // nominal metre rather than an unbounded recess.
  return Number.isFinite(shallowest) ? Math.max(0.5, shallowest) : 1
}

// Ray (origin + t·d, t ≥ 0, d unit) against a segment. The same construction
// as raySegmentDistance in isovist.js, kept local so this module kept its
// independence from the engine.
function rayHitSegment(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1
  const sy = y2 - y1
  const denom = dx * sy - dy * sx
  if (Math.abs(denom) < 1e-12) return null
  const qpx = x1 - ox
  const qpy = y1 - oy
  const t = (qpx * sy - qpy * sx) / denom
  const u = (qpx * dy - qpy * dx) / denom
  if (t < 0 || u < 0 || u > 1) return null
  return t
}

function pointInRing(ring, px, py) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// A placed recess. Unlike an additive preset it carries the host facade it was
// cut into, which is what makes it reproducible: the same building and edge,
// not a position that might land on a different wall after a geometry edit.
export function makeRecessElement(facade, params = null, id = null) {
  return {
    id: id ?? `recess-${Math.random().toString(36).slice(2, 9)}`,
    kind: 'recess',
    preset: 'recessedArcade',
    params: params ?? defaultParams('recessedArcade'),
    building: facade.building,
    edge: facade.edge,
    t: facade.t,
    placed_at: new Date().toISOString(),
  }
}

// One placed preset, in the shape lib/sandbox.js consumes. Parameters are
// stored rather than the geometry they produce, so a slider can regenerate the
// parts without the element losing its identity.
export function makePresetElement(presetId, anchor, params = null, rotationDeg = 0, id = null) {
  const preset = presetById.get(presetId)
  if (!preset) throw new Error(`Unknown preset "${presetId}"`)
  return {
    id: id ?? `${presetId}-${Math.random().toString(36).slice(2, 9)}`,
    kind: 'preset',
    preset: presetId,
    params: params ?? defaultParams(presetId),
    anchor: { x: anchor.x, y: anchor.y },
    rotation_deg: rotationDeg,
    placed_at: new Date().toISOString(),
  }
}

// The solid parts a placed element currently resolves to. Called fresh on every
// parameter change — this is what makes a slider drive real geometry rather
// than a cached approximation of it.
export function elementParts(element) {
  if (!element) return []

  // A DEMOLITION has no parts either, and for the same reason a recess does
  // not: it takes geometry away rather than adding any. composeGeometry drops
  // the building it names; there is nothing here to draw or to cast against.
  if (element.kind === 'demolish') return []

  // A SUBTRACTIVE element has no parts, and saying so explicitly is the point.
  // Without this it fell through to the freeform branch below and produced a
  // part with `footprint: undefined`, which every consumer then crashed on the
  // moment a recess was placed. A recess rewrites a host building's outline
  // (see generateRecess); it adds nothing, so it contributes nothing here.
  if (element.kind === 'recess') return []

  if (element.kind === 'preset') {
    const preset = presetById.get(element.preset)
    if (!preset) return []
    return preset.generate(element.params, element.anchor, element.rotation_deg ?? 0)
  }

  // A freeform mass drawn on the plan: one part, from the ground to its height.
  // Guarded, because a part without a footprint is not a degraded part — it is
  // one that will crash whatever tries to draw it, and failing here names the
  // element instead of failing three layers away with no context.
  if (!Array.isArray(element.footprint) || !Number.isFinite(element.height_m)) {
    throw new Error(
      `Element "${element.id}" has kind "${element.kind ?? 'undefined'}" and no usable footprint ` +
        'or height. Every element kind must be handled explicitly above.'
    )
  }
  return [
    {
      footprint: element.footprint,
      base: 0,
      top: element.height_m,
      role: 'freeform',
    },
  ]
}

// A one-line label for any placed element, whatever kind it is.
//
// EVERY LIST OF SANDBOX CONTENTS MUST COME THROUGH HERE. The panels used to
// describe elements inline, and one of them reached for `element.footprint`,
// which only a freehand mass has. The moment a preset was placed, opening that
// panel crashed the page — and kept crashing after a reload, because the
// preset came back from storage. A single function that handles every kind is
// what makes that a thing tests can check rather than a thing greps can miss.
// A building taken away.
//
// The only SUBTRACTIVE move in the library that removes a whole mass rather
// than carving into one, and the only move of any kind that can make a plaza's
// isovists LARGER. Every additive preset lowers area, compactness and
// occlusivity together — measured across all nine, that is the single direction
// they all travel — so with additions alone whole regions of the typology are
// unreachable by construction. "Vast, regular" in particular requires area to
// rise, which nothing you can build will do.
//
// STORED AS AN INDEX INTO THE SITE'S OWN BUILDING LIST, never as a copy of the
// footprint. A demolition is a statement about which surveyed building is gone;
// copying its geometry into the sandbox would create a second version of that
// building which could disagree with sites.json after a re-survey, and would
// quietly put register data into a scenario file that is forbidden to hold it.
export function makeDemolition(buildingIndex, id = null) {
  return {
    // Keyed on the building, so clicking the same block twice cannot stack two
    // demolitions of one building in the list.
    id: id ?? `demolish-${buildingIndex}`,
    kind: 'demolish',
    building: buildingIndex,
    drawn_at: new Date().toISOString(),
  }
}

// Which surveyed building a click falls inside, or null. Sandbox masses are
// skipped: those are removed from the element list, not demolished.
export function buildingAt(point, buildings) {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]
    if (b.sandbox || !b.footprint) continue
    if (pointInRing(b.footprint, point.x, point.y)) return i
  }
  return null
}

export function describeElement(element) {
  if (!element) return 'unknown element'
  if (element.kind === 'demolish') {
    return `Removed building #${element.building}`
  }
  if (element.kind === 'recess') {
    const preset = presetById.get(element.preset)
    return `${preset?.name ?? 'Recess'} · ${element.params?.length ?? '?'} m`
  }
  if (element.kind === 'preset') {
    const preset = presetById.get(element.preset)
    return preset?.name ?? element.preset ?? 'preset'
  }
  if (Array.isArray(element.footprint)) {
    return `Freehand · ${element.footprint.length} corners · ${element.height_m} m`
  }
  return 'unrecognised element'
}

// The parts that actually obstruct the cast — what the ray-caster is handed.
export function blockingParts(element) {
  return elementParts(element).filter(partBlocks)
}

// Whether a placed element is entirely outside the measured slice, and why.
// Surfaced in the UI so a designer is told their move is invisible to the
// instrument rather than left to infer it from four unmoved numbers.
export function visibilityNote(element) {
  const parts = elementParts(element)
  if (!parts.length) return null
  if (parts.some(partBlocks)) return null
  const tallest = Math.max(...parts.map((p) => p.top))
  const lowestBase = Math.min(...parts.map((p) => p.base))
  if (tallest <= EYE_HEIGHT_M) {
    return `Everything here stands below the ${EYE_HEIGHT_M} m slice the isovist is measured in, so the metrics will not move.`
  }
  if (lowestBase > EYE_HEIGHT_M) {
    return `Everything here sits above the ${EYE_HEIGHT_M} m slice the isovist is measured in, so the metrics will not move.`
  }
  return `Nothing here crosses the ${EYE_HEIGHT_M} m slice the isovist is measured in, so the metrics will not move.`
}
