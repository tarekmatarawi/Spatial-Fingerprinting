import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { LuCheck, LuListChecks, LuShieldCheck, LuTimer } from 'react-icons/lu'
import sites from '@/data/sites.json'
import { activeSites } from '@/lib/site'
import { assembleSurvey, SURVEY_LENGTH } from '@/lib/triplets'
import { SURVEY_ENDPOINT_URL } from '@/lib/surveyEndpoint'
import { attentionCheckPassed, STATUS_COMPLETED, STATUS_IN_PROGRESS } from '@/lib/session'

// Phase 4 — the participant-facing triplet survey. This is the one surface in
// the platform that is NOT instrument-grade: it strips down to a single,
// unambiguous task (pick the two squares that feel most similar) with no
// researcher chrome, per the "one tool, two densities" product principle.
//
// Reached bare at ?survey; the researcher previews/links it from the P4 tab.

const INSTRUCTION =
  'Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Judge by the sense of space — not architectural style or surface materials.'

const AGE_GROUPS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+']

const siteById = new Map(sites.map((s) => [s.id, s]))
// Only sites still in the study are eligible for triplets. A plaza switched to
// "excluded" in the register keeps its geometry and photo but never reaches a
// participant. Three is the floor — a triplet needs three distinct plazas.
const ALL_SITE_IDS = activeSites(sites).map((s) => s.id)
const ENOUGH_SITES = ALL_SITE_IDS.length >= 3

