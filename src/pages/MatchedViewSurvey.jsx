import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowLeft, LuCheck, LuEye, LuTimer } from 'react-icons/lu'

import sites from '@/data/sites.json'
import bankFile from '@/data/matched-view-trials.json'
import { activeSites, projectSite } from '@/lib/site'
import { MATCHED_VIEW_ENDPOINT_URL } from '@/lib/surveyEndpoint'
import { STATUS_COMPLETED, STATUS_IN_PROGRESS } from '@/lib/session'
import {
  BLOCK_LENGTH,
  MATCHED_VIEW_VERSION,
  TASK_MATCHED_VIEW,
  assembleMatchedViewBlock,
  validateTrialBank,
} from '@/lib/matchedView'

// The renderer carries Three.js, so it loads on demand — the intro screen
// paints before the engine arrives.
const ViewRender = lazy(() =>
  import('@/components/ViewRender').then((m) => ({ default: m.ViewRender }))
)

// P8 — the participant-facing matched-view survey (?matched-view-survey).
//
// Chrome-free and standalone, the same arrangement as P3: someone who follows
// the link sees the task and nothing else, never the researcher navigation.
//
// BUILT FOR SPEED. The whole instrument is twelve judgements and takes two to
// three minutes, and the interface is shaped around that rather than around
// P3's more deliberate pace:
//
//   - ONE TAP PER TRIAL. Choosing a candidate records the answer and advances.
//     P3's select-then-confirm step exists because picking two of three
//     panoramas is a composite action that can be got wrong halfway; picking
//     one of two is not, and a confirm button would double the clicks for no
//     protection. A misclick is instead handled by the Back control, which is
//     cheaper than making every correct answer pay for the rare wrong one.
//   - NO SCROLLING. All three views fit one screen, so a trial is judged in a
//     single glance rather than by scrolling between the reference and the
//     candidates and holding the first in memory.
//   - THE CANVASES ARE NEVER REMOUNTED. The three renderers stay mounted for
//     the whole session and only their props change. Keying them by trial would
//     tear down and rebuild three WebGL contexts on every answer, which on a
//     phone is both slow and a real risk of losing a context outright.
//
// The stimulus is the frozen trial bank, not a live computation. Every
// participant judges trials whose predictions were fixed before anyone saw
// them — see lib/matchedView.js and scripts/build-matched-view-trials.mjs.

const ACTIVE = activeSites(sites)
const SITE_BY_ID = new Map(ACTIVE.map((s) => [s.id, s]))

// Validated at module load rather than trusted. A malformed bank should stop
// the survey with a plain message, not collect answers to trials that cannot be
// scored afterwards.
let BANK = null
let BANK_ERROR = null
try {
  BANK = validateTrialBank(bankFile)
} catch (err) {
  BANK_ERROR = String(err.message || err)
}

const INSTRUCTION =
  'You will see one space at the top and two below it. Pick the one below that feels more like the space above — in how open, enclosed, or spatially complex it feels, not in style or materials.'

