import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { LuCheck, LuListChecks, LuMove, LuTimer, LuSlidersHorizontal } from 'react-icons/lu'
import sites from '@/data/sites.json'
import { activeSites } from '@/lib/site'
import { PanoramaViewer } from '@/components/PanoramaViewer'
import {
  assembleSurvey,
  panoramaUrl,
  panoramaOpeningYawDeg,
  ratingSitesFor,
  anchorDirections,
  anchorLabel,
  RATING_SCALES,
  RATING_MIN,
  RATING_MAX,
  TRIPLET_COUNT,
  SURVEY_VERSION,
  TASK_TRIPLET,
  TASK_RATING,
  PANORAMA_SETTINGS,
} from '@/lib/survey360'
import { SURVEY_ENDPOINT_URL } from '@/lib/surveyEndpoint'
import readings from '@/data/results.json'
import { STATUS_COMPLETED, STATUS_IN_PROGRESS } from '@/lib/session'

// P3 — the participant-facing perceptual survey.
//
// Two tasks in a fixed order: TRIPLET_COUNT panoramic triplet comparisons,
// then a semantic-differential rating of every plaza that participant saw.
// The order is load-bearing — see src/lib/survey360.js.
//
// No attention check: the panoramic task is slow enough that a repeated-plaza
// screen is both obvious and costly, and the earlier static survey's check
// discriminated nobody across 50 participants.

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

