// Unified ray-casting engine (P2 — Spatial Analysis): one shared ray pass produces both the
// isovist polygon and the enclosure ratio, per the "radiate" method (Benedikt
// 1979) matching the Decoding Spaces Grasshopper component.
//
// All points are in local metres on the Z-up ground plane (X = east, Y =
// north), the same space produced by projectSite(). Direction is a compass
// bearing in radians: 0 = north (+Y), increasing clockwise (90° = east).

export const FOV_DEG = 120
export const MAX_RANGE_M = 200
// How close two wall hits on DIFFERENT buildings must be to read as one
// continuous surface rather than a view slipping between them — see
// computeMetrics. Sized as "these two facades meet": narrower than any real
// gap a person could see through or walk down, and wider than the offset
// between two abutting footprints traced separately in OSM.
const TOUCHING_TOLERANCE_M = 1.5
export const RAY_COUNT = 120 // 1 ray per degree across the 120° cone (confirmed: Grasshopper precision = 1 ray/degree)

// Bearing (radians, 0 = north, clockwise) from `from` towards `to`.
export function bearingTo(from, to) {
  return Math.atan2(to.x - from.x, to.y - from.y)
}

// Casts RAY_COUNT rays evenly across the FOV_DEG cone centered on
// `directionRad`, from `vantage`, against every building footprint edge.
// Returns the ray results plus the four metrics computed from them.
//
// Two shapes of isovist come out of this, and they are geometrically different
// objects (see `closed` below), not the same thing at two settings:
//
//   - an open wedge (fov < 360) — the perceptual layer's directional view. Its
//     polygon has to be closed back through the vantage point, because a wedge
//     of ray endpoints alone is not a loop.
//   - a closed ring (fov === 360) — the field layer's omnidirectional isovist.
//     Its ray endpoints already form the full loop, so the vantage point is
//     *not* a vertex; including it would add a zero-area spoke out to the first
//     ray and back, leaving area untouched but inflating the perimeter by twice
//     a ray length and thereby corrupting compactness.
export function castIsovist(
  vantage,
  directionRad,
  buildings,
  {
    fov = FOV_DEG,
    range = MAX_RANGE_M,
    rayCount = RAY_COUNT,
    index = null,
    // P9 ONLY. When true, a footprint obstructs the cast only if it straddles
    // eye height — see buildingEdges. Left false, this engine behaves exactly
    // as it did for P1–P8 and no stored value changes.
    heightAware = false,
    eyeHeight = EYE_HEIGHT_M,
  } = {}
) {
  // `index` is an optional prebuilt edge index (buildEdgeIndex). Passing one
  // lets a batch caster build it once per site and reuse it across thousands of
  // points; omitting it falls back to scanning every edge, which is what the
  // viewer and the single-reading paths do. Both routes return the same hit —
  // test/isovist.test.js asserts it point for point.
  //
  // An index built in one height mode must not be reused in the other: it has
  // already dropped the edges its mode excludes. buildEdgeIndex records the
  // mode it was built under and this refuses a mismatch rather than silently
  // measuring the wrong plaza.
  const useIndex = index && !index.empty
  if (useIndex && (index.heightAware ?? false) !== heightAware) {
    throw new Error(
      `Edge index was built with heightAware=${index.heightAware ?? false} but the cast asked for ` +
        `${heightAware}. Rebuild the index for this mode — reusing it would measure a different set of obstacles.`
    )
  }
  const edges = useIndex ? index.edges : buildingEdges(buildings, heightAware, eyeHeight)
  const span = (fov * Math.PI) / 180
  const halfFov = span / 2

  // A full circle wraps onto itself, so its last ray must stop one step short
  // of its first (i / rayCount) rather than landing on top of it — otherwise
  // 360 rays sample only 359 distinct bearings, one of them twice.
  const closed = fov >= 360 - 1e-9
  const steps = closed ? rayCount : Math.max(rayCount - 1, 1)

  const rays = []
  for (let i = 0; i < rayCount; i++) {
    const t = !closed && rayCount === 1 ? 0.5 : i / steps
    const angle = directionRad - halfFov + t * span
    const dx = Math.sin(angle)
    const dy = Math.cos(angle)

    const hit = useIndex
      ? nearestIntersectionIndexed(vantage, dx, dy, range, index)
      : nearestIntersection(vantage, dx, dy, range, edges)
    rays.push(
      hit
        ? {
            angle,
            point: hit.point,
            distance: hit.distance,
            wall: true,
            height: hit.height,
            building: hit.building,
          }
        : {
            angle,
            point: { x: vantage.x + dx * range, y: vantage.y + dy * range },
            distance: range,
            wall: false,
            height: null,
            building: null,
          }
    )
  }

  return {
    vantage,
    direction: directionRad,
    fov,
    rays,
    ...computeMetrics(vantage, rays, closed),
  }
}

