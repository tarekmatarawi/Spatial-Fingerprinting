import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuBox, LuHouse, LuChevronDown } from 'react-icons/lu'
import { PHASES, groupedPhases, phaseById, phaseTitle } from '@/lib/phases'
import { PhasePlaceholder } from '@/pages/PhasePlaceholder'

// A reload that cannot be served from cache: the query string makes the
// request URL unique, so neither the browser's disk cache nor a CDN in front
// of it can match it against a previously cached response — it has no choice
// but to fetch the current index.html and the chunk manifest that goes with
// it. A plain location.reload() doesn't guarantee this: within its
// Cache-Control window (600s here) it can legitimately re-serve the exact
// stale response that caused the failure, which reads as "the reload button
// does nothing".
function hardReload() {
  const url = new URL(window.location.href)
  url.searchParams.set('_r', Date.now().toString(36))
  window.location.replace(url.toString())
}

// Every hashed chunk filename changes on every deploy, and each deploy
// replaces the previous one's files outright — an old filename simply stops
// existing. A browser (or phone) holding a cached copy of index.html from
// before the latest deploy will still ask for the OLD names, get an HTML
// error page back for each, and hand that HTML to the module loader as if it
// were JavaScript — which is what "SyntaxError: Unexpected token" actually
// means here; it is not a language-support problem, it is stale HTML naming
// files that no longer exist.
//
// Wrapping lazy() this way makes that self-healing: the first time any lazy
// chunk fails to load, it performs exactly one hard, cache-busting reload
// (guarded in sessionStorage so a genuine, persistent error still surfaces
// normally afterward rather than reload-looping forever) instead of leaving
// someone stuck on a dead page with a Reload button that cannot fix anything.
const RELOAD_GUARD_KEY = 'sf-stale-chunk-reload'
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((error) => {
      let alreadyTried = false
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
      } catch {
        // Private browsing / storage disabled — fall through to the
        // ErrorBoundary rather than retry forever with no memory of trying.
        alreadyTried = true
      }
      if (!alreadyTried) {
        try {
          sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
        } catch {
          // Nothing to guard with; proceed anyway, the ErrorBoundary is the
          // fallback if this reload doesn't resolve it.
        }
        hardReload()
        // The page is navigating away — never resolve, so React doesn't
        // briefly render an error state right before the reload lands.
        return new Promise(() => {})
      }
      throw error
    })
  )
}

// The 3D viewer carries Three.js, so it loads on demand rather than in the
// eager entry bundle every visitor downloads first.
const SiteViewer = lazyWithReload(() =>
  import('@/components/SiteViewer').then((m) => ({ default: m.SiteViewer }))
)

// The survey also carries Three.js (for the panorama viewer), so it is split
// out the same way. Before this split it was bundled eagerly into the single
// entry file every visitor downloads before anything can render — including a
// researcher opening the plain overview, and a participant on a phone whose
// browser has to parse and execute the whole thing (Three.js included) before
// the first paint. On a memory-constrained mobile browser that is exactly the
// failure mode that shows as a blank white screen with no error: the page is
// killed mid-parse, before React ever mounts.
const SurveyPage = lazyWithReload(() =>
  import('@/pages/SurveyPage').then((m) => ({ default: m.SurveyPage }))
)

// Every researcher page is lazy too, for the same reason, and it matters more
// than Three.js does: HomePage alone imports the full sites.json for its hero
// drawing and status counts — 2.4 MB minified, all 18 plazas' complete
// building footprints, for one drawing and a few numbers. Because these four
// were previously plain top-level imports, that 2.4 MB (plus AdminPage's,
// ResultsPage's and SurveyLaunch's own data) was parsed and executed on EVERY
// route including ?survey, even though a participant never renders any of
// them — App() returns before ResearcherShell ever mounts. Splitting them out
// means a participant's phone downloads only what the survey itself needs.
const HomePage = lazyWithReload(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
)
const AdminPage = lazyWithReload(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage }))
)
const SurveyLaunch = lazyWithReload(() =>
  import('@/pages/SurveyLaunch').then((m) => ({ default: m.SurveyLaunch }))
)
const ResultsPage = lazyWithReload(() =>
  import('@/pages/ResultsPage').then((m) => ({ default: m.ResultsPage }))
)

const WeightsPage = lazyWithReload(() =>
  import("@/pages/WeightsPage").then((m) => ({ default: m.WeightsPage }))
)

const FieldPage = lazyWithReload(() =>
  import('@/pages/FieldPage').then((m) => ({ default: m.FieldPage }))
)

const ROUTES = ['home', ...PHASES.map((p) => p.id)]