export function SurveyPage() {
  const [stage, setStage] = useState('intro') // intro | survey | ratings | about | done
  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [ratings, setRatings] = useState([])
  const [submitState, setSubmitState] = useState('idle')
  const [missing, setMissing] = useState(() => new Set())

  const participantId = useRef(newParticipantId()).current
  const startedAt = useRef(new Date().toISOString()).current
  const revision = useRef(0)
  // When the current triplet first appeared — the basis for per-question timing.
  const shownAt = useRef(Date.now())

  const survey = useMemo(
    () => (ENOUGH_SITES ? assembleSurvey(ALL_SITE_IDS, participantId) : []),
    [participantId]
  )

  // Only the plazas this participant actually saw, shuffled for them alone.
  const ratingSites = useMemo(() => ratingSitesFor(survey, participantId), [survey, participantId])
  // Which way round each scale is drawn, fixed for the whole session.
  const anchors = useMemo(() => anchorDirections(participantId), [participantId])
  const [ratingIndex, setRatingIndex] = useState(0)

  const noteMissing = useCallback((url) => {
    setMissing((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }, [])

  const saveSession = useCallback(
    async (answers, ratingAnswers, { completed = false, background = null, ageGroup = null } = {}) => {
      const payload = {
        participant_id: participantId,
        survey_version: SURVEY_VERSION,
        started_at: startedAt,
        updated_at: new Date().toISOString(),
        finished_at: completed ? new Date().toISOString() : null,
        status: completed ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
        revision: ++revision.current,
        // No attention check. The field is kept so the record shape matches the
        // archived static-photo dataset; null means "never asked", which every
        // reader already treats as neither pass nor fail.
        attention_check_passed: null,
        background,
        age_group: ageGroup,
        // Framing constants travel with the data: a study about framing is not
        // interpretable later without knowing what the framing actually was.
        stimulus: {
          kind: 'equirectangular_panorama',
          hfov_deg: PANORAMA_SETTINGS.HFOV_DEG,
          pitch_limit_up_deg: PANORAMA_SETTINGS.PITCH_LIMIT_UP_DEG,
          pitch_limit_down_deg: PANORAMA_SETTINGS.PITCH_LIMIT_DOWN_DEG,
          zoom_enabled: false,
          autorotate: false,
        },
        responses: answers,
        // The rating block, kept as its own array rather than mixed into
        // `responses`: it is a different task with a different unit (one row per
        // site per scale, not one per comparison) and must stay separable in any
        // export. Linked by participant_id.
        rating_responses: ratingAnswers,
        // Which plazas this participant was asked to rate. Sets differ between
        // people because triplets overlap, so per-site coverage has to be
        // checked across the sample rather than assumed.
        rated_site_ids: ratingSites,
        anchor_directions: Object.fromEntries(
          Object.entries(anchors).map(([k, v]) => [k, anchorLabel(v)])
        ),
        tasks: [TASK_TRIPLET, TASK_RATING],
      }

      try {
        if (import.meta.env.DEV) {
          const res = await fetch('/__save-survey-360', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(String(res.status))
          return 'saved'
        }
        if (!SURVEY_ENDPOINT_URL) return 'unconfigured'
        await fetch(SURVEY_ENDPOINT_URL, {
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
    [participantId, startedAt, ratingSites, anchors]
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
      // How long this comparison took. Panning costs far more than glancing at
      // a photo, so burden has to be measured rather than assumed.
      shown_at: new Date(shownAt.current).toISOString(),
      answered_at: new Date(now).toISOString(),
      duration_ms: now - shownAt.current,
      timestamp: new Date(now).toISOString(),
    }
    const next = [...responses, answer]
    setResponses(next)
    saveSession(next, ratings)
    shownAt.current = Date.now()
    if (index + 1 < survey.length) setIndex((i) => i + 1)
    else setStage('ratings')
  }

  // One site's four scales, submitted together.
  function handleRating(siteId, values) {
    const now = Date.now()
    const rows = RATING_SCALES.map((scale) => ({
      participant_id: participantId,
      site_id: siteId,
      scale: scale.id,
      // Always canonical: 1 is the `low` anchor however the row was drawn.
      value: values[scale.id],
      presentation_order: ratingIndex,
      anchor_direction: anchorLabel(anchors[scale.id]),
      task_type: TASK_RATING,
      shown_at: new Date(shownAt.current).toISOString(),
      answered_at: new Date(now).toISOString(),
      duration_ms: now - shownAt.current,
    }))
    const next = [...ratings, ...rows]
    setRatings(next)
    saveSession(responses, next)
    shownAt.current = Date.now()
    if (ratingIndex + 1 < ratingSites.length) setRatingIndex((i) => i + 1)
    else setStage('about')
  }

  const submit = useCallback(
    async (background, ageGroup) => {
      setSubmitState('saving')
      const state = await saveSession(responses, ratings, { completed: true, background, ageGroup })
      setSubmitState(state)
      setStage('done')
    },
    [saveSession, responses, ratings]
  )

  if (!ENOUGH_SITES) {
    return (
      <Frame>
        <p className="text-sm text-ink-muted">This survey is not open yet.</p>
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

  if (stage === 'ratings') {
    const siteId = ratingSites[ratingIndex]
    return (
      <RatingRound
        key={siteId}
        site={SITE_BY_ID.get(siteId)}
        anchors={anchors}
        position={ratingIndex + 1}
        total={ratingSites.length}
        onSubmit={(values) => handleRating(siteId, values)}
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
        Perceptual survey · two short tasks
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
        <Point icon={LuSlidersHorizontal}>
          Then you&rsquo;ll describe each square you saw on a few simple scales — how open it
          felt, how enclosed, and so on.
        </Point>
        <Point icon={LuTimer}>
          {TRIPLET_COUNT} comparisons, the ratings, then two short questions about you. Around
          15 minutes. There are no right answers.
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
    <div className="h-full overflow-y-auto bg-bg">
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

// One plaza, rated on all four scales at once.
//
// All four on a single screen rather than one per screen: the participant keeps
// a single panorama in front of them as their reference for every judgement,
// which is the point of rating a place rather than an image. It also keeps the
// block near five minutes instead of fifteen — and the one unambiguous finding
// from the earlier run was that panning is what costs time.
//
// The panorama stays fully interactive here, on the same settings as the triplet
// task, so a participant can look again before committing to a rating.
function RatingRound({ site, anchors, position, total, onSubmit, onMissing }) {
  const [values, setValues] = useState({})
  const complete = RATING_SCALES.every((s) => values[s.id] != null)

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-xs text-ink-faint">
            Rating {position} of {total}
          </p>
          <p className="font-mono text-xs text-ink-faint">drag the panorama to look around</p>
        </div>
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(position / total) * 100}%` }}
          />
        </div>

        <h2 className="mt-5 flex items-center gap-2 text-base leading-relaxed text-ink">
          <LuSlidersHorizontal aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          How would you describe <strong className="font-semibold">this space</strong>?
        </h2>

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-paper">
          <PanoramaViewer
            url={panoramaUrl(site)}
            label={site?.name ?? 'Unknown square'}
            openingYawDeg={panoramaOpeningYawDeg(site, READING_BY_SITE.get(site?.id))}
            onError={onMissing}
            // Same aspect as the triplet panels, deliberately: HFOV is fixed at
            // 75° everywhere, but the VERTICAL slice a viewer shows depends on
            // its aspect ratio too. A wider rating panel here (16:7 was tried)
            // drops the vertical FOV from ~60° to ~37° — a real optical zoom-in
            // with no way to undo it, since zoom is disabled by design. Matching
            // the triplet aspect keeps the framing controlled across the whole
            // survey, not just across the 18 sites within one task.
            className="aspect-[4/3] w-full"
          />
          <p className="border-t border-line px-4 py-2.5 text-sm font-medium text-ink">
            {site?.name ?? 'Unknown square'}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {RATING_SCALES.map((scale) => (
            <ScaleRow
              key={scale.id}
              scale={scale}
              reversed={anchors[scale.id]}
              value={values[scale.id]}
              onChange={(v) => setValues((prev) => ({ ...prev, [scale.id]: v }))}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 pb-8">
          <button
            onClick={() => complete && onSubmit(values)}
            disabled={!complete}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuCheck aria-hidden className="h-4 w-4" />
            {position === total ? 'Finish ratings' : 'Next square'}
          </button>
          <p className="font-mono text-xs text-ink-faint">
            {RATING_SCALES.filter((s) => values[s.id] != null).length} of {RATING_SCALES.length} answered
          </p>
        </div>
      </div>
    </div>
  )
}

// One bipolar 7-point row.
//
// `reversed` only flips how it is DRAWN. The value handed back is always on the
// canonical scale — 1 is the scale's `low` anchor either way — so the stored
// data never needs unflipping and a mistake there cannot silently invert a
// metric.
function ScaleRow({ scale, reversed, value, onChange }) {
  const leftLabel = reversed ? scale.high : scale.low
  const rightLabel = reversed ? scale.low : scale.high
  const points = []
  for (let i = RATING_MIN; i <= RATING_MAX; i++) points.push(i)
  const drawn = reversed ? points.slice().reverse() : points

  return (
    <fieldset className="rounded-xl border border-line bg-paper p-4">
      <legend className="sr-only">
        {leftLabel} to {rightLabel}
      </legend>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span className="max-w-[42%] text-left">{leftLabel}</span>
        <span className="max-w-[42%] text-right">{rightLabel}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1.5">
        {drawn.map((point) => (
          <button
            key={point}
            type="button"
            onClick={() => onChange(point)}
            aria-pressed={value === point}
            aria-label={`${point} of ${RATING_MAX}, ${leftLabel} to ${rightLabel}`}
            className={`h-9 flex-1 rounded-lg border text-sm font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary-wash ${
              value === point
                ? 'border-primary bg-primary text-white'
                : 'border-line-strong bg-bg text-ink-faint hover:border-primary hover:text-ink'
            }`}
          >
            {value === point ? '●' : ''}
          </button>
        ))}
      </div>
    </fieldset>
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
          No storage endpoint is configured, so this session was not saved.
        </p>
      )}
    </Frame>
  )
}

function Frame({ children }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [])
  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">{children}</div>
    </div>
  )
}
