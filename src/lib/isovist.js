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
  { fov = FOV_DEG, range = MAX_RANGE_M, rayCount = RAY_COUNT, index = null } = {}
) {
  // `index` is an optional prebuilt edge index (buildEdgeIndex). Passing one
  // lets a batch caster build it once per site and reuse it across thousands of
  // points; omitting it falls back to scanning every edge, which is what the
  // viewer and the single-reading paths do. Both routes return the same hit —
  // test/isovist.test.js asserts it point for point.
  const useIndex = index && !index.empty
  const edges = useIndex ? index.edges : buildingEdges(buildings)
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

  return { vantage, direction: directionRad, fov, rays, ...computeMetrics(vantage, rays, closed) }
}

function buildingEdges(buildings) {
  const edges = []
  for (let b = 0; b < buildings.length; b++) {
    const ring = buildings[b].footprint
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      // `building` travels with the edge so occlusivity can tell a run along
      // one facade from a jump between two — see computeMetrics.
      edges.push({ x1: a.x, y1: a.y, x2: c.x, y2: c.y, height: buildings[b].height, building: b })
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

export function buildEdgeIndex(buildings) {
  const edges = buildingEdges(buildings)
  if (!edges.length) return { edges, empty: true }

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

  return { edges, buckets, cell, cols, rows, minX, minY, maxX, maxY, empty: false }
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
    if (a.wall && b.wall && continuous) closedPerimeter += edgeLen
  }

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

  return { area, perimeter, compactness, occlusivity: closedPerimeter, enclosureRatio }
}
