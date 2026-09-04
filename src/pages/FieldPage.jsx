import { useEffect, useMemo, useState } from 'react'
import { LuGrid3X3, LuInfo } from 'react-icons/lu'

import sites from '@/data/sites.json'
import zones from '@/data/zones.json'
import fieldIndex from '@/data/fields/index.json'
import { METRICS, METRIC_LABELS, METRIC_UNITS } from '@/lib/analysis/fingerprints'
import { activeSites, projectSite } from '@/lib/site'

// P6 — Isovist Field Mapping & Zone Typology.
//
// Two ways of reading the same grid, side by side. The metric maps show one
// dimension at a time as a continuous gradient — where the space is large, or
// enclosed, or full of visible facade. The zone map shows the typology, which
// is what those four gradients look like once they are read together.
//
// Every composition figure states the plaza's sampled point count. Small
// plazas yield few points (Naschmarkt 190, Hauptwache 1,224), so a percentage
// from one is not as precise as the same percentage from the other, and the
// count is the only thing on screen that says so.

// Zone colours are GLOBAL — zone 2 is the same colour at every plaza, because
// the typology is one clustering over all 18. Ordered from the largest, most
// open type through to the tightest, so the ramp reads as a sequence rather
// than as arbitrary categories.
const ZONE_COLOURS = ['#1D4ED8', '#0E7490', '#7C3AED', '#B45309', '#BE123C']