function newParticipantId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `mv-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Geometry is projected once per plaza and cached for the session. Without this
// every trial would re-project three sites' full footprint sets — the same work
// repeated twelve times over on a phone.
const geometryCache = new Map()
function geometryFor(siteId) {
  if (geometryCache.has(siteId)) return geometryCache.get(siteId)
  let geometry = null
  try {
    const site = SITE_BY_ID.get(siteId)
    if (site) geometry = projectSite(site)
  } catch {
    geometry = null
  }
  geometryCache.set(siteId, geometry)
  return geometry
}

export function MatchedViewSurvey() {
  const [stage, setStage] = useState('intro') // intro | trials | about | done
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [submitState, setSubmitState] = useState('idle')

  const participantId = useRef(newParticipantId()).current
  const startedAt = useRef(new Date().toISOString()).current
  const revision = useRef(0)
  const shownAt = useRef(Date.now())

  const block = useMemo(
    () => (BANK ? assembleMatchedViewBlock(BANK, participantId) : []),
    [participantId]
  )

  const saveSession = useCallback(
    async (rows, { completed = false, background = null } = {}) => {
      const payload = {
        participant_id: participantId,
        survey_version: MATCHED_VIEW_VERSION,
        task: TASK_MATCHED_VIEW,
        started_at: startedAt,
        updated_at: new Date().toISOString(),
        finished_at: completed ? new Date().toISOString() : null,
        status: completed ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
        revision: ++revision.current,
        background,
        // Which bank the answers were given against. The analysis compares this
        // to the bank it is reading, so a rebuilt bank shows up as stale records
        // rather than as answers quietly rescored against predictions the
        // participant never saw.
        bank_version: BANK?.version ?? null,
        bank_generated_at: BANK?.generated_at ?? null,
        stimulus: {
          kind: 'rendered_massing_view',
          fov_deg: BANK?.trials?.[0]?.reference?.fov_deg ?? 120,
          eye_height_m: 1.6,
          textures: false,
        },
        responses: rows,
      }

      try {
        if (import.meta.env.DEV) {
          const res = await fetch('/__save-matched-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error(String(res.status))
          return 'saved'
        }
        if (!MATCHED_VIEW_ENDPOINT_URL) return 'unconfigured'
        await fetch(MATCHED_VIEW_ENDPOINT_URL, {
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

  // One answer. Recorded with everything needed to score it without the bank —
  // the predictions that were live, and which candidate sat on the left — so a
  // stored session stays interpretable on its own.
  const answer = useCallback(
    (chosenSide) => {
      const { trial, order, leftSide } = block[index]
      const now = Date.now()
      const row = {
        participant_id: participantId,
        trial_id: trial.trial_id,
        order,
        stratum: trial.stratum,
        reference_site: trial.reference.site_id,
        candidate_a_site: trial.candidates[0].site_id,
        candidate_b_site: trial.candidates[1].site_id,
        chosen_side: chosenSide,
        left_side: leftSide,
        predictions: trial.predictions,
        shown_at: new Date(shownAt.current).toISOString(),
        answered_at: new Date(now).toISOString(),
        duration_ms: now - shownAt.current,
        timestamp: new Date(now).toISOString(),
      }
      // Replaces rather than appends when the participant has stepped back, so
      // going back and re-answering leaves one answer per trial instead of two
      // contradictory ones.
      const next = answers.filter((a) => a.trial_id !== trial.trial_id).concat(row)
      next.sort((p, q) => p.order - q.order)
      setAnswers(next)
      saveSession(next)
      shownAt.current = Date.now()
      if (index + 1 < block.length) setIndex((i) => i + 1)
      else setStage('about')
    },
    [answers, block, index, participantId, saveSession]
  )

  const submit = useCallback(
    async (background) => {
      setSubmitState('saving')
      setSubmitState(await saveSession(answers, { completed: true, background }))
      setStage('done')
    },
    [answers, saveSession]
  )

  if (BANK_ERROR) {
    return (
      <Frame>
        <p className="text-sm text-ink-muted">This survey is not open yet.</p>
        <p className="mt-3 font-mono text-xs text-redline">{BANK_ERROR}</p>
      </Frame>
    )
  }
  if (!block.length) {
    return (
      <Frame>
        <p className="text-sm text-ink-muted">This survey is not open yet.</p>
      </Frame>
    )
  }

  if (stage === 'intro') {
    return (
      <Intro
        onBegin={() => {
          shownAt.current = Date.now()
          setStage('trials')
        }}
      />
    )
  }

  if (stage === 'trials') {
    return (
      <Trial
        entry={block[index]}
        position={index + 1}
        total={block.length}
        onAnswer={answer}
        onBack={
          index > 0
            ? () => {
                shownAt.current = Date.now()
                setIndex((i) => i - 1)
              }
            : null
        }
      />
    )
  }

  if (stage === 'about') return <About onSubmit={submit} pending={submitState === 'saving'} />

  return <Done submitState={submitState} />
}

function Intro({ onBegin }) {
  return (
    <Frame>
      <p className="font-mono text-xs font-medium tracking-wide text-primary">
        One short task · {BLOCK_LENGTH} comparisons
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        Which space feels more alike?
      </h1>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">{INSTRUCTION}</p>

      <div className="mt-6 space-y-3 rounded-xl border border-line bg-paper p-5">
        <Point icon={LuEye}>
          The views are <strong className="font-medium text-ink">plain grey models</strong> of real
          city squares — no colours, signs, or materials, so only the shape of the space is left to
          judge.
        </Point>
        <Point icon={LuTimer}>
          {BLOCK_LENGTH} comparisons, about two minutes. One tap each, and there are no right
          answers.
        </Point>
      </div>

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

// One trial: reference above, two candidates below, on one screen.
//
// The whole thing is sized in viewport units so it never scrolls — a
// comparison judged by scrolling back and forth is a memory test, not a
// perceptual one. The reference gets the larger frame because everything else
// is judged against it.
function Trial({ entry, position, total, onAnswer, onBack }) {
  const { trial, leftSide } = entry

  // Screen order. `leftSide` names which of the bank's two candidates is drawn
  // on the left for this participant on this trial; the stored answer records
  // the bank side, never the screen position.
  const left = leftSide === 'a' ? trial.candidates[0] : trial.candidates[1]
  const right = leftSide === 'a' ? trial.candidates[1] : trial.candidates[0]
  const leftKey = leftSide
  const rightKey = leftSide === 'a' ? 'b' : 'a'

  // Keyboard shortcuts, for anyone taking this on a laptop: left/right arrows
  // or 1/2. A twelve-trial task is quicker with hands on the keyboard, and it
  // costs nothing to support.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft' || e.key === '1') onAnswer(leftKey)
      else if (e.key === 'ArrowRight' || e.key === '2') onAnswer(rightKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer, leftKey, rightKey])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex shrink-0 items-baseline justify-between gap-4">
          <p className="font-mono text-xs text-ink-faint">
            {position} of {total}
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 font-mono text-xs text-ink-faint outline-none transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-wash"
            >
              <LuArrowLeft aria-hidden className="h-3 w-3" />
              back
            </button>
          )}
        </div>
        <div className="mt-1.5 h-0.5 w-full shrink-0 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(position / total) * 100}%` }}
          />
        </div>

        <Suspense
          fallback={
            <p className="mt-6 font-mono text-xs text-ink-faint">Preparing the views…</p>
          }
        >
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <figure className="flex min-h-0 flex-[1.15] flex-col">
              <figcaption className="mb-1 shrink-0 text-center font-mono text-xs tracking-wide text-ink-faint">
                this space
              </figcaption>
              <Stimulus view={trial.reference} className="min-h-0 flex-1" />
            </figure>

            <p className="shrink-0 text-center text-sm text-ink">
              Which one below feels <strong className="font-semibold">more like it</strong>?
            </p>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
              <Choice view={left} label="1" onSelect={() => onAnswer(leftKey)} />
              <Choice view={right} label="2" onSelect={() => onAnswer(rightKey)} />
            </div>
          </div>
        </Suspense>
      </div>
    </div>
  )
}