// Standing eye height, and the band of space the cast actually samples when
// height-aware mode is on. Matches EYE_HEIGHT_M in viewGeometry.js, which is
// the height the enclosure metric's vertical angles already assume; it is
// duplicated rather than imported so this module stays free of dependencies.
export const EYE_HEIGHT_M = 1.6

// A building's own edges, or the explicit edge list it supplies instead.
//
// `edges` exists for geometry that is not a closed ring: P9's recessed-arcade
// preset removes a span from one facade and adds the recess walls behind it, so
// the result is a building whose eye-height outline has a gap in it. Expressing
// that as a ring would require a polygon boolean; expressed as edges it is a
// one-dimensional interval subtraction along a single segment.
//
// HEIGHT AWARENESS IS OFF BY DEFAULT AND MUST STAY THAT WAY. P1–P8 call this
// engine unflagged and every stored corpus value depends on the current
// behaviour, in which every footprint obstructs regardless of height. When the
// flag is off not a single comparison below is evaluated, so the unflagged path
// is not merely equivalent to the old one, it is the old one.
function buildingEdges(buildings, heightAware = false, eyeHeight = EYE_HEIGHT_M) {
  const edges = []
  for (let b = 0; b < buildings.length; b++) {
    const source = buildings[b]

    if (heightAware) {
      // A part obstructs the eye-height slice only if it straddles it. A
      // 300 mm planter rim and a pergola roof four metres up are both outside
      // the slice and neither can stop a ray, which is the whole point of the
      // mode: without it the engine treats every footprint as infinitely tall.
      const base = source.base ?? 0
      const top = source.height ?? Infinity
      if (!(base <= eyeHeight && top > eyeHeight)) continue
    }

    if (Array.isArray(source.edges)) {
      for (const e of source.edges) {
        edges.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, height: e.height ?? source.height, building: b })
      }
      continue
    }

    const ring = source.footprint
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      // `building` travels with the edge so occlusivity can tell a run along
      // one facade from a jump between two — see computeMetrics.
      edges.push({ x1: a.x, y1: a.y, x2: c.x, y2: c.y, height: source.height, building: b })
    }
  }
  return edges
}

// ------------------------------------------------------------ spatial index
//
// Casting a ray against every facade in the site is fine for the handful of
// readings a researcher places by hand, and far too slow for P6, which casts
// from ~11,700 grid points against sites carrying up to 9,300 edges.
//
// The index buckets edges into a uniform grid of square cells and walks only
// the cells a ray actually crosses, in near-to-far order. Because the walk is
// ordered, the FIRST hit found is already the nearest one and the traversal can
// stop — a ray that meets a wall 20 m away never looks at the far side of the
// site. That early exit is where most of the saving comes from.
//
// The cell size is a speed knob only. Too large and each cell holds too many
// edges; too small and the walk visits too many cells. Roughly one cell per few
// metres suits building footprints, and the count is capped so a large site
// cannot allocate an enormous grid.
const INDEX_TARGET_CELL_M = 8
const INDEX_MAX_CELLS = 262144

