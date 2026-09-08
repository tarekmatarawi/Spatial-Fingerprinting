import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'

import analysis from '@/data/analysis-panoramic.json'
import sites from '@/data/sites.json'
import readings from '@/data/results.json'
import cloudFile from '@/data/view-clouds.json'
import { Figure } from '@/components/Figure'
import { ViewCloudEditor } from '@/components/ViewCloudEditor'
// The perspective renderer pulls in Three.js, so it loads on demand rather
// than blocking the analysis above it. Everything else on this page is SVG and
// arithmetic; only these two panels need an engine.
const ViewRender = lazy(() =>
  import('@/components/ViewRender').then((m) => ({ default: m.ViewRender }))
)
// The shared drawing conventions — same type scale and palette P5's figures
// use, so the two phases' figures sit together in a thesis without looking
// like they came from different documents.
import {
  ACCENT,
  CANVAS_W,
  COOL,
  GRID,
  INK,
  MONO,
  MUTED,
  NEG,
  PAPER,
  RULE,
  TYPE,
} from '@/components/charts/tokens'
import { METRICS } from '@/lib/analysis/fingerprints'
import { linearFit, pearson } from '@/lib/analysis/projection'
import {
  MEASURES,
  cloudDistanceMatrix,
  globalNearestViews,
  matchViews,
  rankAgreement,
  spearman,
} from '@/lib/analysis/clouds'
import { activeSites, corpusWindowRadius, projectSite } from '@/lib/site'
import {
  CLOUD_FOV_DEG,
  CLOUD_FOV_MODE,
  CLOUD_RANGE_M,
  CLOUD_RAY_COUNT,
  TARGET_PER_SITE,
  buildClouds,
  cloudCoverage,
} from '@/lib/viewClouds'

// P7 — View-Cloud Comparison.
//
// The page asks one question: does it change the answer to treat a plaza as a
// set of views rather than as a single point? It is built to be readable in
// that order — place the views, then look at what the three measures say, then
// look at where they disagree, because the disagreement is the result.
//
// Unlike P5 and P6, the arithmetic runs IN THE BROWSER rather than in a batch
// script. That is a deliberate difference and it is safe here for a reason
// worth stating: eighteen clouds of eight points is a few thousand distance
// evaluations, small enough to be instant, and the numbers must respond to a
// marker being placed or the editor would be working blind. P5's fit and P6's
// clustering are neither — they take minutes and involve seeded randomness, so
// they are frozen into a file that the page only reads.
//
// NO CLUSTERING is applied to these distances, per the spec. Chamfer is not a
// metric — it can violate the triangle inequality — and k-means and MDS both
// assume one. Distances are reported, ranked, and compared; nothing is grouped.

const WEIGHTS = analysis.fit.weights_normalised
const MEASURE_IDS = ['centroid', 'gaussian', 'chamfer']

// The matrix ramp. Sequential, and deliberately not the P6 zone palette: these
// are magnitudes, never categories.
const RAMP = ['#F8FAFC', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B']

export function CloudComparisonPage() {
  const active = useMemo(() => activeSites(sites), [])
  const activeIds = useMemo(() => active.map((s) => s.id), [active])

  // The corpus-wide map scale, the same rule P6's field maps use. Computed once
  // here and handed to every drawing on the page so the placement plan, the
  // matched-view panels and P6's zone maps are all the same number of metres
  // per pixel.
  const windowRadius = useMemo(() => corpusWindowRadius(active), [active])

  const [markers, setMarkers] = useState(cloudFile.markers ?? [])
  const [siteId, setSiteId] = useState(activeIds[0] ?? null)
  const [measure, setMeasure] = useState('chamfer')
  const [saveError, setSaveError] = useState(null)

  const site = active.find((s) => s.id === siteId) ?? null

  const geometry = useMemo(() => {
    if (!site) return null
    try {
      return projectSite(site)
    } catch {
      return null
    }
  }, [site])

  // Every cloud, normalised. Rebuilt whenever a marker changes — which is what
  // lets the coverage strip and the matrices update as views are placed.
  const built = useMemo(() => {
    try {
      return buildClouds(readings, markers, activeIds)
    } catch (err) {
      return { error: err.message }
    }
  }, [markers, activeIds])

  const coverage = useMemo(
    () => (built.error ? null : cloudCoverage(built)),
    [built]
  )

  // Sends the whole file to the dev-only endpoint. Mirrors the viewer's
  // persistResults: state updates first so the plan reacts immediately, and a
  // failure on the deployed static site becomes an inline note rather than a
  // crash or a silently lost marker.
  const persist = useCallback(async (next) => {
    setMarkers(next)
    try {
      const response = await fetch('/__save-view-clouds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cloudFile,
          updated_at: new Date().toISOString(),
          markers: next,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.ok === false) {
        throw new Error(body.error || `save endpoint returned ${response.status}`)
      }
      setSaveError(null)
    } catch (err) {
      setSaveError(
        err.message?.includes('fetch')
          ? 'Placing views only saves when running locally (npm run dev).'
          : `Save failed: ${err.message}`
      )
    }
  }, [])

  const handlePlace = useCallback(
    (point, headingRad, result) => {
      if (!site || !geometry) return
      const { lat, lon } = geometry.toLatLon(point.x, point.y)
      const record = {
        id: crypto.randomUUID(),
        site_id: site.id,
        site_name: site.name,
        lat: round(lat, 6),
        lng: round(lon, 6),
        local_x: round(point.x, 2),
        local_y: round(point.y, 2),
        // 2 dp on the heading, matching the canonical readings. At a plaza with
        // street openings a sub-degree rotation can swing a ray between a near
        // facade and a 200 m escape, so a coarser record could not be recomputed
        // into the same numbers it was saved with.
        direction_deg: round(((headingRad * 180) / Math.PI + 360) % 360, 2),
        area_m2: round(result.area, 2),
        compactness: round(result.compactness, 4),
        occlusivity_m: round(result.occlusivity, 2),
        enclosure_ratio: round(result.enclosureRatio, 4),
        fov_mode: CLOUD_FOV_MODE,
        fov_deg: CLOUD_FOV_DEG,
        ray_count: CLOUD_RAY_COUNT,
        range_m: CLOUD_RANGE_M,
        placed_at: new Date().toISOString(),
      }
      persist([...markers, record])
    },
    [site, geometry, markers, persist]
  )

  const handleDelete = useCallback(
    (id) => persist(markers.filter((m) => m.id !== id)),
    [markers, persist]
  )

  if (built.error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-redline">
          The 120° fingerprints could not be assembled: {built.error}
        </p>
      </div>
    )
  }

  const cloud = built.clouds.get(siteId)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b-2 border-ink pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            P7 · View-Cloud Comparison
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            Plazas as sets of views
          </h1>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Every phase so far has stood each plaza on one 120° reading. Here each plaza is a set of
            them, and the question is how to measure the distance between two sets — three answers,
            which do not agree.
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
            <Stat label="layer" value="perceptual 120°" />
            <Stat label="views placed" value={built.markerTotal} />
            <Stat label="clouds complete" value={`${coverage.complete}/${coverage.total}`} />
            <Stat label="target" value={`${TARGET_PER_SITE} per plaza`} />
            <Stat label="weighted by" value="P5 perceptual weights" />
          </dl>
        </header>

        {/* ------------------------------------------------ build the clouds */}
        <section className="pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">1 · Place the views</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                Click inside the plaza to stand somewhere, click again to face a direction. Positions
                should be places a person would actually stand, spread across the plaza rather than
                clustered in one corner.
              </p>
            </div>
            <select
              className="input text-sm"
              value={siteId ?? ''}
              onChange={(e) => setSiteId(e.target.value)}
            >
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <CoverageStrip coverage={coverage} sites={active} selected={siteId} onSelect={setSiteId} />

          {saveError && (
            <p className="mt-3 flex items-center gap-2 rounded-md border border-warn/40 bg-warn-wash px-3 py-2 text-xs text-warn">
              <LuTriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {saveError}
            </p>
          )}

          <div className="mt-5">
            {site && cloud && (
              <ViewCloudEditor
                site={site}
                geometry={geometry}
                markers={cloud.markers}
                windowRadius={windowRadius}
                onPlace={handlePlace}
                onDelete={handleDelete}
                readOnly={Boolean(saveError)}
              />
            )}
          </div>
        </section>

        {/* ------------------------------------------------ the comparison */}
        <section className="pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">2 · Compare the clouds</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                Set-to-set distance between every pair of plazas, in the P5-weighted space.
              </p>
            </div>
            <select
              className="input text-sm"
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
            >
              {MEASURE_IDS.map((id) => (
                <option key={id} value={id}>
                  {MEASURES[id].label}
                </option>
              ))}
            </select>
          </div>

          {!coverage.ready ? (
            <NotYetComparable coverage={coverage} sites={active} />
          ) : (
            <ComparisonFigures
              built={built}
              sites={active}
              measure={measure}
              onSelect={setSiteId}
              windowRadius={windowRadius}
            />
          )}
        </section>

        {/* ------------------------------------------------ methods */}
        <section className="pt-12 pb-16">
          <details className="rounded-lg border border-line bg-surface p-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Methods &amp; assumptions
            </summary>
            <div className="mt-4 space-y-3 text-sm text-ink-muted">
              <p>
                <span className="font-medium text-ink">Layer.</span> Everything on this page is{' '}
                <code className="font-mono text-xs">perceptual_120</code>: 120 rays across a 120°
                cone to {CLOUD_RANGE_M} m, the same cast the canonical fingerprints were taken with.
                Markers are normalised against the frozen 120° bounds from the eighteen canonical
                readings — never against P6's 360° bounds, and never against the markers' own pooled
                range, which would move the scale each time a view was added.
              </p>
              <p>
                <span className="font-medium text-ink">Out of range.</span> {built.outOfRangeTotal} of{' '}
                {built.markerTotal} views fall outside 0–1 on at least one metric, meaning they are
                more extreme than any surveyed vantage point. They are kept unclipped: clamping would
                stack genuinely different positions onto the same boundary value.
              </p>
              <p>
                <span className="font-medium text-ink">Weights — a transfer assumption.</span>{' '}
                Distances use the P5 weights (
                {METRICS.map((m, i) => `${m} ${WEIGHTS[i].toFixed(3)}`).join(', ')}), which were
                fitted on the panoramic 360° survey. Applying them to 120° readings assumes relative
                metric importance carries across viewing conditions — the same assumption P6 makes,
                stated here rather than buried, and the reason the equal-weight comparison below is
                reported.
              </p>
              <p>
                <span className="font-medium text-ink">Cloud size.</span> {TARGET_PER_SITE} views per
                plaza everywhere. Equal counts matter for Chamfer, which averages over each cloud —
                a plaza sampled more densely would give its neighbours more chances to find a close
                match without being charged for it. Eight is also the least that leaves a 4×4
                covariance with more observations than dimensions, which the Gaussian measure needs.
              </p>
              <p>
                <span className="font-medium text-ink">No clustering.</span> Chamfer can violate the
                triangle inequality, so it is not a metric; k-means and MDS both assume one. These
                distances are reported and ranked, never grouped — which is also why there is no
                18-plaza map on this page as there is in P5.
              </p>
              <p>
                <span className="font-medium text-ink">Placement.</span> Views are placed by hand on
                the plan rather than sampled on a grid. That is a judgement about where a person
                would stand and it is the researcher's, not the algorithm's — a grid would answer a
                different question, and P6 already answers it.
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="inline">{label} </dt>
      <dd className="inline text-ink-muted">{value}</dd>
    </div>
  )
}