// A candidate, as one large tap target.
//
// The whole panel is the button rather than a control beneath it — unlike P3,
// where the panorama owned pointer drags and selection had to live elsewhere.
// These renders are static, so nothing competes for the tap.
function Choice({ view, label, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="group flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-paper text-left outline-none transition-all duration-150 hover:border-primary hover:shadow-sm active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary-wash"
    >
      <Stimulus view={view} className="min-h-0 flex-1" />
      <span className="flex shrink-0 items-center justify-center gap-2 border-t border-line px-3 py-2 transition-colors duration-150 group-hover:bg-primary-wash/40">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] text-ink-faint transition-colors duration-150 group-hover:border-primary group-hover:text-primary">
          {label}
        </span>
        <span className="text-sm text-ink-muted transition-colors duration-150 group-hover:text-ink">
          this one
        </span>
      </span>
    </button>
  )
}

// One rendered view.
//
// The plaza is never named and no metrics are shown. A participant who could
// read "Alexanderplatz" would be judging a place they may know rather than the
// space in front of them, and a visible number would tell them what the study
// expects.
function Stimulus({ view, className = '' }) {
  const geometry = geometryFor(view.site_id)
  if (!geometry) {
    return (
      <div className={`flex items-center justify-center rounded-md border border-line bg-surface ${className}`}>
        <p className="font-mono text-xs text-ink-faint">view unavailable</p>
      </div>
    )
  }
  return (
    <ViewRender
      geometry={geometry}
      vantage={{ x: view.local_x, y: view.local_y }}
      headingDeg={view.direction_deg}
      fovDeg={view.fov_deg ?? 120}
      className={className}
    />
  )
}

function About({ onSubmit, pending }) {
  const [background, setBackground] = useState(null)
  return (
    <Frame>
      <p className="font-mono text-xs font-medium tracking-wide text-primary">Last step</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">One quick question</h1>

      {/* One question, not P3's two. The instrument is two minutes long and a
          demographic block would be a noticeable share of it; background is
          kept because whether trained designers judge differently is a real
          question about the result, and age is not. */}
      <fieldset className="mt-7">
        <legend className="text-sm text-ink">
          Do you have a background in architecture, urban design, or planning?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['yes', 'Yes'],
            ['no', 'No'],
            ['undisclosed', 'Prefer not to say'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setBackground(value)}
              disabled={pending}
              aria-pressed={background === value}
              className={`rounded-full border px-4 py-1.5 text-sm outline-none transition-all duration-150 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash ${
                background === value
                  ? 'border-primary bg-primary-wash/60 text-ink'
                  : 'border-line-strong bg-paper text-ink-muted hover:border-primary hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        onClick={() => onSubmit(background)}
        disabled={pending}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        {pending ? 'Submitting…' : 'Finish'}
      </button>
    </Frame>
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
        Your answers have been recorded. You can close this tab.
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
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">{children}</div>
    </div>
  )
}