// Phases that are still to be built get a station and a route, but land on a
// placeholder. Better an honest empty berth than a missing one — the workflow
// should read as nine phases from the first day, not grow silently.
const PLANNED = PHASES.filter((p) => p.status === 'planned' && p.id !== 'field' && p.id !== 'weights')

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
  if (query.has('survey')) {
    return (
      <StandaloneErrorBoundary>
        <Suspense fallback={<StandaloneLoading />}>
          <SurveyPage />
        </Suspense>
      </StandaloneErrorBoundary>
    )
  }
  if (query.has('matched-view-survey')) {
    return <PhasePlaceholder phase={phaseById.get('matched-view')} standalone />
  }

  return (
    <ResearcherErrorBoundary>
      <ResearcherShell />
    </ResearcherErrorBoundary>
  )
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
        <Page active={route === 'home'}>
          {visited.has('home') && (
            <Suspense fallback={<RouteLoading />}>
              <HomePage />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'sites'}>
          {visited.has('sites') && (
            <Suspense fallback={<RouteLoading />}>
              <AdminPage />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'viewer'}>
          {visited.has('viewer') && (
            <Suspense fallback={<ViewerLoading />}>
              <SiteViewer active={route === 'viewer'} />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'survey'}>
          {visited.has('survey') && (
            <Suspense fallback={<RouteLoading />}>
              <SurveyLaunch />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'results'}>
          {visited.has('results') && (
            <Suspense fallback={<RouteLoading />}>
              <ResultsPage />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'weights'}>
          {visited.has('weights') && (
            <Suspense fallback={<RouteLoading />}>
              <WeightsPage />
            </Suspense>
          )}
        </Page>
        <Page active={route === 'field'}>
          {visited.has('field') && (
            <Suspense fallback={<RouteLoading />}>
              <FieldPage />
            </Suspense>
          )}
        </Page>
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

// Shown while any researcher page's own chunk (and whatever data it imports)
// is still in flight.
function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center text-ink-faint">
      <p className="font-mono text-xs">Loading…</p>
    </div>
  )
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

// The survey's chunk (Three.js included) is in flight. Deliberately bare and
// chrome-free, matching the survey itself — a participant who followed the
// link should never see researcher navigation, not even for a moment.
function StandaloneLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-ink-faint">
      <LuBox aria-hidden className="h-8 w-8 animate-pulse text-primary" />
      <p className="font-mono text-xs">Loading…</p>
    </div>
  )
}

// Catches a render error anywhere below it and shows a plain message instead
// of leaving the page blank. Before this existed, ANY uncaught error on ANY
// route — a WebGL context failing to create, a malformed response record, a
// missing site field — silently blanked the whole app on every device, with
// no sign of what happened. React error boundaries have to be class
// components; there is no hook equivalent.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error)
    return this.props.children
  }
}

// The actual error text, shown directly on screen rather than left in the
// console — on a phone there is usually no way to open dev tools at all, so a
// generic "something went wrong" gives nobody, including us, anything to act
// on. This renders whatever the browser's own error names, in a selectable
// block someone can read back or copy without any special tooling.
function ErrorDetail({ error }) {
  return (
    <p className="max-w-sm rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs break-words text-ink-muted select-text">
      {String(error?.name || 'Error')}: {String(error?.message || 'no message')}
    </p>
  )
}

function StandaloneErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink-muted">
          <p className="text-sm">Something went wrong loading the survey.</p>
          <ErrorDetail error={error} />
          <button
            onClick={hardReload}
            className="rounded-full border border-line-strong bg-paper px-4 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary-deep"
          >
            Reload
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

function ResearcherErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink-muted">
          <p className="text-sm">Something went wrong.</p>
          <ErrorDetail error={error} />
          <button
            onClick={hardReload}
            className="rounded-full border border-line-strong bg-paper px-4 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary-deep"
          >
            Reload
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
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
  // Where to draw the menu, in viewport coordinates. Measured from the trigger
  // when the menu opens — see the portal below for why it cannot simply be
  // positioned relative to its parent.
  const [anchor, setAnchor] = useState(null)
  const triggerRef = useRef(null)
  const current = group.phases.find((p) => p.id === route)

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ left: rect.left, top: rect.bottom + 4 })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onClick = (e) => {
      if (!e.target.closest('[data-phase-cluster]') && !e.target.closest('[data-phase-menu]')) {
        setOpen(false)
      }
    }
    // The menu is positioned once, in viewport coordinates, so anything that
    // moves the trigger underneath it would leave it stranded. Closing is
    // simpler and less jarring than chasing the trigger around.
    const onMove = () => setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    window.addEventListener('resize', onMove)
    // `true` catches scrolling inside the nav's own overflow container, not
    // just the page.
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
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
        ref={triggerRef}
        onClick={() => {
          if (!open) place()
          setOpen((v) => !v)
        }}
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

      {/* Portalled to <body>, not positioned inside the nav.
       *
       * The nav bar scrolls horizontally on narrow screens, which means it
       * carries `overflow-x: auto` — and CSS does not allow one axis to
       * overflow visibly while the other scrolls, so the vertical axis is
       * clipped too. A menu positioned inside it therefore opened correctly and
       * was then cut off at the bar's own bottom edge: the button appeared to
       * do nothing at all. Rendering into <body> in viewport coordinates takes
       * the menu out of that clipping context entirely. */}
      {open && anchor &&
        createPortal(
          <div
            data-phase-menu
            style={{ position: 'fixed', left: anchor.left, top: anchor.top }}
            className="z-50 w-72 overflow-hidden rounded-xl border border-line-strong bg-paper shadow-lg"
          >
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
          </div>,
          document.body
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
