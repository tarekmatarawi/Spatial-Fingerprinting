import { LuArrowRight, LuChevronRight } from 'react-icons/lu'
import sites from '@/data/sites.json'
import results from '@/data/results.json'
import responses from '@/data/survey-responses-360.json'
import { fit, crossval } from '@/data/analysis-panoramic.json'
import { total_points as fieldPoints, k as zoneCount } from '@/data/zones.json'
import { markers as cloudMarkers, target_per_site as viewsPerCloud } from '@/data/view-clouds.json'
import matchedViewSessions from '@/data/matched-view-responses.json'
import { selection as trialSelection } from '@/data/matched-view-trials.json'
import { scenarios } from '@/data/scenarios.json'
import { groupedPhases, PHASES } from '@/lib/phases'
import { activeSites } from '@/lib/site'
import { FigureGround } from '@/components/FigureGround'

// Researcher-facing landing: the platform's name, its one-line claim, a live
// figure-ground drawing computed from the thesis's own data, and the nine-phase
// journey grouped into setup, analysis, and design application. Participants never see this — their links go straight to ?survey or ?matched-view-survey.

// Only the perceptual (120°) layer — results.json also holds the panoramic
// survey's 360° readings, which are not what this line is reporting.
const perceptualReadings = results.filter((r) => r.fov_mode === 'perceptual_120')

const pct = (v) => `${(v * 100).toFixed(1)}%`
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

// A P7 cloud is a plaza's canonical 120° reading plus its placed markers, and
// it only counts once it reaches the target — the same rule the comparison page
// uses before it will draw a matrix.
function completeClouds(studySites) {
  const perSite = new Map()
  for (const m of cloudMarkers) perSite.set(m.site_id, (perSite.get(m.site_id) ?? 0) + 1)
  const canonical = new Set(
    perceptualReadings.filter((r) => r.canonical).map((r) => r.site_id)
  )
  let complete = 0
  let views = 0
  for (const s of studySites) {
    const n = (perSite.get(s.id) ?? 0) + (canonical.has(s.id) ? 1 : 0)
    views += n
    if (n >= viewsPerCloud) complete++
  }
  return { complete, views }
}

const HERO_SITE =
  sites.find((s) => s.id === 'Gendarmenmarkt-Berlin') ??
  sites.find((s) => s.boundary && s.buildings.length > 0) ??
  sites[0]