export function buildEdgeIndex(buildings, { heightAware = false, eyeHeight = EYE_HEIGHT_M } = {}) {
  const edges = buildingEdges(buildings, heightAware, eyeHeight)
  // The mode is recorded so castIsovist can refuse an index built under the
  // other one. An index has already discarded the edges its mode excludes, so
  // reusing it across modes would quietly measure a different set of obstacles.
  if (!edges.length) return { edges, empty: true, heightAware }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const e of edges) {
    minX = Math.min(minX, e.x1, e.x2)
    maxX = Math.max(maxX, e.x1, e.x2)
    minY = Math.min(minY, e.y1, e.y2)
    maxY = Math.max(maxY, e.y1, e.y2)
  }
  // A margin keeps rays that begin fractionally outside the footprint extent
  // inside the indexed region, so the walk starts in a real cell.
  const pad = INDEX_TARGET_CELL_M
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad

  let cell = INDEX_TARGET_CELL_M
  let cols = Math.max(1, Math.ceil((maxX - minX) / cell))
  let rows = Math.max(1, Math.ceil((maxY - minY) / cell))
  while (cols * rows > INDEX_MAX_CELLS) {
    cell *= 2
    cols = Math.max(1, Math.ceil((maxX - minX) / cell))
    rows = Math.max(1, Math.ceil((maxY - minY) / cell))
  }

  const buckets = Array.from({ length: cols * rows }, () => [])
  // An edge is registered in every cell its bounding box touches. Bounding-box
  // registration over-includes slightly for diagonal edges, which costs a few
  // redundant segment tests and can never miss a true intersection.
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    const c0 = Math.max(0, Math.floor((Math.min(e.x1, e.x2) - minX) / cell))
    const c1 = Math.min(cols - 1, Math.floor((Math.max(e.x1, e.x2) - minX) / cell))
    const r0 = Math.max(0, Math.floor((Math.min(e.y1, e.y2) - minY) / cell))
    const r1 = Math.min(rows - 1, Math.floor((Math.max(e.y1, e.y2) - minY) / cell))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) buckets[r * cols + c].push(i)
    }
  }

  return { edges, buckets, cell, cols, rows, minX, minY, maxX, maxY, empty: false, heightAware }
}

function nearestIntersection(origin, dx, dy, maxRange, edges) {
  let nearest = null
  for (const e of edges) {
    const t = raySegmentDistance(origin.x, origin.y, dx, dy, e.x1, e.y1, e.x2, e.y2)
    if (t != null && t <= maxRange && (!nearest || t < nearest.distance)) {
      nearest = {
        distance: t,
        point: { x: origin.x + dx * t, y: origin.y + dy * t },
        height: e.height,
        building: e.building,
      }
    }
  }
  return nearest
}

// Same answer as nearestIntersection, reached by walking only the index cells
// the ray passes through (a DDA traversal), nearest cell first.
//
// The early exit needs care. A hit found inside a cell is not automatically the
// nearest hit overall: an edge registered in this cell may extend beyond it and
// be crossed further along, while a nearer edge sits in the next cell. So the
// walk stops only once the closest hit so far is nearer than the entry point of
// the cell about to be visited — at which point nothing ahead can beat it.
function nearestIntersectionIndexed(origin, dx, dy, maxRange, index) {
  const { edges, buckets, cell, cols, rows, minX, minY } = index

  let cx = Math.floor((origin.x - minX) / cell)
  let cy = Math.floor((origin.y - minY) / cell)
  // A ray starting outside the indexed extent is handled by the brute-force
  // path; stepping it into the grid is not worth the extra branch.
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) {
    return nearestIntersection(origin, dx, dy, maxRange, edges)
  }

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const invX = dx !== 0 ? 1 / dx : 0
  const invY = dy !== 0 ? 1 / dy : 0

  // Distance along the ray to the next cell boundary in each axis, and the
  // distance between successive boundaries.
  const nextBoundX = minX + (cx + (stepX > 0 ? 1 : 0)) * cell
  const nextBoundY = minY + (cy + (stepY > 0 ? 1 : 0)) * cell
  let tMaxX = stepX !== 0 ? (nextBoundX - origin.x) * invX : Infinity
  let tMaxY = stepY !== 0 ? (nextBoundY - origin.y) * invY : Infinity
  const tDeltaX = stepX !== 0 ? Math.abs(cell * invX) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(cell * invY) : Infinity

  let nearest = null
  let tEntry = 0 // distance at which the ray enters the current cell
  let guard = cols + rows + 2 // a straight walk cannot exceed this many cells

  while (guard-- > 0) {
    if (nearest && nearest.distance <= tEntry) break // nothing ahead can be nearer
    if (tEntry > maxRange) break

    for (const i of buckets[cy * cols + cx]) {
      const e = edges[i]
      const t = raySegmentDistance(origin.x, origin.y, dx, dy, e.x1, e.y1, e.x2, e.y2)
      if (t != null && t <= maxRange && (!nearest || t < nearest.distance)) {
        nearest = {
          distance: t,
          point: { x: origin.x + dx * t, y: origin.y + dy * t },
          height: e.height,
          building: e.building,
        }
      }
    }

    if (tMaxX < tMaxY) {
      tEntry = tMaxX
      cx += stepX
      tMaxX += tDeltaX
    } else {
      tEntry = tMaxY
      cy += stepY
      tMaxY += tDeltaY
    }
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) break
  }

  return nearest
}

