import { lazy, Suspense, useEffect, useState } from 'react'
import { LuBox, LuHouse, LuChevronDown } from 'react-icons/lu'
import { PHASES, groupedPhases, phaseById, phaseTitle } from '@/lib/phases'
import { HomePage } from '@/pages/HomePage'
import { AdminPage } from '@/pages/AdminPage'
import { SurveyPage } from '@/pages/SurveyPage'
import { SurveyLaunch } from '@/pages/SurveyLaunch'
import { ResultsPage } from '@/pages/ResultsPage'
import { PhasePlaceholder } from '@/pages/PhasePlaceholder'

// The 3D viewer carries Three.js — by far the heaviest part of the app — so it
// loads on demand. Participants opening the ?survey link never fetch it.
const SiteViewer = lazy(() =>
  import('@/components/SiteViewer').then((m) => ({ default: m.SiteViewer }))
)

const ROUTES = ['home', ...PHASES.map((p) => p.id)]

// Phases that are still to be built get a station and a route, but land on a
// placeholder. Better an honest empty berth than a missing one — the workflow
// should read as nine phases from the first day, not grow silently.
const PLANNED = PHASES.filter((p) => p.status === 'planned')

// Route from the URL hash (#/sites, #/viewer, …). A bare URL that carries the
// viewer's ?site=… query (a shared deep link from before hash routing existed)
// still lands on the viewer.
function readRoute() {
  const raw = window.location.hash
  const h = raw.replace(/^#\/?/, '')
  if (ROUTES.includes(h)) return h
  // Only a truly hash-less URL defers to the ?site query — once the user has
  // navigated anywhere (#/…), the hash is the sole route authority, so a stale
  // ?site left behind by the viewer can't hijack a reload on another page.
  if (!raw && new URLSearchParams(window.location.search).has('site')) return 'viewer'
  return 'home'
}

export default function App() {
  const query = new URLSearchParams(window.location.search)

  // The participant surveys are standalone, chrome-free surfaces: when the URL
  // carries their flag, render only the survey (no researcher navigation).
  // P3 (?survey) is live; P8 (?matched-view-survey) gets its link reserved here
  // so it can never collide with a researcher route once it is built.
  if (query.has('survey')) return <SurveyPage />
  if (query.has('matched-view-survey')) {
    return <PhasePlaceholder phase={phaseById.get('matched-view')} standalone />
  }

  return <ResearcherShell />
}

function ResearcherShell() {
  const [route, setRoute] = useState(readRoute)
  // Pages stay mounted once visited (hidden, not unmounted), so switching
  // phases never loses in-progress state — admin edits, the 3D camera, a
  // half-drawn building all survive the trip to another tab and back.
  const [visited, setVisited] = useState(() => new Set([readRoute()]))

  useEffect(() => {
    function onHashChange() {
      const next = readRoute()
      setRoute(next)
      setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <nav
        aria-label="Workflow phases"
        className="flex shrink-0 items-stretch gap-4 overflow-x-auto border-b border-line bg-bg px-4 sm:gap-5 sm:px-5"
      >
        <a
          href="#/"
          className="flex shrink-0 items-center gap-2.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          <BrandMark />
          <span className="font-semibold tracking-tight text-ink">Spatial Fingerprinting</span>
          <span className="hidden font-mono text-xs text-ink-faint xl:inline">
            isovist research platform
          </span>
        </a>

        <div className="flex items-stretch">
          <StepLink
            href="#/"
            active={route === 'home'}
            icon={LuHouse}
            label="Overview"
            title="Overview"
          />
          {groupedPhases.map((group) =>
            // Analysis holds four phases — too many for the bar, so it collapses
            // into one station that opens the cluster. Setup and Design Tool are
            // short enough to sit inline.
            group.id === 'analysis' ? (
              <PhaseCluster key={group.id} group={group} route={route} />
            ) : (
              group.phases.map((p) => (
                <span key={p.id} className="flex items-stretch">
                  {/* Hairline connector — the stepper reads as one continuous
                      drawing-set index line, not nine separate tabs. */}
                  <span aria-hidden className="my-auto h-px w-3 shrink-0 bg-line-strong sm:w-4" />
                  <StepLink
                    href={`#/${p.id}`}
                    active={route === p.id}
                    icon={p.icon}
                    code={p.code}
                    label={p.name}
                    planned={p.status === 'planned'}
                    title={`${p.code} — ${phaseTitle(p)}`}
                  />
                </span>
              ))
            )
          )}
        </div>
      </nav>

      <div className="relative min-h-0 flex-1">
        <Page active={route === 'home'}>{visited.has('home') && <HomePage />}</Page>
        <Page active={route === 'sites'}>{visited.has('sites') && <AdminPage />}</Page>
        <Page active={route === 'viewer'}>
          {visited.has('viewer') && (
            <Suspense fallback={<ViewerLoading />}>
              <SiteViewer active={route === 'viewer'} />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'survey'}>{visited.has('survey') && <SurveyLaunch />}</Page>
        <Page active={route === 'results'}>{visited.has('results') && <ResultsPage />}</Page>
        {PLANNED.map((p) => (
          <Page key={p.id} active={route === p.id}>
            {visited.has(p.id) && <PhasePlaceholder phase={p} />}
          </Page>
        ))}
      </div>
    </div>
  )
}

// A phase station in the stepper: icon + sheet code + name. Hidden pages keep
// their DOM; the entrance animation re-runs each time a page becomes visible
// because display:none resets CSS animations.
function Page({ active, children }) {
  return <div className={active ? 'h-full animate-page-in' : 'hidden'}>{children}</div>
}

// Shown for the moment the Three.js chunk is in flight the first time the
// viewer opens: the phase icon breathing over a one-line status.
function ViewerLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-faint">
      <LuBox aria-hidden className="h-8 w-8 animate-pulse text-primary" />
      <p className="font-mono text-xs">Preparing the 3D model…</p>
    </div>
  )
}

function StepLink({ href, active, icon: Icon, code, label, title, planned = false }) {
  return (
    <a
      href={href}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={`relative flex shrink-0 items-center gap-1.5 px-2 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash sm:gap-2 sm:px-2.5 ${
        active ? 'text-ink' : planned ? 'text-ink-faint hover:text-ink-muted' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <Icon
        aria-hidden
        className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
          active ? 'text-primary' : 'text-ink-faint'
        }`}
      />
      {code && (
        <span
          className={`hidden font-mono text-xs sm:inline ${
            active ? 'text-primary' : 'text-ink-faint'
          }`}
        >
          {code}
        </span>
      )}
      <span className="hidden md:inline">{label}</span>
      {active && <span className="absolute inset-x-1.5 bottom-0 h-0.5 bg-accent" />}
    </a>
  )
}

// The Analysis group: one station in the bar that opens the four phases beneath
// it. Collapsed, it shows the group name — or, when one of its phases is open,
// that phase's code and name, so the bar never hides where you actually are.
function PhaseCluster({ group, route }) {
  const [open, setOpen] = useState(false)
  const current = group.phases.find((p) => p.id === route)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onClick = (e) => {
      if (!e.target.closest('[data-phase-cluster]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
    }
  }, [open])

  // Opening a phase from the list should close the list.
  useEffect(() => setOpen(false), [route])

  const Icon = current?.icon ?? group.phases[0].icon

  return (
    <span data-phase-cluster className="relative flex items-stretch">
      <span aria-hidden className="my-auto h-px w-3 shrink-0 bg-line-strong sm:w-4" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={current ? `${current.code} — ${phaseTitle(current)}` : group.name}
        className={`relative flex shrink-0 items-center gap-1.5 px-2 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash sm:gap-2 sm:px-2.5 ${
          current ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <Icon
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
            current ? 'text-primary' : 'text-ink-faint'
          }`}
        />
        <span
          className={`hidden font-mono text-xs sm:inline ${
            current ? 'text-primary' : 'text-ink-faint'
          }`}
        >
          {current ? current.code : `P${group.phases[0].code.slice(1)}–P${group.phases.at(-1).code.slice(1)}`}
        </span>
        <span className="hidden md:inline">{current ? current.name : group.name}</span>
        <LuChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
        {current && <span className="absolute inset-x-1.5 bottom-0 h-0.5 bg-accent" />}
      </button>

      {open && (
        <div className="absolute top-full left-3 z-50 mt-1 w-72 overflow-hidden rounded-xl border border-line-strong bg-paper shadow-lg">
          <p className="border-b border-line px-3 py-2 font-mono text-xs text-ink-faint">
            {group.name} · {group.blurb}
          </p>
          <ul>
            {group.phases.map((p) => (
              <li key={p.id}>
                <a
                  href={`#/${p.id}`}
                  aria-current={p.id === route ? 'page' : undefined}
                  className={`flex items-start gap-2.5 px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-primary-wash/40 focus-visible:bg-primary-wash/40 ${
                    p.id === route ? 'bg-primary-wash/60' : ''
                  }`}
                >
                  <p.icon
                    aria-hidden
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      p.id === route ? 'text-primary' : 'text-ink-faint'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-xs text-primary">{p.code}</span>
                      <span className="truncate text-sm text-ink">{phaseTitle(p)}</span>
                    </span>
                    {p.status === 'planned' && (
                      <span className="mt-0.5 block font-mono text-xs text-ink-faint">
                        not built yet
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}

// Miniature figure-ground plate: ink blocks around an open plaza with the
// orange view cone — the platform's mark, echoing the hero drawing.
function BrandMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
      <rect x="0.5" y="0.5" width="23" height="23" fill="var(--color-paper)" stroke="var(--color-line-strong)" />
      <rect x="3" y="3" width="7" height="5" fill="var(--color-ink)" />
      <rect x="14" y="3" width="7" height="7" fill="var(--color-ink)" />
      <rect x="3" y="12" width="5" height="9" fill="var(--color-ink)" />
      <rect x="16" y="14" width="5" height="7" fill="var(--color-ink)" />
      <path d="M11.5 17 L7 9 A 9.4 9.4 0 0 1 17.5 8.5 Z" fill="var(--color-accent)" opacity="0.85" />
      <circle cx="11.5" cy="17" r="1.6" fill="var(--color-redline)" />
    </svg>
  )
}