// Eighteen chips, one per plaza, filled in proportion to how complete its cloud
// is. Doubles as navigation — the fastest way to find the plaza still missing
// views is to look for the chip that is not full.
function CoverageStrip({ coverage, sites, selected, onSelect }) {
  const byId = new Map(coverage.rows.map((r) => [r.siteId, r]))
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {sites.map((s) => {
        const row = byId.get(s.id)
        const count = row?.count ?? 0
        const full = count >= coverage.target
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            title={`${s.name} — ${count}/${coverage.target} views`}
            className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
              s.id === selected
                ? 'border-primary bg-primary-wash text-primary-deep'
                : full
                  ? 'border-line bg-paper text-ink-muted hover:border-line-strong'
                  : 'border-line bg-surface text-ink-faint hover:border-line-strong'
            }`}
          >
            {s.name}{' '}
            <span className={full ? 'text-ok' : 'text-warn'}>
              {count}/{coverage.target}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Shown until every cloud has reached the target. Deliberately blocks the
// matrices rather than drawing them from uneven clouds: a plaza with two views
// and a plaza with eight are not being measured on equal terms, and a matrix
// that looks finished is the easiest way to forget that.
function NotYetComparable({ coverage, sites }) {
  const names = new Map(sites.map((s) => [s.id, s.name]))
  const missing = coverage.rows.filter((r) => r.count < coverage.target)
  return (
    <div className="mt-5 rounded-lg border border-line bg-surface p-6">
      <p className="text-sm text-ink">
        {coverage.complete} of {coverage.total} clouds are complete.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        The comparison waits until every plaza has {coverage.target} views. Clouds of different sizes
        are not measured on equal terms — Chamfer averages over each cloud, so a plaza with more
        views gives its neighbours more chances to find a close match — and a matrix drawn from
        uneven clouds would look finished while quietly meaning something else.
      </p>
      <p className="mt-4 font-mono text-xs text-ink-faint">
        still to place:{' '}
        {missing
          .map((r) => `${names.get(r.siteId) ?? r.siteId} (${coverage.target - r.count})`)
          .join(' · ')}
      </p>
    </div>
  )
}

function ComparisonFigures({ built, sites, measure, onSelect, windowRadius }) {
  const ids = built.siteIds
  const names = useMemo(() => {
    const byId = new Map(sites.map((s) => [s.id, s.name]))
    return ids.map((id) => byId.get(id) ?? id)
  }, [ids, sites])

  const clouds = useMemo(() => ids.map((id) => built.clouds.get(id).points), [ids, built])

  // All three matrices, always — the comparison between them is the point, so
  // computing only the selected one would mean recomputing the rest for every
  // figure below it.
  const matrices = useMemo(() => {
    const out = {}
    for (const id of MEASURE_IDS) out[id] = cloudDistanceMatrix(clouds, WEIGHTS, id)
    return out
  }, [clouds])

  // The same three, with all four metrics weighted equally. The robustness
  // check for the transfer assumption: if the ordering barely moves, the result
  // does not hinge on carrying P5's weights into the 120° layer.
  const unweighted = useMemo(
    () => cloudDistanceMatrix(clouds, [0.25, 0.25, 0.25, 0.25], measure),
    [clouds, measure]
  )

  const agreements = useMemo(
    () => ({
      centroidChamfer: rankAgreement(matrices.centroid, matrices.chamfer),
      centroidGaussian: rankAgreement(matrices.centroid, matrices.gaussian),
      gaussianChamfer: rankAgreement(matrices.gaussian, matrices.chamfer),
      weightRobustness: rankAgreement(matrices[measure], unweighted),
    }),
    [matrices, unweighted, measure]
  )

  // The single-point picture P5 works in, for the comparison that motivates the
  // whole phase: does treating a plaza as a set change which plazas it resembles?
  const canonicalOnly = useMemo(() => {
    const points = ids.map((id) => built.clouds.get(id).points[0])
    return cloudDistanceMatrix(points.map((p) => [p]), WEIGHTS, 'centroid')
  }, [ids, built])

  // The closest individual views anywhere in the corpus, across plazas. This is
  // the level the phase's claim actually lives at — a cloud distance is an
  // average over these.
  const globalMatches = useMemo(
    () =>
      globalNearestViews(
        ids.map((id) => ({ siteId: id, points: built.clouds.get(id).points })),
        WEIGHTS,
        { topN: 12 }
      ),
    [ids, built]
  )

  // Which two plazas the drill-down diagram is showing. Defaults to the closest
  // matching pair in the corpus, so the section opens on its own best example
  // rather than on an arbitrary pair.
  const [pair, setPair] = useState(null)
  const activePair = pair ?? [globalMatches[0]?.aSite, globalMatches[0]?.bSite]

  // The one matched view-pair shown as a side-by-side perspective render.
  // Opens on the corpus's closest pair, so the section leads with its own
  // strongest case rather than waiting to be asked.
  const [openMatch, setOpenMatch] = useState(null)
  const activeMatch = openMatch ?? globalMatches[0] ?? null

  const D = matrices[measure]

  return (
    <div className="mt-5 space-y-10">
      <Figure
        title={`${MEASURES[measure].label} distance between view clouds`}
        filename={`p7-cloud-distance-${measure}`}
        caption={MEASURES[measure].blurb}
        note="Darker is further apart. Distances are in the P5-weighted normalised space; the diagonal is a plaza against itself."
      >
        <DistanceMatrix D={D} names={names} ids={ids} onSelect={onSelect} />
      </Figure>

      <MeasureAgreement agreements={agreements} measure={measure} />

      <DisagreementTable
        centroid={matrices.centroid}
        chamfer={matrices.chamfer}
        names={names}
        ids={ids}
        onSelectPair={setPair}
      />

      <SinglePointGradient matrices={matrices} canonical={canonicalOnly} names={names} />

      <GlobalMatches
        matches={globalMatches}
        sites={sites}
        onSelectPair={setPair}
        onOpenMatch={setOpenMatch}
        selected={activePair}
        openMatch={activeMatch}
      />

      <MatchedViewPair built={built} sites={sites} match={activeMatch} />

      <MatchedViewDiagram
        built={built}
        sites={sites}
        pair={activePair}
        onSelectPair={setPair}
        onOpenMatch={setOpenMatch}
        windowRadius={windowRadius}
      />

      <Conclusion matrices={matrices} canonical={canonicalOnly} names={names} agreements={agreements} />
    </div>
  )
}

// The 18×18 heatmap. Cell shade is the distance; the scale is the matrix's own
// range, because the absolute numbers differ by measure and what a reader needs
// from this figure is which pairs are close relative to the rest.
function DistanceMatrix({ D, names, ids, onSelect }) {
  const n = D.length
  const flat = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) flat.push(D[i][j])
  const min = Math.min(...flat)
  const max = Math.max(...flat)

  // ~900-unit canvas, matching P5's figures — see the note on canvas size in
  // components/charts/tokens.js.
  const cell = 36
  // Sized to the longest plaza name ("Konstablerwache", 15 characters) at the
  // matrix label font, plus a small margin — not a flat guess. A generous flat
  // pad here leaves an empty square in the corner where the row and column
  // label margins cross with nothing drawn in it; the grid should fill its box
  // rather than sit pushed into a corner of it.
  const longestName = Math.max(...names.map((n) => n.length))
  const pad = Math.round(longestName * TYPE.matrixLabel.fontSize * 0.6 + 40)
  const legendH = 46
  const grid = n * cell
  const W = pad + grid + 10
  const H = pad + grid + legendH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Distance matrix">
      {names.map((name, i) => (
        <text
          key={`r${i}`}
          x={pad - 6}
          y={pad + i * cell + cell / 2 + 3}
          textAnchor="end"
          fontSize={TYPE.matrixLabel.fontSize}
          fill={TYPE.matrixLabel.fill}
          fontFamily={TYPE.matrixLabel.fontFamily}
        >
          {name}
        </text>
      ))}
      {names.map((name, j) => {
        const x = pad + j * cell + cell / 2
        return (
          <text
            key={`c${j}`}
            x={x}
            y={pad - 7}
            textAnchor="start"
            fontSize={TYPE.matrixLabel.fontSize}
            fill={TYPE.matrixLabel.fill}
            fontFamily={TYPE.matrixLabel.fontFamily}
            transform={`rotate(-90 ${x} ${pad - 7})`}
          >
            {name}
          </text>
        )
      })}
      {D.map((row, i) =>
        row.map((v, j) => (
          <rect
            key={`${i}-${j}`}
            x={pad + j * cell}
            y={pad + i * cell}
            width={cell - 1}
            height={cell - 1}
            fill={i === j ? '#EAE6DB' : rampColour((v - min) / (max - min || 1))}
            onClick={() => onSelect?.(ids[i])}
            style={{ cursor: 'pointer' }}
          >
            <title>
              {names[i]} ↔ {names[j]}: {v.toFixed(3)}
            </title>
          </rect>
        ))
      )}

      {/* A real legend rather than two numbers in the corners: the ramp is what
          the reader has to decode, so it is drawn. */}
      <g>
        {RAMP.map((c, i) => (
          <rect key={c} x={pad + i * 26} y={pad + grid + 16} width={26} height={10} fill={c} />
        ))}
        <text
          x={pad}
          y={pad + grid + 40}
          fontSize={TYPE.tick.fontSize}
          fill={TYPE.tick.fill}
          fontFamily={TYPE.tick.fontFamily}
        >
          {min.toFixed(3)}
        </text>
        <text
          x={pad + RAMP.length * 26}
          y={pad + grid + 40}
          textAnchor="end"
          fontSize={TYPE.tick.fontSize}
          fill={TYPE.tick.fill}
          fontFamily={TYPE.tick.fontFamily}
        >
          {max.toFixed(3)}
        </text>
        <text
          x={pad + RAMP.length * 26 + 18}
          y={pad + grid + 25}
          fontSize={TYPE.axisTitle.fontSize}
          fontWeight={TYPE.axisTitle.fontWeight}
          fill={TYPE.axisTitle.fill}
          fontFamily={TYPE.axisTitle.fontFamily}
        >
          Weighted cloud distance
        </text>
      </g>
    </svg>
  )
}

function rampColour(t) {
  const c = Math.max(0, Math.min(1, t))
  return RAMP[Math.min(RAMP.length - 1, Math.floor(c * (RAMP.length - 1)))]
}

// The headline number of the phase: how far the three measures agree on which
// plaza pairs are most alike. Spearman on the 153 off-diagonal pairs — a value
// well below 1 means the choice of measure is a real decision, not a detail.
function MeasureAgreement({ agreements, measure }) {
  const rows = [
    { label: 'Centroid vs Chamfer', value: agreements.centroidChamfer },
    { label: 'Centroid vs Gaussian', value: agreements.centroidGaussian },
    { label: 'Gaussian vs Chamfer', value: agreements.gaussianChamfer },
  ]
  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">Do the three measures agree?</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Spearman rank correlation over all pairs of plazas. This asks whether the measures put the
        pairs in the same order, not whether their numbers match — they are on different scales and
        never will.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-md border border-line bg-surface px-3 py-2.5">
            <dt className="text-xs text-ink-muted">{r.label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-ink">
              ρ&nbsp;{r.value.toFixed(3)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-ink-muted">
        <span className="font-medium text-ink">Robustness.</span> Weighting all four metrics equally
        instead of by the fitted P5 weights leaves the {MEASURES[measure].label.toLowerCase()}{' '}
        ordering at ρ {agreements.weightRobustness.toFixed(3)} against the weighted one — the
        evidence for how much the transfer assumption is doing.
      </p>
    </div>
  )
}

// Where centroid and Chamfer disagree most, named plaza by plaza.
//
// The aggregate ρ says the measures differ; this says where, which is the part
// that can be looked at in the model and argued about. A pair that centroid
// ranks as very close and Chamfer ranks as distant is the real-world version of
// the constructed gate case in test/clouds.test.js.
function DisagreementTable({ centroid, chamfer, names, ids, onSelectPair }) {
  const rows = useMemo(() => {
    const pairs = []
    for (let i = 0; i < centroid.length; i++) {
      for (let j = i + 1; j < centroid.length; j++) {
        pairs.push({ i, j, c: centroid[i][j], k: chamfer[i][j] })
      }
    }
    const rank = (key) => {
      const order = [...pairs].sort((a, b) => a[key] - b[key])
      const r = new Map()
      order.forEach((p, idx) => r.set(`${p.i}-${p.j}`, idx + 1))
      return r
    }
    const rc = rank('c')
    const rk = rank('k')
    return pairs
      .map((p) => {
        const key = `${p.i}-${p.j}`
        return { ...p, rankCentroid: rc.get(key), rankChamfer: rk.get(key) }
      })
      .sort(
        (a, b) =>
          Math.abs(b.rankCentroid - b.rankChamfer) - Math.abs(a.rankCentroid - a.rankChamfer)
      )
      .slice(0, 8)
  }, [centroid, chamfer])

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">Where the measures disagree most</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        The eight plaza pairs whose similarity rank moves furthest between the centroid and Chamfer.
        A pair ranked close on centroid and distant on Chamfer is one where the two clouds happen to
        average out alike while containing no similar views — the case the phase gate constructs.
        Click a row to see which individual views actually match.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-semibold">Pair</th>
              <th className="py-2 pr-3 text-right font-semibold">Centroid rank</th>
              <th className="py-2 pr-3 text-right font-semibold">Chamfer rank</th>
              <th className="py-2 pr-3 text-right font-semibold">Shift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.i}-${r.j}`}
                onClick={() => onSelectPair?.([ids[r.i], ids[r.j]])}
                className="cursor-pointer border-b border-line transition-colors hover:bg-primary-wash/40"
              >
                <td className="py-2 pr-3 text-ink">
                  {names[r.i]} ↔ {names[r.j]}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                  {r.rankCentroid}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                  {r.rankChamfer}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-primary">
                  {r.rankChamfer > r.rankCentroid ? '+' : '−'}
                  {Math.abs(r.rankChamfer - r.rankCentroid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cloud distance against the single-point distance P5 works in — the figure
// that says whether this phase was worth doing. Each dot is a plaza pair; if
// they fell on a line, one canonical reading would have been enough.
// Does richer aggregation change the answer P5 already gave — and by how much?
//
// The earlier version of this figure plotted only the currently selected
// measure against the canonical single-point distance, with a Spearman ρ in
// the caption. That answers "is Chamfer different from one point" but not the
// more useful question: HOW MUCH information does each step of aggregation
// recover, moving from a single reading (P5) through an averaged cloud
// (centroid), a distribution (Gaussian), to individual view matching (Chamfer)?
// Plotting all three side by side, on the same axes, turns "you can see it's
// messy" into a citable progression.
//
// STATISTICAL CAVEAT, stated once here rather than in three places: the 153
// points in each panel are pairwise distances among 18 plazas, so they are NOT
// independent observations — every plaza's distances appear in 17 of the 153
// pairs. That violates the assumption behind a textbook p-value for r, so none
// is reported. r, R² and ρ are given as descriptive effect sizes — "how strong
// does the relationship look" — not as a significance test. A rigorous test of
// whether two distance matrices correlate more than chance would use a Mantel
// permutation test (shuffling plaza labels, not pairs, and comparing to that
// null); that is future work, and is named here rather than quietly skipped.
// One measure's relationship to the canonical single-point distance: r, R², ρ,
// the OLS fit, and each pair's residual from it.
//
// Pulled out of SinglePointGradient so the Conclusion section below can quote
// the SAME numbers the chart draws, computed once — the project's standing
// rule that a figure and a reported number must never be able to disagree.
function buildGradientPanels(matrices, canonical, names) {
  return MEASURE_IDS.map((id) => {
    const points = []
    for (let i = 0; i < canonical.length; i++) {
      for (let j = i + 1; j < canonical.length; j++) {
        points.push({
          i,
          j,
          x: canonical[i][j],
          y: matrices[id][i][j],
          label: `${names[i]} ↔ ${names[j]}`,
        })
      }
    }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const r = pearson(xs, ys)
    const rho = spearman(xs, ys)
    const fit = linearFit(xs, ys)
    const withResidual = points.map((p) => ({
      ...p,
      residual: p.y - (fit.slope * p.x + fit.intercept),
    }))
    return { id, points: withResidual, r, r2: r * r, rho, fit }
  })
}

function SinglePointGradient({ matrices, canonical, names }) {
  const panels = useMemo(
    () => buildGradientPanels(matrices, canonical, names),
    [matrices, canonical, names]
  )

  // The outlier table is keyed on CHAMFER's residuals — the richest measure,
  // and the one the rest of the page treats as headline — but shows what all
  // three measures made of the same pair, so the reader sees the gradient
  // exactly where it is largest.
  const chamferPanel = panels.find((p) => p.id === 'chamfer')
  const outliers = useMemo(() => {
    if (!chamferPanel) return []
    const byId = new Map(panels.map((p) => [p.id, new Map(p.points.map((pt) => [`${pt.i}-${pt.j}`, pt]))]))
    return [...chamferPanel.points]
      .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
      .slice(0, 6)
      .map((pt) => ({
        label: pt.label,
        canonical: pt.x,
        centroid: byId.get('centroid')?.get(`${pt.i}-${pt.j}`)?.y,
        gaussian: byId.get('gaussian')?.get(`${pt.i}-${pt.j}`)?.y,
        chamfer: pt.y,
        chamferResidual: pt.residual,
      }))
  }, [panels, chamferPanel])

  return (
    <div className="space-y-6">
      <Figure
        title="How much does richer aggregation change the answer?"
        filename="p7-cloud-vs-canonical-gradient"
        caption="Each dot is one of the 153 plaza pairs: canonical single-point distance (horizontal) against cloud distance (vertical), for all three measures on the same axes."
        note="r and R² are descriptive effect sizes, not significance tests — the 153 pairs share plazas and are not independent observations (each plaza appears in 17 of them). ρ is Spearman rank correlation, which does not assume the relationship is a straight line."
      >
        <svg
          viewBox={`0 0 ${CANVAS_W} 360`}
          className="w-full"
          role="img"
          aria-label="Cloud distance against canonical distance, for all three measures"
        >
          {panels.map((panel, idx) => (
            <GradientPanel key={panel.id} panel={panel} x0={idx * (CANVAS_W / 3)} width={CANVAS_W / 3} />
          ))}
        </svg>
      </Figure>

      <div className="rounded-lg border border-line bg-paper p-5">
        <h3 className="text-sm font-semibold text-ink">The gradient, as numbers</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Agreement with the single-point distance as aggregation gets richer. A falling R² across
          the row means each step recovers information the previous one discarded — the case for
          having built this phase at all; a flat row would mean the extra views changed nothing.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="py-2 pr-3 font-semibold">Measure</th>
                <th className="py-2 pr-3 text-right font-semibold">Pearson r</th>
                <th className="py-2 pr-3 text-right font-semibold">R²</th>
                <th className="py-2 pr-3 text-right font-semibold">Spearman ρ</th>
              </tr>
            </thead>
            <tbody>
              {panels.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2 pr-3 text-ink">{MEASURES[p.id].label}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {p.r.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {p.r2.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {p.rho.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* What the three columns actually mean, kept beside the table rather
            than in the methods disclosure at the bottom — a reader hits these
            symbols here first, and a footnote nobody has scrolled to yet
            explains nothing. */}
        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-xs text-ink-muted sm:grid-cols-3">
          <div>
            <dt className="font-mono text-ink">r — Pearson correlation</dt>
            <dd className="mt-0.5">
              −1 to +1. How tightly the dots hug a straight line — NOT how steep that line is. r = 1
              means every dot sits exactly on the line; r = 0 means no straight-line pattern at all.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-ink">R² — r, squared</dt>
            <dd className="mt-0.5">
              The more useful number: the share of variation in the cloud distance that the
              single-point distance predicts. R² = 0.32 reads as "32% explained, 68% left over" —
              the 68% is what the extra views are contributing.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-ink">ρ (rho) — Spearman correlation</dt>
            <dd className="mt-0.5">
              Same −1 to +1 scale as r, but on RANK order rather than raw values: does the pair with
              the biggest single-point distance also tend to have the biggest cloud distance. Not a
              p-value — no significance test is reported here; see the note above the figure.
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-line bg-paper p-5">
        <h3 className="text-sm font-semibold text-ink">Where the gradient is largest</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          The six plaza pairs whose Chamfer distance deviates furthest from what their canonical
          distance would predict (largest residual from the trend line above). These are the
          specific cases where treating a plaza as a set of views, rather than one point, changes
          the answer the most — named rather than left as "the scatter looks messy".
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="py-2 pr-3 font-semibold">Pair</th>
                <th className="py-2 pr-3 text-right font-semibold">Canonical</th>
                <th className="py-2 pr-3 text-right font-semibold">Centroid</th>
                <th className="py-2 pr-3 text-right font-semibold">Gaussian</th>
                <th className="py-2 pr-3 text-right font-semibold">Chamfer</th>
                <th className="py-2 pr-3 text-right font-semibold">Residual</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map((row) => (
                <tr key={row.label} className="border-b border-line">
                  <td className="py-2 pr-3 text-ink">{row.label}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.canonical.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.centroid?.toFixed(3) ?? '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.gaussian?.toFixed(3) ?? '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                    {row.chamfer.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-primary">
                    {row.chamferResidual >= 0 ? '+' : '−'}
                    {Math.abs(row.chamferResidual).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// One measure's scatter: canonical distance against this measure's cloud
// distance, with its OLS trend line, inside a fixed-width slot of the shared
// three-panel canvas.
function GradientPanel({ panel, x0, width }) {
  const pad = { top: 34, right: 16, bottom: 46, left: 46 }
  const plotW = width - pad.left - pad.right
  const plotH = 360 - pad.top - pad.bottom

  const maxX = Math.max(...panel.points.map((p) => p.x))
  const maxY = Math.max(...panel.points.map((p) => p.y))
  const sx = (v) => x0 + pad.left + (v / maxX) * plotW
  const sy = (v) => pad.top + plotH - (v / maxY) * plotH

  const xTicks = niceTicks(maxX, 4)
  const yTicks = niceTicks(maxY, 4)
  const fitY0 = panel.fit.intercept
  const fitY1 = panel.fit.slope * maxX + panel.fit.intercept

  return (
    <g>
      <text
        x={x0 + width / 2}
        y={16}
        textAnchor="middle"
        fontSize={TYPE.panelTitle.fontSize}
        fontWeight={TYPE.panelTitle.fontWeight}
        fill={TYPE.panelTitle.fill}
        fontFamily={TYPE.panelTitle.fontFamily}
      >
        {MEASURES[panel.id].label}
      </text>
      <text
        x={x0 + width / 2}
        y={29}
        textAnchor="middle"
        fontSize={TYPE.annotation.fontSize}
        fill={TYPE.annotation.fill}
        fontFamily={MONO}
      >
        r {panel.r.toFixed(2)} · r² {panel.r2.toFixed(2)} · ρ {panel.rho.toFixed(2)}
      </text>

      {xTicks.map((t) => (
        <line
          key={`gx${t}`}
          x1={sx(t)}
          y1={pad.top}
          x2={sx(t)}
          y2={pad.top + plotH}
          stroke={GRID}
          strokeWidth={0.7}
        />
      ))}
      {yTicks.map((t) => (
        <line
          key={`gy${t}`}
          x1={x0 + pad.left}
          y1={sy(t)}
          x2={x0 + pad.left + plotW}
          y2={sy(t)}
          stroke={GRID}
          strokeWidth={0.7}
        />
      ))}

      <line
        x1={x0 + pad.left}
        y1={pad.top + plotH}
        x2={x0 + pad.left + plotW}
        y2={pad.top + plotH}
        stroke={RULE}
        strokeWidth={0.9}
      />
      <line
        x1={x0 + pad.left}
        y1={pad.top}
        x2={x0 + pad.left}
        y2={pad.top + plotH}
        stroke={RULE}
        strokeWidth={0.9}
      />

      {xTicks.map((t) => (
        <text
          key={`tx${t}`}
          x={sx(t)}
          y={pad.top + plotH + 14}
          textAnchor="middle"
          fontSize={TYPE.tick.fontSize}
          fill={TYPE.tick.fill}
          fontFamily={TYPE.tick.fontFamily}
        >
          {t.toFixed(2)}
        </text>
      ))}
      {yTicks.map((t) => (
        <text
          key={`ty${t}`}
          x={x0 + pad.left - 6}
          y={sy(t) + 3}
          textAnchor="end"
          fontSize={TYPE.tick.fontSize}
          fill={TYPE.tick.fill}
          fontFamily={TYPE.tick.fontFamily}
        >
          {t.toFixed(2)}
        </text>
      ))}

      {/* OLS trend line, so "on a rising line" is something drawn rather than
          only claimed. */}
      <line
        x1={sx(0)}
        y1={sy(Math.max(0, fitY0))}
        x2={sx(maxX)}
        y2={sy(fitY1)}
        stroke={COOL}
        strokeWidth={1.1}
        strokeDasharray="4 3"
        opacity={0.75}
      />

      {panel.points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={ACCENT} opacity={0.6}>
          <title>
            {p.label}: canonical {p.x.toFixed(3)}, {MEASURES[panel.id].label.toLowerCase()}{' '}
            {p.y.toFixed(3)}
          </title>
        </circle>
      ))}

      <text
        x={x0 + width / 2}
        y={360 - 6}
        textAnchor="middle"
        fontSize={TYPE.tick.fontSize}
        fill={TYPE.tick.fill}
        fontFamily={TYPE.tick.fontFamily}
      >
        canonical distance →
      </text>
    </g>
  )
}

// Round tick positions — 1, 2 or 5 times a power of ten — so the numbers along
// an axis read as ones a person would have chosen. Same rule as P5's niceStep.
function niceTicks(max, target = 5) {
  if (!(max > 0)) return [0]
  const raw = max / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const out = []
  for (let t = 0; t <= max + step * 0.001; t += step) out.push(t)
  return out
}

// The two matched views, rendered as they would be seen.
//
// Everything above this on the page argues in numbers. This is where the reader
// gets to check the argument with their eyes: two 120° views the model calls
// nearly identical, side by side, from the same building geometry the metrics
// were measured on.
//
// It is the most falsifiable thing on the page, deliberately. If the model's
// closest pair in the whole corpus looks like two obviously different places,
// that is a finding about the model — and far better discovered here than after
// a hundred participants have judged the same pairs in P8.
function MatchedViewPair({ built, sites, match }) {
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites])

  const siteA = match ? byId.get(match.aSite) : null
  const siteB = match ? byId.get(match.bSite) : null
  const geometryA = useMemo(() => safeProject(siteA), [siteA])
  const geometryB = useMemo(() => safeProject(siteB), [siteB])

  if (!match || !siteA || !siteB || !geometryA || !geometryB) return null

  const markerA = built.clouds.get(match.aSite)?.markers[match.aIndex]
  const markerB = built.clouds.get(match.bSite)?.markers[match.bIndex]
  if (!markerA || !markerB) return null

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">What the matched views actually look like</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        The same 120° field the metrics were measured across, from the same building masses — no
        textures or invented detail, because a prettier render would show something the isovist
        never measured. Click any row above, or any line in the diagram below, to change the pair.
      </p>

      <Suspense
        fallback={
          <p className="mt-4 font-mono text-xs text-ink-faint">Preparing the 3D views…</p>
        }
      >
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ViewPanel
          site={siteA}
          geometry={geometryA}
          marker={markerA}
          index={match.aIndex}
        />
        <ViewPanel
          site={siteB}
          geometry={geometryB}
          marker={markerB}
          index={match.bIndex}
        />
      </div>
      </Suspense>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3 font-mono text-xs text-ink-faint">
        <Stat label="weighted distance" value={match.distance.toFixed(3)} />
        <Stat label="field of view" value={`${CLOUD_FOV_DEG}° to ${CLOUD_RANGE_M} m`} />
        <Stat label="eye height" value="1.6 m" />
      </dl>
    </div>
  )
}

// One rendered view with its own metric readout, so the numbers that made the
// match sit under the picture that has to justify them.
function ViewPanel({ site, geometry, marker, index }) {
  return (
    <figure>
      <ViewRender
        geometry={geometry}
        vantage={{ x: marker.local_x, y: marker.local_y }}
        headingDeg={marker.direction_deg}
        fovDeg={CLOUD_FOV_DEG}
        className="aspect-[16/10] w-full"
        label={`view ${index + 1} · ${Math.round(marker.direction_deg)}°`}
      />
      <figcaption className="mt-2">
        <p className="text-sm font-medium text-ink">{site.name}</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-ink-faint">
          <div className="flex justify-between">
            <dt>area</dt>
            <dd className="tabular-nums text-ink-muted">
              {Math.round(marker.area_m2).toLocaleString()} m²
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>compactness</dt>
            <dd className="tabular-nums text-ink-muted">{marker.compactness.toFixed(3)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>occlusivity</dt>
            <dd className="tabular-nums text-ink-muted">{Math.round(marker.occlusivity_m)} m</dd>
          </div>
          <div className="flex justify-between">
            <dt>enclosure</dt>
            <dd className="tabular-nums text-ink-muted">{marker.enclosure_ratio.toFixed(3)}</dd>
          </div>
        </dl>
      </figcaption>
    </figure>
  )
}

// The closest individual views anywhere in the corpus.
//
// Every other figure on this page compares plazas. This one compares VIEWS, and
// it is the level at which the phase's claim is actually interesting: not
// "Alexanderplatz resembles Marienplatz" but "standing here in Alexanderplatz
// looking this way gives you almost exactly what standing there in Marienplatz
// looking that way gives you" — two specific places, which can be visited,
// argued with, and shown to a participant in P8.
function GlobalMatches({ matches, sites, onSelectPair, onOpenMatch, selected, openMatch }) {
  const names = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites])

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">The most similar views in the corpus</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Individual views, not whole plazas — the closest pairs anywhere across the eighteen squares,
        in the P5-weighted space. Same-plaza pairs are excluded: two views of one square being alike
        is not a finding. Click a row to see the pair on plan.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-semibold">#</th>
              <th className="py-2 pr-3 font-semibold">View</th>
              <th className="py-2 pr-3 font-semibold">matches</th>
              <th className="py-2 pr-3 text-right font-semibold">Distance</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => {
              const isOpen =
                openMatch &&
                openMatch.aSite === m.aSite &&
                openMatch.bSite === m.bSite &&
                openMatch.aIndex === m.aIndex &&
                openMatch.bIndex === m.bIndex
              const isSelected =
                selected &&
                ((selected[0] === m.aSite && selected[1] === m.bSite) ||
                  (selected[0] === m.bSite && selected[1] === m.aSite))
              return (
                <tr
                  key={`${m.aSite}-${m.aIndex}-${m.bSite}-${m.bIndex}`}
                  onClick={() => {
                    onSelectPair?.([m.aSite, m.bSite])
                    onOpenMatch?.(m)
                  }}
                  className={`cursor-pointer border-b border-line transition-colors hover:bg-primary-wash/40 ${
                    isOpen ? 'bg-primary-wash/70' : isSelected ? 'bg-primary-wash/40' : ''
                  }`}
                >
                  <td className="py-2 pr-3 font-mono text-xs text-ink-faint">{i + 1}</td>
                  <td className="py-2 pr-3 text-ink">
                    {names.get(m.aSite) ?? m.aSite}{' '}
                    <span className="font-mono text-xs text-ink-faint">
                      view {m.aIndex + 1}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-ink">
                    {names.get(m.bSite) ?? m.bSite}{' '}
                    <span className="font-mono text-xs text-ink-faint">
                      view {m.bIndex + 1}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-primary">
                    {m.distance.toFixed(3)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Two plazas side by side, with every view in the left one joined to its closest
// counterpart in the right.
//
// This is the drawing the phase exists to produce. A number saying two plazas
// are 0.31 apart is not an argument; a line running from a specific corner of
// one square to a specific edge of another, with both plans drawn to their own
// scale beneath it, is something a reader can check against their own knowledge
// of the places.
//
// Lines run LEFT TO RIGHT ONLY — for each view on the left, its nearest match on
// the right. Nearest-neighbour is not symmetric, so the reverse direction is a
// different set of pairs; drawing both at once produces a cat's cradle nobody
// can read. Swapping the two dropdowns shows the other direction.
function MatchedViewDiagram({ built, sites, pair, onSelectPair, onOpenMatch, windowRadius }) {
  const [aId, bId] = pair ?? []
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites])
  const siteA = byId.get(aId)
  const siteB = byId.get(bId)

  const geometryA = useMemo(() => safeProject(siteA), [siteA])
  const geometryB = useMemo(() => safeProject(siteB), [siteB])

  const cloudA = aId ? built.clouds.get(aId) : null
  const cloudB = bId ? built.clouds.get(bId) : null

  const matches = useMemo(() => {
    if (!cloudA || !cloudB) return []
    return matchViews(cloudA.points, cloudB.points, WEIGHTS)
  }, [cloudA, cloudB])

  if (!siteA || !siteB || !geometryA || !geometryB || !cloudA || !cloudB) return null

  // Two square panels side by side in one canvas, so the join lines can be drawn
  // in a single coordinate system.
  //
  // Each panel is CLIPPED to its own frame. Without that, a plaza's surrounding
  // blocks — which extend well past the boundary the window is sized on — spill
  // straight across the gutter and over the neighbouring plan, which is what
  // made the first version unreadable. The clip is what makes these two
  // drawings rather than one overlapping mess.
  //
  // Both panels use the corpus window radius, so the two plazas are at the same
  // metres-per-pixel as each other AND as every other map in the platform.
  const PANEL = 380
  const GUTTER = 118
  const TITLE_H = 30
  const W = PANEL * 2 + GUTTER
  const H = TITLE_H + PANEL + 30

  const panelA = makePanel(geometryA, 0, TITLE_H, PANEL, windowRadius)
  const panelB = makePanel(geometryB, PANEL + GUTTER, TITLE_H, PANEL, windowRadius)

  const closest = matches.reduce((best, m) => (best && best.distance <= m.distance ? best : m), null)
  const furthest = matches.reduce(
    (worst, m) => (worst && worst.distance >= m.distance ? worst : m),
    null
  )
  const span = (furthest?.distance ?? 1) - (closest?.distance ?? 0) || 1

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Which view matches which</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Each view in the left plaza joined to its closest counterpart in the right, in the
            weighted space. The darker the line, the closer the match — this is what Chamfer
            averages over to produce one number. Click a line to render both of its views.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-xs"
            aria-label="Left plaza"
            value={aId}
            onChange={(e) => onSelectPair([e.target.value, bId])}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="font-mono text-xs text-ink-faint">→</span>
          <select
            className="input text-xs"
            aria-label="Right plaza"
            value={bId}
            onChange={(e) => onSelectPair([aId, e.target.value])}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Figure
        title={`${siteA.name} → ${siteB.name}: matched views`}
        filename={`p7-matched-views-${aId}-${bId}`}
        caption={`Each of ${siteA.name}'s ${cloudA.markers.length} views joined to its nearest counterpart in ${siteB.name}. Both plans at the corpus scale used throughout the platform.`}
        note={
          closest && furthest
            ? `Closest match: view ${closest.aIndex + 1} → view ${closest.bIndex + 1} at ${closest.distance.toFixed(3)}. Weakest: view ${furthest.aIndex + 1} → view ${furthest.bIndex + 1} at ${furthest.distance.toFixed(3)}.`
            : undefined
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Matched views between ${siteA.name} and ${siteB.name}`}
        >
          <defs>
            <clipPath id="p7-panel-a">
              <rect x={panelA.x0} y={panelA.y0} width={PANEL} height={PANEL} />
            </clipPath>
            <clipPath id="p7-panel-b">
              <rect x={panelB.x0} y={panelB.y0} width={PANEL} height={PANEL} />
            </clipPath>
          </defs>

          <PlanPanel
            geometry={geometryA}
            panel={panelA}
            markers={cloudA.markers}
            label={siteA.name}
            clip="p7-panel-a"
            size={PANEL}
          />
          <PlanPanel
            geometry={geometryB}
            panel={panelB}
            markers={cloudB.markers}
            label={siteB.name}
            clip="p7-panel-b"
            size={PANEL}
          />

          {/* Join lines last, so they sit over both plans. Deliberately NOT
              clipped — the line crossing the gutter is the whole point. */}
          {matches.map((m) => {
            const a = cloudA.markers[m.aIndex]
            const b = cloudB.markers[m.bIndex]
            if (!a || !b) return null
            const p = panelA.toScreen(a.local_x, a.local_y)
            const q = panelB.toScreen(b.local_x, b.local_y)
            const strength = 1 - (m.distance - (closest?.distance ?? 0)) / span
            const isClosest = m === closest
            return (
              <line
                key={m.aIndex}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke={isClosest ? ACCENT : COOL}
                strokeWidth={isClosest ? 1.8 : 0.9}
                opacity={isClosest ? 0.95 : 0.16 + strength * 0.44}
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  onOpenMatch?.({
                    aSite: aId,
                    aIndex: m.aIndex,
                    bSite: bId,
                    bIndex: m.bIndex,
                    distance: m.distance,
                  })
                }
              >
                <title>
                  view {m.aIndex + 1} → view {m.bIndex + 1}: {m.distance.toFixed(3)} — click to
                  render both views
                </title>
              </line>
            )
          })}

          {/* Scale bar — the drawings are at a real scale, so it can be stated
              rather than merely claimed in a caption. */}
          <ScaleBar panel={panelA} y={TITLE_H + PANEL + 20} metres={50} />

          {/* Swatches, not a sentence. A legend is a key to the marks, so it
              should show the marks; spelling out "orange = …" in prose puts a
              line of body text into a drawing, where it reads as loud as the
              title. */}
          <LineKey
            x={W}
            y={TITLE_H + PANEL + 20}
            items={[
              { colour: ACCENT, width: 1.8, label: 'closest match' },
              { colour: COOL, width: 0.9, label: 'other views' },
            ]}
          />
        </svg>
      </Figure>
    </div>
  )
}

// One plaza's plan inside its own clipped, framed panel: footprints, boundary,
// and its numbered views, with the plaza named above it.
function PlanPanel({ geometry, panel, markers, label, clip, size }) {
  // Marks are sized in screen units here, not in map metres as in the editor,
  // because both panels share one canvas and one scale.
  const project = (p) => {
    const s = panel.toScreen(p.x, p.y)
    return `${s.x},${s.y}`
  }

  return (
    <g>
      <text
        x={panel.x0 + size / 2}
        y={panel.y0 - 9}
        textAnchor="middle"
        fontSize={TYPE.panelTitle.fontSize}
        fontWeight={TYPE.panelTitle.fontWeight}
        fill={TYPE.panelTitle.fill}
        fontFamily={TYPE.panelTitle.fontFamily}
      >
        {label}
      </text>

      <rect
        x={panel.x0}
        y={panel.y0}
        width={size}
        height={size}
        fill={PAPER}
        stroke={RULE}
        strokeWidth={0.8}
      />

      <g clipPath={`url(#${clip})`}>
        {geometry.buildings.map((b, i) => (
          <polygon
            key={i}
            points={b.footprint.map(project).join(' ')}
            fill="#EAE6DB"
            stroke={RULE}
            strokeWidth={0.7}
          />
        ))}
        {geometry.boundary && (
          <polygon
            points={geometry.boundary.map(project).join(' ')}
            fill="none"
            stroke={NEG}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
        )}
        {markers.map((m, i) => {
          const s = panel.toScreen(m.local_x, m.local_y)
          const rad = (m.direction_deg * Math.PI) / 180
          return (
            <g key={m.id ?? i}>
              {/* Heading tick, so the drawing shows where each view faces. */}
              <line
                x1={s.x}
                y1={s.y}
                x2={s.x + Math.sin(rad) * 11}
                y2={s.y - Math.cos(rad) * 11}
                stroke={INK}
                strokeWidth={0.9}
                opacity={0.55}
              />
              <circle cx={s.x} cy={s.y} r={3.2} fill={ACCENT} stroke={PAPER} strokeWidth={1} />
              <text x={s.x + 5} y={s.y - 4.2} fontSize={9} fill={MUTED} fontFamily={MONO}>
                {i + 1}
              </text>
            </g>
          )
        })}
      </g>
    </g>
  )
}

// A right-aligned key of line samples. Laid out from the right edge inward so
// it never collides with the scale bar on the left, whatever the labels say.
function LineKey({ x, y, items }) {
  const SAMPLE = 16
  const GAP = 6
  const ITEM_GAP = 16
  // Rough advance width for the label font — enough to lay the key out without
  // measuring text, which SVG cannot do before paint.
  const width = (label) => SAMPLE + GAP + label.length * 4.9

  let cursor = x
  const placed = []
  for (let i = items.length - 1; i >= 0; i--) {
    cursor -= width(items[i].label)
    placed.unshift({ ...items[i], x: cursor })
    cursor -= ITEM_GAP
  }

  return (
    <g>
      {placed.map((item) => (
        <g key={item.label}>
          <line
            x1={item.x}
            y1={y - 3}
            x2={item.x + SAMPLE}
            y2={y - 3}
            stroke={item.colour}
            strokeWidth={item.width}
          />
          <text
            x={item.x + SAMPLE + GAP}
            y={y}
            fontSize={TYPE.annotation.fontSize}
            fill={TYPE.annotation.fill}
            fontFamily={TYPE.annotation.fontFamily}
          >
            {item.label}
          </text>
        </g>
      ))}
    </g>
  )
}

// A bar of known length in map metres, so the shared scale is stated on the
// drawing rather than only asserted in its caption.
function ScaleBar({ panel, y, metres }) {
  const length = metres * panel.scale
  const tick = (x) => (
    <line x1={x} y1={y - 3.5} x2={x} y2={y + 3.5} stroke={MUTED} strokeWidth={1.1} />
  )
  return (
    <g>
      <line x1={panel.x0 + 2} y1={y} x2={panel.x0 + 2 + length} y2={y} stroke={MUTED} strokeWidth={1} />
      {tick(panel.x0 + 2)}
      {tick(panel.x0 + 2 + length)}
      <text
        x={panel.x0 + 6 + length}
        y={y + 3}
        fontSize={TYPE.annotation.fontSize}
        fill={TYPE.annotation.fill}
        fontFamily={TYPE.annotation.fontFamily}
      >
        {metres} m
      </text>
    </g>
  )
}

// Maps one plaza's local metres into a panel of the shared canvas, north up.
//
// Both panels are given the SAME window radius, so the two plazas are drawn at
// one scale and a building of a given size looks the same size in either —
// which is the only way a reader can compare them honestly.
function makePanel(geometry, x0, y0, size, windowRadius) {
  const scale = size / (2 * windowRadius)
  const { x: cx, y: cy } = geometry.centroid
  return {
    x0,
    y0,
    size,
    scale,
    toScreen(px, py) {
      return {
        x: x0 + size / 2 + (px - cx) * scale,
        // Screen y grows downward; negating keeps north at the top.
        y: y0 + size / 2 - (py - cy) * scale,
      }
    },
  }
}

function safeProject(site) {
  if (!site) return null
  try {
    return projectSite(site)
  } catch {
    return null
  }
}

function round(value, dp) {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

// The phase's argument, stated in one place rather than left for a reader to
// assemble from eleven figures.
//
// Every number quoted here comes from buildGradientPanels and `agreements` —
// the SAME computation the charts above draw from, not a second pass with its
// own arithmetic. If a figure and this section ever disagreed, the figure
// would be right and this section wrong; keeping them on one function is what
// makes that impossible rather than merely unlikely.
function Conclusion({ matrices, canonical, names, agreements }) {
  const panels = useMemo(() => buildGradientPanels(matrices, canonical, names), [matrices, canonical, names])
  const minR2 = Math.min(...panels.map((p) => p.r2))
  const maxR2 = Math.max(...panels.map((p) => p.r2))

  return (
    <div className="rounded-lg border-2 border-ink bg-paper p-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Conclusion</p>
      <h3 className="mt-2 text-lg font-semibold text-ink">
        What the view-cloud comparison actually shows
      </h3>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">
        <p>
          <span className="font-medium text-ink">1. The single canonical reading P5 used was
          incomplete.</span> All three cloud measures disagree substantially with the old
          one-point-per-plaza comparison: R² against it ranges {minR2.toFixed(2)}–{maxR2.toFixed(2)}
          across the three measures, meaning{' '}
          <strong className="text-ink">
            {Math.round((1 - maxR2) * 100)}–{Math.round((1 - minR2) * 100)}% of the variation
          </strong>{' '}
          in how similar two plazas look is invisible if only one point per plaza is measured.
          Standing in a different corner of a plaza changes how it compares to the rest of the
          corpus — which is the thing this whole phase set out to check.
        </p>

        <p>
          <span className="font-medium text-ink">2. The three cloud measures mostly agree with
          each other, but not completely.</span> Centroid, Gaussian and Chamfer rank the 153 plaza
          pairs similarly — ρ {agreements.centroidGaussian.toFixed(2)} (centroid↔gaussian), ρ{' '}
          {agreements.gaussianChamfer.toFixed(2)} (gaussian↔chamfer), ρ{' '}
          {agreements.centroidChamfer.toFixed(2)} (centroid↔chamfer) — a real consensus, not three
          unrelated numbers. The remaining disagreement, concentrated in specific pairs (see "where
          the measures disagree most" above), is where the choice of method changes the answer.
        </p>

        <p>
          <span className="font-medium text-ink">3. Chamfer is the most discriminating measure —
          proven, not asserted.</span> The phase gate (<code className="font-mono text-xs">test/clouds.test.js</code>)
          constructs two clouds with identical average position AND identical spread: centroid and
          Gaussian are mathematically forced to call them the same, because both only ever look at
          those two summary numbers. Chamfer, which compares individual views rather than a
          summary, correctly told them apart. That is a structural fact about the three measures,
          true regardless of which plazas are ever placed.
        </p>

        <p>
          <span className="font-medium text-ink">4. But "most discriminating" is not the same claim
          as "most accurate" — and that question is not yet answerable.</span> Accuracy means
          matching some outside, independent notion of what "similar" means, and none of the three
          measures has been checked against one: they have only been compared to each other and to
          the single-point picture. Chamfer seeing more structure is a mathematical property; whether
          that extra sensitivity corresponds to what a person would actually judge as similar is an
          open, empirical question. <span className="font-medium text-ink">That is what P8 tests</span>{' '}
          — showing real participants the pairs Chamfer calls most similar and recording whether they
          agree. Until that survey runs, the defensible claim from P7 alone is: the single-point
          model was an oversimplification, the three richer measures mostly agree with each other,
          and Chamfer is the theoretically strongest candidate to carry forward — not yet the proven
          one.
        </p>
      </div>
    </div>
  )
}