// Ray (origin + t*(dx,dy), t >= 0, (dx,dy) unit length) vs segment (x1,y1)-(x2,y2).
// Returns t (== distance) at the intersection, or null if none.
function raySegmentDistance(ox, oy, dx, dy, x1, y1, x2, y2) {
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

// Builds the polygon, then computes Area (shoelace), Perimeter, Compactness,
// and Occlusivity (closed perimeter: the sum of edges that run along a single
// building's facade — both endpoints wall hits on the SAME building).
//
// For a wedge the vantage point leads the vertex list, closing the two side
// edges of the cone; because that vertex is never a wall hit, those two closing
// edges drop out of the occlusivity sum on their own. For a full 360° ring the
// ray endpoints already close the loop and the vantage point is omitted — there
// the wrap-around edge from the last ray back to the first is a genuine
// neighbouring pair and counts towards occlusivity like any other.
function computeMetrics(vantage, rays, closed = false) {
  const endpoints = rays.map((r) => ({
    x: r.point.x - vantage.x,
    y: r.point.y - vantage.y,
    wall: r.wall,
    building: r.building,
  }))
  const verts = closed ? endpoints : [{ x: 0, y: 0, wall: false, building: null }, ...endpoints]

  const n = verts.length
  let shoelace = 0
  let perimeter = 0
  let closedPerimeter = 0
  let closedEdges = 0

  for (let i = 0; i < n; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % n]
    shoelace += a.x * b.y - b.x * a.y
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
    perimeter += edgeLen
    // Closed perimeter counts an edge only where it runs along continuous
    // facade: both ends are wall hits on the same building, or on two
    // buildings that physically meet.
    //
    // "Both ends hit some wall" is not enough, and getting this wrong is not a
    // rounding difference. Where one ray stops on the building in front and the
    // next slips past its corner into a side street to land on a different
    // building 90 m away, the edge between those two hits crosses open street —
    // it is the gap between buildings, the exact opposite of closed perimeter —
    // yet both its ends are wall hits. Counting those inflated this metric by
    // ~50% against Grasshopper on a matched point at Zeil (559 m vs 376 m; the
    // same-building rule gives 355 m), always upward, since a phantom edge can
    // only ever add length.
    //
    // It also made the metric unstable in a way a measurement of a real place
    // must not be: whether such a jump exists depends on exactly where a ray
    // falls relative to a corner, so the old rule swung 199→273 m across ray
    // counts at one fixed point, and ~27% across a 1.2° rotation, while area
    // moved under 0.5%.
    //
    // Same-building alone is too strict, though. A plaza ringed by a terrace is
    // many separate footprints sharing party walls, and a European square is
    // usually exactly that; a room enclosed by four abutting blocks is
    // continuously walled whether or not a cadastre splits it into four
    // polygons. So two hits that land within a short distance of each other are
    // treated as one surface — buildings that meet put their hit points at the
    // shared corner, while a jump across a street opening separates them by the
    // width of the street.
    const continuous =
      a.building === b.building || edgeLen <= TOUCHING_TOLERANCE_M
    if (a.wall && b.wall && continuous) {
      closedPerimeter += edgeLen
      closedEdges++
    }
  }

  // CLOSED SHARE — the same continuity test as occlusivity, added 2026-09-12,
  // but tallied as a FRACTION OF THE HORIZON rather than a length in metres.
  //
  // Occlusivity answers "how many real metres of unbroken wall touch my view."
  // That is the right question for comparing plazas of different sizes, but it
  // has a blind spot P9 is the first phase to expose: a near object and a far
  // one can pass the exact same continuity test and still disagree completely
  // once converted to metres, because a near surface is physically small no
  // matter how much of the horizon it fills. Four small pavilions built close
  // enough to surround a person can drop occlusivity by two thirds while
  // raising closed share, because the pavilions are individually tiny in
  // metres but leave nothing between them uncounted.
  //
  // Closed share is therefore occlusivity's answer to "how much of what I see
  // is unbroken wall" rather than "how long is that wall" — the coverage
  // question solid share was meant to answer, asked with occlusivity's
  // continuity rule instead of solid share's none. It is not saturated at this
  // site the way solid share is: the baseline sits at 0.897, not 0.981, and
  // both additive and subtractive interventions move it in both directions.
  const closedShare = n > 0 ? closedEdges / n : 0

  const area = Math.abs(shoelace) / 2
  const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0

  // Enclosure: the mean angle the built edge rises to around you, as a share of
  // the 90° you could in principle look up. 0 = open sky all round, 1 = sheer
  // wall in every direction.
  //
  // Two things distinguish this from the mean h/d it replaced.
  //
  // EVERY DIRECTION COUNTS. A ray that meets no wall contributes 0 rather than
  // being dropped from the average. Excluding it made openness invisible: a
  // square leaking 40% of its horizon to streets was scored only on the walled
  // 60%, so it could tie with one that is completely ringed by the same
  // facades. Openness is not missing data about enclosure, it IS the absence of
  // enclosure, and has to enter the average as such.
  //
  // ANGLE, NOT RATIO. h/d has no ceiling — a wall four times as tall scores
  // four times as enclosing — but a view does: you cannot look up past 90°, and
  // the difference between a wall at 76° and one at 83° is not what the
  // difference between h/d = 4 and h/d = 8 suggests. Because these are averaged
  // over the ring, an unbounded term also lets one tall building close by
  // dominate the whole figure; the arctangent saturates instead, so height
  // still raises enclosure (doubling every building raises it ~1.7x) without
  // any single direction swamping the rest. The classical enclosure thresholds
  // are stated as angles too — 45°, 27°, 18°, 14° — so this also puts the
  // measure in the units its own literature uses.
  const enclosureRatio = rays.length
    ? rays.reduce(
        (sum, r) =>
          sum +
          (r.wall && r.height > 0 && r.distance > 0
            ? Math.atan(r.height / r.distance) / (Math.PI / 2)
            : 0),
        0
      ) / rays.length
    : 0

  /* ------------------------------------------------ P9-only diagnostic metrics
   *
   * Two additional fields, added 2026-09-10 for P9's before/after diagnostics
   * ONLY. They are never written into results.json, the field files, or any
   * analysis output, and never enter a weight fit. P1–P8 simply ignore them.
   *
   * Each exists because one of the four fitted metrics answers a question P9
   * needs asked differently — not because the fitted metric is wrong. Both of
   * those stay exactly as validated.
   */

  // SOLID SHARE — the fraction of the horizon that terminates on something
  // built. Per ray, with no pairing requirement between neighbours.
  //
  // This is the honest answer to "did this intervention add solid coverage",
  // which occlusivity cannot give: closed perimeter credits an edge only where
  // consecutive rays land on the same building, so a kiosk breaks continuity
  // with the facade behind it and scores negative despite adding real surface.
  // Solid share asks only whether each individual ray met something, so an
  // object standing where there was open sky raises it, always.
  const wallRays = rays.reduce((n, r) => n + (r.wall ? 1 : 0), 0)
  const solidShare = rays.length ? wallRays / rays.length : 0

  // SOLIDITY — isovist area over the area of its convex hull.
  //
  // Compactness (4πA/P²) collapses under sparse slender obstacles: a 250 mm
  // post stops one ray short while its neighbours run on a hundred metres, so
  // each post adds two long radial edges to the perimeter, and perimeter enters
  // compactness squared. Measured at Konstablerwache, a pergola takes 2.5% off
  // area and 53% off compactness. That is what an isoperimetric quotient does
  // when a shape grows fine fringe, and it makes compactness useless for
  // judging whether an intervention of posts or trunks did anything.
  //
  // The convex hull ignores serration by construction — a notch cut into a
  // shape does not move its hull — so solidity reports how much of the space's
  // overall reach is actually occupied rather than how ragged its edge is. With
  // 360 vertices the hull is numerically comfortable.
  const hullArea = convexHullArea(verts)
  const solidity = hullArea > 0 ? area / hullArea : 0

  return {
    area,
    perimeter,
    compactness,
    occlusivity: closedPerimeter,
    enclosureRatio,
    solidShare,
    closedShare,
    solidity,
  }
}

// Convex hull by Andrew's monotone chain: sort by x then y, sweep once for the
// lower hull and once for the upper. O(n log n), and it needs no tolerance
// parameter, which matters because the isovist polygon routinely contains
// collinear runs where several rays escape to the same range arc.
export function convexHull(points) {
  if (points.length < 3) return [...points]
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  // Cross product of OA × OB. Negative or zero drops B, which also discards
  // collinear points — the hull should be corners, not every point along an edge.
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function convexHullArea(points) {
  const hull = convexHull(points)
  if (hull.length < 3) return 0
  let s = 0
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    s += hull[j].x * hull[i].y - hull[i].x * hull[j].y
  }
  return Math.abs(s) / 2
}