// Sequential ramp for metric maps: pale where the metric is low, saturated
// where it is high. Deliberately not the zone palette — a reader must never
// mistake a gradient for a category.
const RAMP = ['#F1F5F9', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B']

// One lazy loader per field file, resolved by the bundler at build time. The
// index.json is what says which of these actually exist; this map is only how
// they are fetched.
const FIELD_LOADERS = import.meta.glob('../data/fields/*.json')

function rampColour(t) {
  const clamped = Math.max(0, Math.min(1, t))
  const i = Math.min(RAMP.length - 1, Math.floor(clamped * (RAMP.length - 1)))
  return RAMP[i]
}

// Zone names are descriptive labels derived from each centre, not part of the
// clustering — they exist so the legend reads as architecture rather than as
// cluster indices. Built from the centre's own coordinates so they cannot
// drift out of step with a re-run.
function describeZone(centre) {
  const [area, compact, occl, enclosure] = centre
  const size = area > 0.8 ? 'Vast' : area > 0.4 ? 'Open' : 'Tight'
  let character
  if (enclosure > 0.8) character = 'strongly enclosed'
  else if (occl > 0.7) character = 'facade-rich'
  else if (compact > 0.9) character = 'regular'
  else if (compact < 0.35) character = 'irregular'
  else character = 'moderate'
  return `${size}, ${character}`
}

export function FieldPage() {
  const active = useMemo(() => activeSites(sites), [])
  const [siteId, setSiteId] = useState(fieldIndex.sites[0]?.site_id ?? null)
  const [metric, setMetric] = useState('zones')
  const [field, setField] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const entry = fieldIndex.sites.find((s) => s.site_id === siteId)
  const site = active.find((s) => s.id === siteId)

  // Field files are loaded one plaza at a time — the full grid is ~11,600
  // points across 18 files, and there is no reason to parse the other 17 to
  // draw the one on screen.
  //
  // import.meta.glob, not a bare dynamic import with a template literal. The
  // bundler has to see which files can be requested in order to emit them as
  // chunks; given a path it cannot resolve statically it emits nothing, the
  // build still succeeds, and every load fails only once the page is opened.
  // The glob names the set at build time and still loads each file lazily.
  useEffect(() => {
    if (!entry) return
    const loader = FIELD_LOADERS[`../data/fields/${entry.file}`]
    if (!loader) {
      setLoadError(`No field data bundled for ${entry.file} — run npm run fields`)
      return
    }
    let cancelled = false
    setField(null)
    setLoadError(null)
    loader()
      .then((m) => {
        if (!cancelled) setField(m.default ?? m)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [entry?.file])

  const geometry = useMemo(() => (site ? projectSite(site) : null), [site])

  const zoneNames = useMemo(() => zones.centres.map(describeZone), [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b-2 border-ink pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            P6 · Isovist Field Mapping
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Zone typology</h1>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Every plaza sampled on a {fieldIndex.spacing_m} m grid and measured at 360°, then all{' '}
            {fieldIndex.total_points.toLocaleString()} points clustered together into{' '}
            {zones.k} zone types shared across the corpus.
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
            <div>
              <dt className="inline">points </dt>
              <dd className="inline text-ink-muted">{fieldIndex.total_points.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="inline">spacing </dt>
              <dd className="inline text-ink-muted">{fieldIndex.spacing_m} m</dd>
            </div>
            <div>
              <dt className="inline">range </dt>
              <dd className="inline text-ink-muted">{fieldIndex.range_m} m</dd>
            </div>
            <div>
              <dt className="inline">zones </dt>
              <dd className="inline text-ink-muted">{zones.k}</dd>
            </div>
            <div>
              <dt className="inline">weighted by </dt>
              <dd className="inline text-ink-muted">P5 perceptual weights</dd>
            </div>
          </dl>
        </header>

        {/* ------------------------------------------------ zone legend */}
        <section className="pt-8">
          <h2 className="text-lg font-semibold text-ink">The {zones.k} zone types</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            One clustering over all 18 plazas, so a zone means the same thing everywhere. Centres
            are in normalised units on P5's scale — values above 1 are positions more extreme than
            any surveyed vantage point.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-3 font-semibold">Zone</th>
                  <th className="py-2 pr-3 text-right font-semibold">Share</th>
                  {METRICS.map((m) => (
                    <th key={m} className="py-2 pr-3 text-right font-semibold">
                      {METRIC_LABELS[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.centres.map((centre, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ background: ZONE_COLOURS[i % ZONE_COLOURS.length] }}
                        />
                        <span className="text-ink">{zoneNames[i]}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                      {((zones.counts[i] / zones.total_points) * 100).toFixed(1)}%
                    </td>
                    {centre.map((v, k) => (
                      <td
                        key={k}
                        className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted"
                      >
                        {v.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------ per-site map */}
        <section className="pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
            <h2 className="text-lg font-semibold text-ink">Plaza map</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input text-sm"
                value={siteId ?? ''}
                onChange={(e) => setSiteId(e.target.value)}
              >
                {fieldIndex.sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="input text-sm"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="zones">Zone types</option>
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadError && (
            <p className="mt-4 text-sm text-redline">Could not load this plaza's field: {loadError}</p>
          )}

          {!field && !loadError && (
            <p className="mt-4 font-mono text-xs text-ink-faint">Loading field…</p>
          )}

          {field && geometry && (
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px]">
              <FieldMap field={field} geometry={geometry} metric={metric} />
              <SiteComposition field={field} zoneNames={zoneNames} />
            </div>
          )}
        </section>

        {/* ------------------------------------------------ cross-site */}
        <section className="pt-12">
          <h2 className="text-lg font-semibold text-ink">Composition across the corpus</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            What share of each plaza is each zone type. Point counts are shown because they set how
            precisely a share can be read — a percentage from 190 points is a coarser number than
            the same percentage from 1,224.
          </p>
          <CompositionChart zoneNames={zoneNames} onSelect={setSiteId} selected={siteId} />
        </section>

        {/* ------------------------------------------------ methods */}
        <section className="pt-12 pb-16">
          <details className="rounded-lg border border-line bg-surface p-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Methods &amp; robustness
            </summary>
            <div className="mt-4 space-y-3 text-sm text-ink-muted">
              <p>
                <span className="font-medium text-ink">Normalisation.</span> Field points are scaled
                against P5's frozen <code className="font-mono text-xs">perceptual_360</code> bounds,
                not their own pooled range, so P5's fitted weights keep the meaning they were fitted
                with. Points more extreme than any surveyed vantage point fall outside 0–1 and are
                kept rather than clipped —{' '}
                {METRICS.map((m) => `${METRIC_LABELS[m].toLowerCase()} ${((fieldIndex.out_of_range[m] / fieldIndex.total_points) * 100).toFixed(1)}%`).join(', ')}
                .
              </p>
              <p>
                <span className="font-medium text-ink">Weighted clustering.</span> Distances use the
                P5 weights ({METRICS.map((m, i) => `${m} ${zones.weighted_by.weights[i].toFixed(3)}`).join(', ')}
                ). This is a transfer assumption: relative metric importance is assumed to hold from
                the perceptual layer to the field layer.
              </p>
              <p>
                <span className="font-medium text-ink">Robustness.</span> Clustering all four metrics
                equally instead of by the fitted weights leaves{' '}
                {(zones.unweighted_agreement * 100).toFixed(1)}% of points in a corresponding zone, so
                the typology is not an artefact of the weighting.
              </p>
              {zones.k_selection && (
                <p>
                  <span className="font-medium text-ink">Choice of k.</span>{' '}
                  {zones.k_selection.criterion} Mean silhouette peaks at k = 3, where 13 of 18 plazas
                  come out as a single zone — that clustering separates plazas rather than places
                  within them, which is not what this phase maps. k = {zones.k} was chosen instead.
                </p>
              )}
              <p>
                <span className="font-medium text-ink">Exclusions.</span> Points inside a building
                footprint, or within {fieldIndex.clearance_m} m of a facade, are not sampled — a
                position inside a wall is not somewhere a person stands.
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  )
}

// Scatter of the sampled grid over the plaza's footprints. Points are drawn as
// squares at grid spacing so the field reads as a continuous surface rather
// than as dots, which is what it represents.
function FieldMap({ field, geometry, metric }) {
  const { buildings, boundary } = geometry
  const view = useMemo(() => {
    const xs = []
    const ys = []
    for (const p of field.points) {
      xs.push(p.x)
      ys.push(p.y)
    }
    if (boundary) {
      for (const p of boundary) {
        xs.push(p.x)
        ys.push(p.y)
      }
    }
    // Padding is proportional, not fixed. A tight crop on the sampled points
    // shows the zone map floating with nothing around it — the surrounding
    // built fabric is what makes a zone legible as a place, since these
    // metrics are entirely about what that fabric does to the view. A quarter
    // of the plaza's own extent brings the enclosing blocks in without
    // shrinking the plaza to a speck, and a floor keeps very small squares
    // from being padded to nothing.
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    const pad = Math.max(18, Math.max(spanX, spanY) * 0.25)
    return {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minY: Math.min(...ys) - pad,
      maxY: Math.max(...ys) + pad,
    }
  }, [field, boundary])

  const w = view.maxX - view.minX
  const h = view.maxY - view.minY
  const cell = field.spacing_m

  // Metric maps scale within this plaza so its internal variation is visible;
  // a corpus-wide scale would flatten a small square to one flat tone.
  const range = useMemo(() => {
    if (metric === 'zones') return null
    const key = { area: 'area_m2', compactness: 'compactness', occlusivity: 'occlusivity_m', enclosure: 'enclosure_ratio' }[metric]
    const vals = field.points.map((p) => p[key])
    return { key, min: Math.min(...vals), max: Math.max(...vals) }
  }, [field, metric])

  return (
    <figure className="rounded-lg border border-line bg-paper p-3">
      <svg
        viewBox={`${view.minX} ${-view.maxY} ${w} ${h}`}
        className="w-full"
        style={{ aspectRatio: `${w} / ${h}` }}
        role="img"
        aria-label={`${field.name} field map`}
      >
        {/* y is negated throughout so north sits at the top */}
        {buildings.map((b, i) => (
          <polygon
            key={i}
            points={b.footprint.map((p) => `${p.x},${-p.y}`).join(' ')}
            className="fill-surface stroke-line-strong"
            strokeWidth={0.4}
          />
        ))}
        {boundary && (
          <polygon
            points={boundary.map((p) => `${p.x},${-p.y}`).join(' ')}
            fill="none"
            className="stroke-redline"
            strokeWidth={0.8}
            strokeDasharray="3 2"
          />
        )}
        {field.points.map((p, i) => {
          const colour =
            metric === 'zones'
              ? ZONE_COLOURS[(field.zones?.[i] ?? 0) % ZONE_COLOURS.length]
              : rampColour((p[range.key] - range.min) / (range.max - range.min || 1))
          return (
            <rect
              key={i}
              x={p.x - cell / 2}
              y={-p.y - cell / 2}
              width={cell}
              height={cell}
              fill={colour}
              opacity={0.85}
            />
          )
        })}
      </svg>
      <figcaption className="mt-2 flex items-center justify-between font-mono text-[11px] text-ink-faint">
        <span>
          {field.name} · {field.point_count.toLocaleString()} points at {field.spacing_m} m
        </span>
        <span>
          {metric === 'zones'
            ? 'zone types'
            : `${METRIC_LABELS[metric]} ${range.min.toFixed(metric === 'area' ? 0 : 3)}–${range.max.toFixed(metric === 'area' ? 0 : 3)} ${METRIC_UNITS[metric]}`}
        </span>
      </figcaption>
    </figure>
  )
}

// This plaza's zone profile — the same numbers the cross-site chart shows, but
// for the plaza on screen, with its point count stated.
function SiteComposition({ field, zoneNames }) {
  const tally = useMemo(() => {
    const t = new Array(zones.k).fill(0)
    for (const z of field.zones ?? []) t[z]++
    return t
  }, [field])

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Zone profile</h3>
      <p className="mt-1 font-mono text-[11px] text-ink-faint">
        {field.point_count.toLocaleString()} sampled points
      </p>
      <ul className="mt-3 space-y-2">
        {tally.map((n, i) => {
          const share = field.point_count ? n / field.point_count : 0
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink-muted">{zoneNames[i]}</span>
                <span className="font-mono tabular-nums text-ink">{(share * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${share * 100}%`,
                    background: ZONE_COLOURS[i % ZONE_COLOURS.length],
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {field.point_count < 250 && (
        <p className="mt-3 flex gap-1.5 text-[11px] leading-snug text-warn">
          <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          Few points — read these shares as approximate.
        </p>
      )}
    </div>
  )
}

// Stacked bars, one per plaza, ordered by how open they are. The point count
// sits beside every bar because it governs how precisely the share can be read.
function CompositionChart({ zoneNames, onSelect, selected }) {
  const rows = useMemo(
    () =>
      [...zones.composition].sort(
        (a, b) => b.shares[0] + b.shares[2] - (a.shares[0] + a.shares[2])
      ),
    []
  )

  return (
    <div className="mt-5 space-y-1.5">
      {rows.map((row) => (
        <button
          key={row.site_id}
          onClick={() => onSelect(row.site_id)}
          className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
            selected === row.site_id ? 'bg-surface' : ''
          }`}
        >
          <span className="w-36 shrink-0 truncate text-sm text-ink">{row.name}</span>
          <span className="flex h-5 flex-1 overflow-hidden rounded-sm">
            {row.shares.map((s, i) =>
              s > 0 ? (
                <span
                  key={i}
                  style={{ width: `${s * 100}%`, background: ZONE_COLOURS[i % ZONE_COLOURS.length] }}
                  title={`${zoneNames[i]} — ${(s * 100).toFixed(0)}%`}
                />
              ) : null
            )}
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
            {row.point_count.toLocaleString()}
          </span>
        </button>
      ))}
      <p className="pt-2 font-mono text-[11px] text-ink-faint">
        <LuGrid3X3 aria-hidden className="mr-1 inline h-3 w-3" />
        right column is the plaza's sampled point count
      </p>
    </div>
  )
}
