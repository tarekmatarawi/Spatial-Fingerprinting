import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { LuCheck, LuListChecks, LuMove, LuTimer } from 'react-icons/lu'
import sites from '@/data/sites.json'
import { activeSites } from '@/lib/site'
import { PanoramaViewer } from '@/components/PanoramaViewer'
import {
  assemblePilotSurvey,
  panoramaUrl,
  panoramaOpeningYawDeg,
  PILOT_SURVEY_LENGTH,
  SURVEY_VERSION,
  PANORAMA_SETTINGS,
} from '@/lib/pilot360'
import { PILOT_360_ENDPOINT_URL } from '@/lib/pilot360Endpoint'
import readings from '@/data/results.json'
import { STATUS_COMPLETED, STATUS_IN_PROGRESS } from '@/lib/session'

// Panoramic pilot — the participant-facing survey.
//
// Deliberately a SEPARATE page from SurveyPage rather than a mode inside it.
// The original survey is collecting the primary dataset and must not change
// while this pilot runs; a shared component with a stimulus switch would put
// every pilot tweak one bug away from the real study.
//
// The response schema is identical to the main survey's, plus timing fields, so
// the existing analysis scripts read pilot records without special-casing.
// Storage is a separate collection — see PILOT_360_ENDPOINT_URL.

const INSTRUCTION =
  'Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Please judge based on the sense of space, not architectural style or surface materials.'

const AGE_GROUPS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+']

const ACTIVE = activeSites(sites)
const SITE_BY_ID = new Map(ACTIVE.map((s) => [s.id, s]))
const ALL_SITE_IDS = ACTIVE.map((s) => s.id)
const ENOUGH_SITES = ALL_SITE_IDS.length >= 3

// The 120° reading supplies each site's survey heading, used only to pick the
// panorama's opening view (and only where the image's north offset is known).
const READING_BY_SITE = new Map(
  readings.filter((r) => r.fov_mode === 'perceptual_120').map((r) => [r.site_id, r])
)