export function HomePage() {
  // Headline counts describe the study, so they follow the active sites only —
  // a plaza excluded in the register still has data but isn't part of the work.
  const studySites = activeSites(sites)
  const buildingCount = studySites.reduce((sum, s) => sum + s.buildings.length, 0)
  const excludedCount = sites.length - studySites.length
  const clouds = completeClouds(studySites)
  const caseSiteName =
    sites.find((s) => s.id === scenarios[0]?.site_id)?.name ?? 'Konstablerwache'

  // Live status per station, from the same JSON the tools read — the landing
  // reports the actual state of the study, not marketing copy.
  const status = {
    sites: `${studySites.length} sites · ${buildingCount.toLocaleString()} buildings entered${
      excludedCount > 0 ? ` · ${excludedCount} excluded` : ''
    }`,
    viewer: `${perceptualReadings.length} saved isovist ${perceptualReadings.length === 1 ? 'reading' : 'readings'}`,
    survey: `${responses.length} ${responses.length === 1 ? 'response' : 'responses'} collected`,
    results: `${responses.length} ${responses.length === 1 ? 'session' : 'sessions'} to review`,
    weights: `${plural(fit.n, 'triplet')} fitted · ${pct(crossval.mean_accuracy)} held-out vs ${pct(crossval.chance)} chance`,
    field: `${plural(fieldPoints, 'field point')} · ${zoneCount} zone types`,
    'cloud-comparison': `${clouds.complete} of ${studySites.length} clouds complete · ${plural(clouds.views, 'view')}`,
    'matched-view': `${plural(matchedViewSessions.length, 'session')} collected · ${trialSelection.per_stratum * 2}-trial bank`,
    diagnose: `${plural(scenarios.length, 'saved scenario')} · ${caseSiteName}`,
  }

  const builtCount = PHASES.filter((p) => p.status === 'built').length
  const allBuilt = builtCount === PHASES.length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        {/* ---- Hero ---------------------------------------------------- */}
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-14">
          <div>
            <p
              className="animate-rise-in font-mono text-xs font-medium tracking-wide text-primary"
              style={{ animationDelay: '0ms' }}
            >
              Master&rsquo;s thesis · research instrument
            </p>
            <h1
              className="animate-rise-in mt-3 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl"
              style={{ animationDelay: '60ms' }}
            >
              Spatial Fingerprinting
            </h1>
            <p
              className="animate-rise-in mt-5 max-w-prose text-pretty text-lg leading-relaxed text-ink-muted"
              style={{ animationDelay: '120ms' }}
            >
              A perceptually calibrated framework for reading, comparing, and redesigning public
              plazas — from raw building footprints to a validated spatial metric.
            </p>

            <div
              className="animate-rise-in mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '180ms' }}
            >
              <a
                href="#/sites"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Start with the site register
                <LuArrowRight aria-hidden className="h-4 w-4" />
              </a>
              <a
                href="#/viewer"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-6 py-2.5 text-sm font-medium text-ink shadow-sm outline-none transition-all duration-150 hover:border-primary hover:text-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash"
              >
                Jump to the 3D viewer
              </a>
            </div>

            {/* Title block — the sheet's formal record line */}
            <div
              className="animate-rise-in mt-10 border-t border-line-strong pt-4"
              style={{ animationDelay: '240ms' }}
            >
              <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                Spatial Fingerprinting: A Perceptually Calibrated Metric Framework for the
                Diagnosis and Targeted Redesign of Public Plazas
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Tarek Ahmed · supervised by Reinhard König and Martin Bielik
              </p>
              <p className="mt-2 font-mono text-xs text-ink-faint">
                {studySites.length} European plazas · 4 isovist metrics · panoramic triplet survey ·
                maximum-likelihood weighting · {zoneCount}-type zone typology · view-cloud
                comparison · matched-view validation · design diagnostic
              </p>
            </div>
          </div>

          {/* The drawing plate: real footprints, real engine, computed live */}
          <figure className="animate-rise-in min-w-0" style={{ animationDelay: '150ms' }}>
            <div className="overflow-hidden rounded-xl border border-line-strong bg-paper shadow-sm">
              <FigureGround site={HERO_SITE} className="block aspect-square w-full" />
              <figcaption className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-2.5 font-mono text-xs text-ink-muted">
                <span className="truncate">
                  {HERO_SITE.name}, {HERO_SITE.city}
                </span>
                <span className="shrink-0 text-ink-faint">120° isovist · computed live</span>
              </figcaption>
            </div>
          </figure>
        </section>

        {/* ---- The nine-phase journey, in three movements ---------------- */}
        <section className="mt-16 sm:mt-20">
          <div className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              One pipeline, nine phases
            </h2>
            <p className="hidden items-center gap-2 font-mono text-xs text-ink-faint sm:flex">
              {allBuilt && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-wash px-2.5 py-0.5 text-ok">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                  all {PHASES.length} built
                </span>
              )}
              {!allBuilt && `${builtCount} of ${PHASES.length} built`}
              <span>· validation-gated, built in order</span>
            </p>
          </div>

          {groupedPhases.map((group, gi) => (
            <div key={group.id} className={gi === 0 ? 'mt-6' : 'mt-8'}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-mono text-xs font-medium tracking-wide text-primary">
                  {group.name.toUpperCase()}
                </h3>
                <p className="text-xs text-ink-faint">{group.blurb}</p>
              </div>
              <ol className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                {group.phases.map((p, i) => (
                  <li
                    key={p.id}
                    className="animate-rise-in"
                    style={{ animationDelay: `${280 + (gi * 4 + i) * 60}ms` }}
                  >
                    <a
                      href={`#/${p.id}`}
                      className={`group flex h-full flex-col rounded-xl border bg-paper p-5 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary-wash ${
                        p.status === 'planned' ? 'border-dashed border-line-strong' : 'border-line'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-bg text-ink-muted transition-colors duration-200 group-hover:border-primary/40 group-hover:text-primary">
                          <p.icon aria-hidden className="h-5 w-5" />
                        </span>
                        <span className="font-mono text-xs text-ink-faint">{p.code}</span>
                      </div>
                      <h3 className="mt-4 flex items-center gap-1 font-medium text-ink">
                        {p.journey}
                        <LuChevronRight
                          aria-hidden
                          className="h-4 w-4 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                        />
                      </h3>
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">
                        {p.blurb}
                      </p>
                      <p className="mt-4 border-t border-line pt-2.5 font-mono text-xs text-ink-faint">
                        {status[p.id] ?? 'not built yet'}
                      </p>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        {/* ---- Record strip -------------------------------------------- */}
        <p className="mt-14 border-t border-line pt-5 font-mono text-xs leading-relaxed text-ink-faint">
          {allBuilt ? `All ${PHASES.length} phases built` : `${builtCount} of ${PHASES.length} phases built`}{' '}
          · geometry engine compared against a Grasshopper reference point · phases gated in order ·
          both participant surveys run standalone at their own links
        </p>
      </div>
    </div>
  )
}