export function SurveyPage() {
  const [stage, setStage] = useState('intro') // intro | survey | about | done
  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [submitState, setSubmitState] = useState('idle') // idle | saving | saved | failed | unconfigured

  // One stable participant id + survey plan for the whole session.
  const participantId = useMemo(() => crypto.randomUUID(), [])
  const startedAt = useMemo(() => new Date().toISOString(), [])
  const survey = useMemo(() => assembleSurvey(ALL_SITE_IDS, participantId), [participantId])

  // Every save rewrites the participant's whole record, so writes must land in
  // the order they were made. `revision` lets the storage side drop a stale
  // write outright, and the promise chain keeps only one request in flight.
  const revision = useRef(0)
  const saveChain = useRef(Promise.resolve())

  // Sends one snapshot of the session. Resolves to a submitState — it never
  // throws, so a failed mid-survey save can't break the round the participant
  // is on. Returns 'saved' | 'failed' | 'unconfigured'.
  const postSession = useCallback(async (payload) => {
    try {
      if (import.meta.env.DEV) {
        // Local dev keeps writing straight to src/data/survey-responses.json
        // via the Vite-only endpoint, so testing never touches the real
        // Google Sheet participants' answers land in once deployed.
        const res = await fetch('/__save-survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(String(res.status))
        return 'saved'
      }
      if (SURVEY_ENDPOINT_URL) {
        // GitHub Pages serves static files only, so the deployed survey posts
        // to a Google Apps Script Web App instead (see
        // docs/survey-storage-setup.md). text/plain sidesteps a CORS
        // preflight that Apps Script doesn't handle — the script still reads
        // the body as JSON regardless of this header.
        const res = await fetch(SURVEY_ENDPOINT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(String(res.status))
        return 'saved'
      }
      return 'unconfigured'
    } catch {
      return 'failed'
    }
  }, [])

  // Persists the session as it stands. Called after every single answer, not
  // just at the end: if a participant closes the tab at question 9, the nine
  // answers they did give are already on file, marked in_progress. The storage
  // side keys on participant_id, so each save replaces the previous snapshot
  // rather than piling up rows.
  const saveSession = useCallback(
    (answers, { completed = false, background = null, ageGroup = null } = {}) => {
      const now = new Date().toISOString()
      const payload = {
        participant_id: participantId,
        started_at: startedAt,
        updated_at: now,
        finished_at: completed ? now : null,
        status: completed ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
        revision: ++revision.current,
        // Top-level so the researcher can filter on it without reading into
        // the nested responses. Null until the check itself is answered.
        attention_check_passed: attentionCheckPassed(answers),
        background, // 'yes' | 'no' | 'undisclosed' — only known at the end
        age_group: ageGroup, // optional bracket, e.g. '25–34'
        responses: answers,
      }
      const run = saveChain.current.then(() => postSession(payload))
      saveChain.current = run.catch(() => {})
      return run
    },
    [participantId, startedAt, postSession]
  )

  const submit = useCallback(
    async (background, ageGroup) => {
      setSubmitState('saving')
      // Only this final save flips the record to 'completed' — reaching the
      // thank-you screen is what completion means.
      const state = await saveSession(responses, { completed: true, background, ageGroup })
      setSubmitState(state)
      setStage('done')
    },
    [saveSession, responses]
  )

  function handleChoice(chosenPair) {
    const triplet = survey[index]
    const [a, b, c] = triplet.site_ids
    const answer = {
      participant_id: participantId,
      triplet_id: triplet.triplet_id,
      order: triplet.order,
      site_a: a,
      site_b: b,
      site_c: c,
      chosen_pair: chosenPair,
      is_attention_check: triplet.is_attention_check,
      timestamp: new Date().toISOString(),
    }
    const next = [...responses, answer]
    setResponses(next)
    // Deliberately not awaited: the next triplet appears immediately and the
    // save settles in the background. A mid-survey failure stays silent —
    // there is nothing a participant could usefully do about it, and the final
    // submit reports honestly either way.
    saveSession(next)
    if (index + 1 < survey.length) setIndex((i) => i + 1)
    else setStage('about')
  }

  // Every hook above runs unconditionally; this bail-out is safe here. Without
  // three active plazas there is no triplet to show, so the participant sees a
  // plain "not open yet" rather than a broken round.
  if (!ENOUGH_SITES) {
    return (
      <div className="h-full w-full overflow-y-auto bg-bg text-ink">
        <Frame>
          <div className="mx-auto w-full max-w-xl animate-page-in">
            <p className="font-mono text-xs font-medium tracking-wide text-primary">
              Spatial perception study
            </p>
            <h1 className="mt-3 text-pretty text-2xl font-semibold tracking-tight text-ink">
              This study isn’t open yet
            </h1>
            <p className="mt-3 leading-relaxed text-ink-muted">
              The comparison needs at least three squares available before it can run. Please check
              back later.
            </p>
          </div>
        </Frame>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-bg text-ink">
      {stage === 'intro' && <Intro onBegin={() => setStage('survey')} />}
      {stage === 'survey' && (
        <Round
          key={survey[index].triplet_id}
          triplet={survey[index]}
          position={index + 1}
          total={survey.length}
          onChoice={handleChoice}
        />
      )}
      {stage === 'about' && <About onSubmit={submit} pending={submitState === 'saving'} />}
      {stage === 'done' && <Done submitState={submitState} />}
    </div>
  )
}

// ---- Intro ------------------------------------------------------------------

function Intro({ onBegin }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-xl animate-page-in">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">
          Spatial perception study
        </p>
        <h1 className="mt-3 text-pretty text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          How similar do these public squares feel?
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-muted">
          You&rsquo;ll see three public squares at a time and choose the two that feel most alike as
          spaces. There are no right answers — we&rsquo;re studying first impressions of space, so go
          with instinct rather than deliberating.
        </p>

        <div className="mt-7 border-t border-line pt-6">
          <p className="max-w-prose text-base leading-relaxed text-ink">{INSTRUCTION}</p>
        </div>

        <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3 font-mono text-xs text-ink-faint">
          <div>
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <LuListChecks aria-hidden className="h-3.5 w-3.5" />
              Rounds
            </dt>
            <dd className="mt-0.5 text-sm text-ink">{SURVEY_LENGTH} comparisons</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <LuTimer aria-hidden className="h-3.5 w-3.5" />
              Time
            </dt>
            <dd className="mt-0.5 text-sm text-ink">about 5 minutes</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <LuShieldCheck aria-hidden className="h-3.5 w-3.5" />
              Sign-in
            </dt>
            <dd className="mt-0.5 text-sm text-ink">none — fully anonymous</dd>
          </div>
        </dl>

        <div className="mt-9">
          <button
            onClick={onBegin}
            className="w-full rounded-full bg-primary px-8 py-3 text-base font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            Begin
          </button>
        </div>
      </div>
    </Frame>
  )
}

// ---- Round ------------------------------------------------------------------

function Round({ triplet, position, total, onChoice }) {
  // Selection is tracked by panel index (0/1/2), not site id, so an attention
  // check that repeats one plaza twice still resolves to two distinct panels.
  const [selected, setSelected] = useState([]) // queue of panel indices, max 2
  const containerRef = useRef(null)

  const toggle = useCallback((panelIdx) => {
    setSelected((prev) => {
      if (prev.includes(panelIdx)) return prev.filter((i) => i !== panelIdx)
      if (prev.length < 2) return [...prev, panelIdx]
      return [prev[1], panelIdx] // drop the oldest, keep it a rolling pair
    })
  }, [])

  const ready = selected.length === 2

  const confirm = useCallback(() => {
    if (!ready) return
    const pair = selected.map((i) => triplet.site_ids[i])
    onChoice(pair)
  }, [ready, selected, triplet, onChoice])

  // Keyboard: 1/2/3 toggle a panel, Enter confirms once two are chosen.
  useEffect(() => {
    function onKey(e) {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        toggle(Number(e.key) - 1)
      } else if (e.key === 'Enter') {
        confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, confirm])

  const pct = Math.round(((position - 1) / total) * 100)

  return (
    <Frame>
      {/* Wide container so the three street views dominate the screen on any
          monitor. The three-up grid is the same at every breakpoint — phones
          get narrower, shorter copies of the identical crop, not a different
          rule — so a round always fits one screen with no scrolling, and
          nothing can end up scrolled in under the action bar below. Each round
          is keyed, so this animates in as one unit — a soft page turn rather
          than a hard cut. */}
      <div className="mx-auto flex w-full max-w-6xl animate-page-in flex-col 2xl:max-w-[88rem]" ref={containerRef}>
        {/* Progress */}
        <div className="flex items-center gap-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs text-ink-faint">
            {String(position).padStart(2, '0')} / {total}
          </span>
        </div>

        {/* Task */}
        <h2 className="mt-6 text-pretty text-lg font-medium text-ink sm:mt-8 sm:text-xl">
          Select the <span className="text-primary">two</span> squares that feel most similar.
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted sm:text-base">
          By the sense of space — how open, enclosed, or complex — not style or materials.
        </p>

        {/* Choices */}
        <fieldset className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-5 xl:gap-6">
          <legend className="sr-only">Choose the two most similar squares</legend>
          {triplet.site_ids.map((id, i) => (
            <PlazaCard
              key={i}
              site={siteById.get(id)}
              selected={selected.includes(i)}
              order={selected.indexOf(i)}
              onToggle={() => toggle(i)}
            />
          ))}
        </fieldset>

        {/* Action — pinned to the bottom of the screen on phones. With the
            three-up grid above, a round already fits one screen on an
            ordinary phone, so this mostly guards the edge cases (a small
            phone, a participant with larger system text) where it doesn't
            quite — Next/Finish stays reachable either way, and pinning it
            can't cover a photo the way it could when this sat below a much
            taller single-column stack. Reverts to normal in-flow placement at
            sm, where there was never any scrolling to begin with. */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-6 flex flex-col-reverse gap-3 border-t border-line bg-bg/95 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_-6px_rgb(0_0_0_/_0.12)] backdrop-blur sm:static sm:mx-0 sm:mt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none sm:backdrop-blur-none">
          <p className="text-center text-sm text-ink-muted sm:text-left" aria-live="polite">
            {selected.length === 0 && 'Tap two squares to compare.'}
            {selected.length === 1 && 'One more — pick its closest match.'}
            {ready && 'These two feel most similar to you.'}
          </p>
          <button
            onClick={confirm}
            disabled={!ready}
            className="w-full rounded-full bg-primary px-8 py-3 text-base font-medium text-white shadow-sm outline-none transition-all duration-150 enabled:hover:bg-primary-deep enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            {position === total ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </Frame>
  )
}

function PlazaCard({ site, selected, order, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`group relative overflow-hidden rounded-2xl border text-left outline-none transition-all duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        selected
          ? 'border-accent ring-2 ring-accent'
          : 'border-line hover:border-line-strong'
      }`}
    >
      <PlazaImage site={site} />
      {/* Selection wash + badge */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
          selected ? 'bg-accent/10 opacity-100' : 'opacity-0'
        }`}
      />
      <span
        aria-hidden
        className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full font-mono text-xs font-medium shadow-sm transition-all duration-200 ease-out sm:right-3 sm:top-3 sm:h-7 sm:w-7 sm:text-sm ${
          selected ? 'scale-100 bg-primary text-white' : 'scale-0 bg-primary text-white'
        }`}
      >
        {order === 0 ? '1' : '2'}
      </span>
      {/* Name over city on phones — a three-up row at phone width has no room
          to spread them side by side the way the wider desktop card does. */}
      <div
        className="flex flex-col gap-0 border-t border-line bg-paper px-1.5 py-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 sm:px-3.5 sm:py-3"
        title={site?.name ? `${site.name}, ${site.city ?? ''}` : undefined}
      >
        <span className="truncate text-[11px] font-medium leading-tight text-ink sm:text-sm sm:leading-normal sm:text-base">
          {site?.name ?? 'Unknown'}
        </span>
        <span className="truncate font-mono text-[9px] leading-tight text-ink-faint sm:shrink-0 sm:text-xs sm:leading-normal">
          {site?.city}
        </span>
      </div>
    </button>
  )
}

// A Street View photo when present; otherwise a dignified plan-view placeholder
// (plaza name over a faint drafting glyph) instead of a broken-image icon, so
// the survey is fully usable before all site photos are added.
function PlazaImage({ site }) {
  const [failed, setFailed] = useState(false)
  const src = site?.street_view_image
    ? import.meta.env.BASE_URL + site.street_view_image.replace(/^\//, '')
    : null

  if (!src || failed) {
    return (
      <div className="relative flex aspect-[8/5] items-center justify-center overflow-hidden bg-surface">
        <PlanGlyph />
        <span className="relative px-4 text-center text-sm font-medium text-ink-muted">
          {site?.name ?? 'Unknown square'}
        </span>
      </div>
    )
  }

  return (
    <div className="aspect-[8/5] overflow-hidden bg-surface">
      {/* 8/5 (1.60) is the widest frame the current photo set tolerates. The
          set is bimodal — eight plazas shot near 4:3 (~1.32) and the rest
          between 1.6 and 2.15 — so no single frame fits all: the narrow ones
          lose height off the top, the wide ones lose width off the sides.
          Past ~1.67 the narrow group crosses 20% vertical loss and starts
          clipping roof lines, which is exactly the cue that carries enclosure.
          object-bottom pins the photo's base to the frame's lower edge, so a
          crop always eats sky rather than the plaza floor — the ground plane
          and building bases carry the spatial cues participants judge by. The
          hover scale grows from that same edge to keep the base planted. */}
      <img
        src={src}
        alt={`View across ${site?.name}, ${site?.city}`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full origin-bottom object-cover object-bottom transition-transform duration-300 ease-out group-hover:scale-[1.03]"
      />
    </div>
  )
}

function PlanGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="absolute inset-0 h-full w-full text-line-strong"
      fill="none"
      stroke="currentColor"
    >
      <rect x="24" y="24" width="72" height="72" strokeWidth="1" />
      <rect x="42" y="42" width="36" height="36" strokeWidth="1" />
      <path d="M60 6v18M60 96v18M6 60h18M96 60h18" strokeWidth="1" />
    </svg>
  )
}

// ---- About you --------------------------------------------------------------

// Two quick demographic questions after the triplets: professional background
// (as before) and an optional age bracket — optional so it never costs a
// completed survey.
function About({ onSubmit, pending }) {
  const [background, setBackground] = useState(null) // 'yes' | 'no' | 'undisclosed'
  const [ageGroup, setAgeGroup] = useState(null) // bracket string or null

  return (
    <Frame>
      <div className="mx-auto w-full max-w-lg animate-page-in">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">Almost done</p>
        <h2 className="mt-3 text-pretty text-2xl font-semibold tracking-tight text-ink">
          Two quick questions about you
        </h2>
        <p className="mt-3 text-base text-ink-muted">
          They help us understand how training and age shape spatial judgement.
        </p>

        <fieldset className="mt-8">
          <legend className="text-sm font-medium text-ink">
            Do you have a background in architecture, urban design, or planning?
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Chip selected={background === 'yes'} disabled={pending} onClick={() => setBackground('yes')}>
              Yes
            </Chip>
            <Chip selected={background === 'no'} disabled={pending} onClick={() => setBackground('no')}>
              No
            </Chip>
            <Chip
              selected={background === 'undisclosed'}
              disabled={pending}
              onClick={() => setBackground('undisclosed')}
            >
              Prefer not to say
            </Chip>
          </div>
        </fieldset>

        <fieldset className="mt-7">
          <legend className="text-sm font-medium text-ink">
            Age group <span className="font-normal text-ink-faint">(optional)</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {AGE_GROUPS.map((g) => (
              <Chip
                key={g}
                selected={ageGroup === g}
                disabled={pending}
                onClick={() => setAgeGroup((prev) => (prev === g ? null : g))}
              >
                {g}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="mt-9 flex items-center gap-4">
          <button
            disabled={!background || pending}
            onClick={() => onSubmit(background, ageGroup)}
            className="w-full rounded-full bg-primary px-8 py-3 text-base font-medium text-white shadow-sm outline-none transition-all duration-150 enabled:hover:bg-primary-deep enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            {pending ? 'Saving…' : 'Finish'}
          </button>
        </div>
      </div>
    </Frame>
  )
}

// Selectable answer chip with a clear selected state (filled, with a check).
function Chip({ children, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-w-16 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium shadow-sm outline-none transition-all duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-wash disabled:opacity-50 ${
        selected
          ? 'border-primary bg-primary text-white'
          : 'border-line-strong bg-paper text-ink hover:border-primary hover:text-primary-deep'
      }`}
    >
      {selected && <LuCheck aria-hidden className="h-4 w-4" />}
      {children}
    </button>
  )
}

// ---- Done -------------------------------------------------------------------

function Done({ submitState }) {
  return (
    <Frame>
      <div className="mx-auto w-full max-w-md animate-page-in text-center">
        <div className="animate-pop-in mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-wash">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" fill="none" stroke="currentColor">
            <path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Thank you.</h2>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          {submitState === 'failed' || submitState === 'unconfigured'
            ? 'Something went wrong and your answers could not be saved. Please let the researcher know before closing this tab.'
            : 'Your responses have been recorded. They’ll help test how the geometry of a public square shapes the way it feels.'}
        </p>
        <p className="mt-8 font-mono text-xs text-ink-faint">You can close this tab.</p>
      </div>
    </Frame>
  )
}

// ---- Shared frame -----------------------------------------------------------

// Centers each stage in the viewport, but grows (and lets the root scroll) when
// a stage is taller than the screen — so nothing clips on short/mobile views.
function Frame({ children }) {
  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-10 sm:px-8">{children}</div>
  )
}