function newParticipantId() {
  return crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function Pilot360Survey() {
  const [stage, setStage] = useState('intro') // intro | survey | about | done
  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [submitState, setSubmitState] = useState('idle')
  const [missing, setMissing] = useState(() => new Set())

  const participantId = useRef(newParticipantId()).current
  const startedAt = useRef(new Date().toISOString()).current
  const revision = useRef(0)
  // When the current triplet first appeared — the basis for per-question timing.
  const shownAt = useRef(Date.now())

  const survey = useMemo(
    () => (ENOUGH_SITES ? assemblePilotSurvey(ALL_SITE_IDS, participantId) : []),
    [participantId]
  )

  const noteMissing = useCallback((url) => {
    setMissing((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }, [])

  const saveSession = useCallback(
    async (answers, { completed = false, background = null, ageGroup = null } = {}) => {
      const payload = {
        participant_id: participantId,
        survey_version: SURVEY_VERSION,
        started_at: startedAt,
        updated_at: new Date().toISOString(),
        finished_at: completed ? new Date().toISOString() : null,
        status: completed ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
        revision: ++revision.current,
        // No attention check in the pilot. The field is kept so the record shape
        // matches the main survey exactly; null means "never asked", which is
        // what the existing readers already treat as neither pass nor fail.
        attention_check_passed: null,
        background,
        age_group: ageGroup,
        // Framing constants travel with the data: a pilot about framing is not
        // interpretable later without knowing what the framing actually was.
        stimulus: {
          kind: 'equirectangular_panorama',
          hfov_deg: PANORAMA_SETTINGS.HFOV_DEG,
          pitch_limit_deg: PANORAMA_SETTINGS.PITCH_LIMIT_DEG,
          zoom_enabled: false,
          autorotate: false,
        },
        responses: answers,
      }

      try {
        if (import.meta.env.DEV) {
          const res = await fetch('/__save-pilot-360', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(String(res.status))
          return 'saved'
        }
        if (!PILOT_360_ENDPOINT_URL) return 'unconfigured'
        await fetch(PILOT_360_ENDPOINT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        })
        return 'saved'
      } catch {
        return 'failed'
      }
    },
    [participantId, startedAt]
  )

  function handleChoice(chosenPair) {
    const triplet = survey[index]
    const [a, b, c] = triplet.site_ids
    const now = Date.now()
    const answer = {
      participant_id: participantId,
      triplet_id: triplet.triplet_id,
      order: triplet.order,
      site_a: a,
      site_b: b,
      site_c: c,
      chosen_pair: chosenPair,
      is_attention_check: false,
      // Pilot-specific: how long this comparison took. Panning is expected to
      // cost more than glancing at a photo, and knowing how much is the point.
      shown_at: new Date(shownAt.current).toISOString(),
      answered_at: new Date(now).toISOString(),
      duration_ms: now - shownAt.current,
      timestamp: new Date(now).toISOString(),
    }
    const next = [...responses, answer]
    setResponses(next)
    saveSession(next)
    shownAt.current = Date.now()
    if (index + 1 < survey.length) setIndex((i) => i + 1)
    else setStage('about')
  }

  const submit = useCallback(
    async (background, ageGroup) => {
      setSubmitState('saving')
      const state = await saveSession(responses, { completed: true, background, ageGroup })
      setSubmitState(state)
      setStage('done')
    },
    [saveSession, responses]
  )

  if (!ENOUGH_SITES) {
    return (
      <Frame>
        <p className="text-sm text-ink-muted">This pilot is not open yet.</p>
      </Frame>
    )
  }

  if (stage === 'intro') {
    return <Intro onBegin={() => { shownAt.current = Date.now(); setStage('survey') }} missing={missing} />
  }

  if (stage === 'survey') {
    return (
      <Round
        key={survey[index].triplet_id}
        triplet={survey[index]}
        position={index + 1}
        total={survey.length}
        onChoice={handleChoice}
        onMissing={noteMissing}
      />
    )
  }

  if (stage === 'about') return <About onSubmit={submit} pending={submitState === 'saving'} />

  return <Done submitState={submitState} />
}

function Intro({ onBegin, missing }) {
  return (
    <Frame>
      <p className="font-mono text-xs font-medium tracking-wide text-primary">
        Panoramic pilot · {PILOT_SURVEY_LENGTH} comparisons
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        Which two of these spaces feel most alike?
      </h1>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">{INSTRUCTION}</p>

      <div className="mt-6 space-y-3 rounded-xl border border-line bg-paper p-5">
        <Point icon={LuMove}>
          Each square is a <strong className="font-medium text-ink">360° panorama</strong>. Drag
          left or right to look around — you can turn the whole way in either direction.
        </Point>
        <Point icon={LuListChecks}>
          Pick the <strong className="font-medium text-ink">two</strong> that feel most similar,
          then the next set appears.
        </Point>
        <Point icon={LuTimer}>
          {PILOT_SURVEY_LENGTH} comparisons, then two short questions about you. There are no right
          answers.
        </Point>
      </div>

      {missing.size > 0 && (
        <p className="mt-4 font-mono text-xs text-redline">
          {missing.size} panorama{missing.size === 1 ? '' : 's'} could not be loaded.
        </p>
      )}

      <button
        onClick={onBegin}
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        Begin
      </button>
    </Frame>
  )
}

function Point({ icon: Icon, children }) {
  return (
    <p className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  )
}

function Round({ triplet, position, total, onChoice, onMissing }) {
  const [selected, setSelected] = useState([])

  function toggle(i) {
    setSelected((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i)
      if (prev.length === 2) return [prev[1], i]
      return [...prev, i]
    })
  }

  const ready = selected.length === 2

  function confirm() {
    if (!ready) return
    const ids = selected.map((i) => triplet.site_ids[i])
    onChoice(ids)
    setSelected([])
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-xs text-ink-faint">
            {position} of {total}
          </p>
          <p className="font-mono text-xs text-ink-faint">drag any panorama to look around</p>
        </div>
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(position / total) * 100}%` }}
          />
        </div>

        <h2 className="mt-5 max-w-prose text-base leading-relaxed text-ink">
          Which <strong className="font-semibold">two</strong> of these three spaces feel most
          similar in how open, enclosed, or spatially complex they feel?
        </h2>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {triplet.site_ids.map((id, i) => (
            <PlazaPanorama
              key={id}
              site={SITE_BY_ID.get(id)}
              selected={selected.includes(i)}
              order={selected.indexOf(i) + 1}
              onToggle={() => toggle(i)}
              onMissing={onMissing}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={confirm}
            disabled={!ready}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuCheck aria-hidden className="h-4 w-4" />
            {ready ? 'Confirm these two' : 'Select two'}
          </button>
          <p className="font-mono text-xs text-ink-faint">
            {selected.length} of 2 selected
          </p>
        </div>
      </div>
    </div>
  )
}

function PlazaPanorama({ site, selected, order, onToggle, onMissing }) {
  const url = panoramaUrl(site)
  const yaw = panoramaOpeningYawDeg(site, READING_BY_SITE.get(site?.id))

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-paper transition-all duration-150 ${
        selected ? 'border-primary ring-2 ring-primary-wash' : 'border-line'
      }`}
    >
      {/* The viewer owns pointer drags, so selection lives on its own control
          below rather than on the image — otherwise every look-around would
          register as a click. */}
      <PanoramaViewer
        url={url}
        label={site?.name ?? 'Unknown square'}
        openingYawDeg={yaw}
        onError={onMissing}
        className="aspect-[4/3] w-full"
      />
      <button
        onClick={onToggle}
        aria-pressed={selected}
        className={`flex w-full items-center justify-between gap-3 border-t px-4 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-wash ${
          selected ? 'border-primary/30 bg-primary-wash/40' : 'border-line hover:bg-surface'
        }`}
      >
        <span className="text-sm font-medium text-ink">{site?.name ?? 'Unknown square'}</span>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
            selected
              ? 'border-primary bg-primary text-white'
              : 'border-line-strong text-ink-faint'
          }`}
        >
          {selected ? order : ''}
        </span>
      </button>
    </div>
  )
}

function About({ onSubmit, pending }) {
  const [background, setBackground] = useState(null)
  const [ageGroup, setAgeGroup] = useState(null)

  return (
    <Frame>
      <p className="font-mono text-xs font-medium tracking-wide text-primary">Almost done</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Two quick questions</h1>

      <fieldset className="mt-7">
        <legend className="text-sm text-ink">
          Do you have a background in architecture, urban design, or planning?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
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

      <fieldset className="mt-6">
        <legend className="text-sm text-ink">Age group (optional)</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {AGE_GROUPS.map((g) => (
            <Chip key={g} selected={ageGroup === g} disabled={pending} onClick={() => setAgeGroup(g)}>
              {g}
            </Chip>
          ))}
        </div>
      </fieldset>

      <button
        onClick={() => onSubmit(background, ageGroup)}
        disabled={pending}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        {pending ? 'Submitting…' : 'Finish'}
      </button>
    </Frame>
  )
}

function Chip({ children, selected, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-1.5 text-sm outline-none transition-all duration-150 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash ${
        selected
          ? 'border-primary bg-primary-wash/60 text-ink'
          : 'border-line-strong bg-paper text-ink-muted hover:border-primary hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Done({ submitState }) {
  return (
    <Frame>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-wash">
        <LuCheck aria-hidden className="h-6 w-6 text-primary-deep" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Thank you</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        Your responses have been recorded. You can close this tab.
      </p>
      {submitState === 'failed' && (
        <p className="mt-4 font-mono text-xs text-redline">
          The final submission could not be sent. Earlier answers were saved as you went.
        </p>
      )}
      {submitState === 'unconfigured' && (
        <p className="mt-4 font-mono text-xs text-redline">
          No pilot storage endpoint is configured, so this session was not saved.
        </p>
      )}
    </Frame>
  )
}

function Frame({ children }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">{children}</div>
    </div>
  )
}
