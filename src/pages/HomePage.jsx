import { LuArrowRight, LuChevronRight } from 'react-icons/lu'
import sites from '@/data/sites.json'
import results from '@/data/results.json'
import responses from '@/data/survey-responses.json'
import { PHASES } from '@/lib/phases'
import { FigureGround } from '@/components/FigureGround'

// Researcher-facing landing: the platform's name, its one-line claim, a live
// figure-ground drawing computed from the thesis's own data, and the four-phase
// journey. Participants never see this — their link goes straight to ?survey.

const HERO_SITE =
  sites.find((s) => s.id === 'Gendarmenmarkt-Berlin') ??
  sites.find((s) => s.boundary && s.buildings.length > 0) ??
  sites[0]

export function HomePage() {
  const buildingCount = sites.reduce((sum, s) => sum + s.buildings.length, 0)

  // Live status per station, from the same JSON the tools read — the landing
  // reports the actual state of the study, not marketing copy.
  const status = {
    sites: `${sites.length} sites · ${buildingCount.toLocaleString()} buildings entered`,
    viewer: `${results.length} saved isovist ${results.length === 1 ? 'reading' : 'readings'}`,
    survey: `${responses.length} ${responses.length === 1 ? 'response' : 'responses'} collected`,
    results: 'weight fitting unlocks after the survey',
  }

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
                A Perceptually Validated Metric Framework for the Diagnosis and Targeted Redesign
                of Public Plazas.
              </p>
              <p className="mt-2 font-mono text-xs text-ink-faint">
                {sites.length} European plazas · 4 isovist metrics · triplet survey ·
                maximum-likelihood weighting
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

        {/* ---- The four-phase journey ----------------------------------- */}
        <section className="mt-16 sm:mt-20">
          <div className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              One pipeline, four phases
            </h2>
            <p className="hidden font-mono text-xs text-ink-faint sm:block">
              validation-gated · built in order
            </p>
          </div>

          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {PHASES.map((p, i) => (
              <li key={p.id} className="animate-rise-in" style={{ animationDelay: `${280 + i * 80}ms` }}>
                <a
                  href={`#/${p.id}`}
                  className="group flex h-full flex-col rounded-xl border border-line bg-paper p-5 outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary-wash"
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
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">{p.blurb}</p>
                  <p className="mt-4 border-t border-line pt-2.5 font-mono text-xs text-ink-faint">
                    {status[p.id]}
                  </p>
                </a>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Record strip -------------------------------------------- */}
        <p className="mt-14 border-t border-line pt-5 font-mono text-xs leading-relaxed text-ink-faint">
          Geometry engine validated against Grasshopper reference values · phases gated in order ·
          participant survey runs standalone at its own link
        </p>
      </div>
    </div>
  )
}
