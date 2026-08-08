import {
  LuChartColumn,
  LuFlaskConical,
  LuLink2,
  LuNetwork,
  LuRadar,
  LuRefreshCw,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuTimer,
  LuUsersRound,
} from 'react-icons/lu'
import isovistReadings from '@/data/results.json'
import sites from '@/data/sites.json'
import { CoveragePanel } from '@/components/CoveragePanel'
import { phaseById } from '@/lib/phases'
import { activeSites } from '@/lib/site'
import { SURVEY_LENGTH, TARGET_PARTICIPANTS } from '@/lib/triplets'
import { useSurveyResponses } from '@/lib/surveyData'
import {
  recordAttentionCheckPassed,
  sessionStatus,
  STATUS_ABANDONED,
  STATUS_COMPLETED,
  STATUS_LABELS,
} from '@/lib/session'

// The researcher's command center: survey response quality today, with clearly
// labeled berths for the Phase 5/6 analyses (fitted weights, hypothesis tests,
// clustering) so the page grows into the study instead of being rebuilt for it.
// Reads src/data/survey-responses.json — the same file the dev-server endpoint
// appends to — so it's current on every reload while collecting locally.

// Sessions are saved after every answer, so a record here may be a survey still
// being taken, one someone walked away from, or a finished one — sessionStatus
// tells them apart (see src/lib/session.js). Partial records are kept and shown,
// never discarded; they're just labelled.
function participantStats(record) {
  const started = new Date(record.started_at).getTime()
  const finished = new Date(record.finished_at).getTime()
  const durationS =
    Number.isFinite(started) && Number.isFinite(finished) && finished >= started
      ? Math.round((finished - started) / 1000)
      : null
  return {
    id: record.participant_id,
    answered: (record.responses ?? []).length,
    // true / false / null — null while the mid-survey check is still ahead.
    attentionPassed: recordAttentionCheckPassed(record),
    status: sessionStatus(record),
    durationS,
    background: record.background ?? 'undisclosed',
    ageGroup: record.age_group ?? null,
    finishedAt: record.finished_at,
  }
}

function formatDuration(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')} min`
}

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2)
}

// Coverage is only meaningful over the sites still in the study — an excluded
// plaza never reaches a participant again, so its pairs can't fill in.
const ACTIVE_SITES = activeSites(sites)

const BACKGROUND_LABELS = {
  yes: 'Design background',
  no: 'No design background',
  undisclosed: 'Not disclosed',
}

export function ResultsPage() {
  const phase = phaseById.get('results')
  // One read feeds both the session table and the coverage panel, so the two
  // can never disagree about how much data has come in.
  const { records: responses, refresh, loading, source, readAt } = useSurveyResponses()
  const participants = responses.map(participantStats)

  const totalAnswers = participants.reduce((s, p) => s + p.answered, 0)
  const completed = participants.filter((p) => p.status === STATUS_COMPLETED)
  const abandoned = participants.filter((p) => p.status === STATUS_ABANDONED)

  // One attention check per session now, so the pass rate counts sessions, not
  // checks. Sessions that stopped before reaching the check are left out of
  // both sides — they neither passed nor failed it.
  const checked = participants.filter((p) => p.attentionPassed != null)
  const passedCheck = checked.filter((p) => p.attentionPassed)
  const passRate = checked.length
    ? Math.round((passedCheck.length / checked.length) * 100)
    : null
  // Only finished sessions have a meaningful start-to-submit duration.
  const medianDuration = median(completed.map((p) => p.durationS))

  // Demographics are asked at the very end, so only completed sessions can
  // answer them — counting abandoned ones would inflate "not disclosed".
  const backgroundSplit = ['yes', 'no', 'undisclosed'].map((key) => ({
    label: BACKGROUND_LABELS[key],
    count: completed.filter((p) => p.background === key).length,
  }))
  const ageLabels = [...new Set(completed.map((p) => p.ageGroup).filter(Boolean))].sort()
  const ageSplit = [
    ...ageLabels.map((label) => ({
      label,
      count: completed.filter((p) => p.ageGroup === label).length,
    })),
    { label: 'Not given', count: completed.filter((p) => !p.ageGroup).length },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong pb-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-primary">
              <phase.icon aria-hidden className="h-4 w-4" />
              {phase.code}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Results</h1>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
              Survey response quality today; fitted weights, hypothesis tests, and clustering take
              their places here as Phases 5–6 unlock.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-sm outline-none transition-all duration-150 hover:border-primary hover:text-primary-deep active:scale-[0.97] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash"
            >
              <LuRefreshCw
                aria-hidden
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              {loading ? 'Reading…' : 'Refresh'}
            </button>
            <p className="font-mono text-xs text-ink-faint">
              {source === 'live'
                ? `src/data/survey-responses.json · read ${readAt?.toLocaleTimeString() ?? 'just now'}`
                : 'build-time snapshot — run npm run dev for live reads'}
            </p>
          </div>
        </div>

        {participants.length === 0 ? (
          <EmptySurvey />
        ) : (
          <>
            {/* Vital signs */}
            <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                icon={LuUsersRound}
                label="Sessions"
                value={participants.length}
                detail={`${completed.length} completed · ${totalAnswers} triplet judgements`}
              />
              <Stat
                icon={LuShieldCheck}
                label="Attention check passed"
                value={passRate == null ? '—' : `${passRate}%`}
                detail={`${passedCheck.length} of ${checked.length} who reached it`}
              />
              <Stat
                icon={LuTimer}
                label="Median completion"
                value={formatDuration(medianDuration)}
                detail={
                  abandoned.length
                    ? `${abandoned.length} abandoned, partials kept`
                    : 'from first screen to submit'
                }
              />
              <Stat
                icon={LuRadar}
                label="Isovist readings"
                value={isovistReadings.length}
                detail={
                  <a
                    href="#/viewer"
                    className="underline-offset-2 outline-none transition-colors duration-150 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash"
                  >
                    saved in the 3D viewer
                  </a>
                }
              />
            </dl>

            {/* Participants + breakdowns */}
            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <section className="min-w-0">
                <SectionHeading>Submissions</SectionHeading>
                <div className="overflow-x-auto rounded-xl border border-line bg-paper">
                  <table className="w-full border-collapse text-left font-mono text-xs text-ink">
                    <thead>
                      <tr className="border-b border-line text-ink-muted">
                        <th className="px-3 py-2 font-medium">Participant</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Answers</th>
                        <th className="px-3 py-2 text-right font-medium">Check</th>
                        <th className="px-3 py-2 text-right font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium">Background</th>
                        <th className="px-3 py-2 font-medium">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p) => (
                        <tr key={p.id} className="border-b border-line/60 last:border-b-0">
                          <td className="px-3 py-2 text-ink-muted" title={p.id}>
                            {p.id.slice(0, 8)}
                          </td>
                          <td
                            className={`px-3 py-2 ${
                              p.status === STATUS_COMPLETED ? 'text-ink' : 'text-ink-faint'
                            }`}
                          >
                            {STATUS_LABELS[p.status]}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.answered}
                            <span className="text-ink-faint">/{SURVEY_LENGTH}</span>
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              p.attentionPassed === false
                                ? 'text-redline'
                                : p.attentionPassed
                                  ? 'text-ok'
                                  : 'text-ink-faint'
                            }`}
                          >
                            {p.attentionPassed == null
                              ? 'not reached'
                              : p.attentionPassed
                                ? 'passed'
                                : 'failed'}
                          </td>
                          <td className="px-3 py-2 text-right">{formatDuration(p.durationS)}</td>
                          <td className="px-3 py-2">{BACKGROUND_LABELS[p.background] ?? '—'}</td>
                          <td className="px-3 py-2">{p.ageGroup ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 font-mono text-xs text-ink-faint">
                  A failed check (red) flags a session for exclusion from the perceptual fit.
                  Abandoned sessions keep every answer given before the participant left.
                </p>
              </section>

              <aside className="space-y-6">
                <section>
                  <SectionHeading>Background</SectionHeading>
                  <BreakdownBars rows={backgroundSplit} total={completed.length} />
                </section>
                <section>
                  <SectionHeading>Age group</SectionHeading>
                  <BreakdownBars rows={ageSplit} total={completed.length} />
                </section>
                <p className="font-mono text-xs text-ink-faint">
                  Asked after the last comparison — completed sessions only.
                </p>
              </aside>
            </div>

            {/* Pooled coverage — the empirical check on the sampling assumption */}
            <section className="mt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-strong pb-2">
                <h2 className="text-base font-semibold tracking-tight text-ink">
                  Pooled coverage
                </h2>
                <p className="font-mono text-xs text-ink-faint">
                  across all sessions · attention checks excluded
                </p>
              </div>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
                Each participant&rsquo;s triplets are drawn independently, with no coordination
                between participants — so even coverage of all {ACTIVE_SITES.length} plazas and
                the {(ACTIVE_SITES.length * (ACTIVE_SITES.length - 1)) / 2} pairs between them is
                expected to emerge across the target {TARGET_PARTICIPANTS.label} participants
                rather than being enforced per session. This is where that expectation gets
                checked against the responses actually collected.
              </p>
              <div className="mt-5">
                <CoveragePanel records={responses} sites={ACTIVE_SITES} />
              </div>
            </section>
          </>
        )}

        {/* Berths for the analyses to come — labeled, honest, phase-gated */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-2">
            <h2 className="text-base font-semibold tracking-tight text-ink">As the study matures</h2>
            <p className="font-mono text-xs text-ink-faint">phase-gated · not yet computed</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Upcoming
              icon={LuSlidersHorizontal}
              phase="Phase 5"
              title="Fitted metric weights"
              text="Maximum-likelihood weights for area, compactness, occlusivity, and enclosure — fitted against the triplet responses."
            />
            <Upcoming
              icon={LuFlaskConical}
              phase="Phase 6"
              title="Hypothesis tests H1–H3"
              text="Does the weighted metric predict perceived similarity better than chance, than equal weights, than area alone?"
            />
            <Upcoming
              icon={LuNetwork}
              phase="Phase 6"
              title="Perceptual clustering"
              text="The plaza taxonomy, re-clustered with perceptually calibrated distances."
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Icon aria-hidden className="h-3.5 w-3.5 text-primary" />
        {label}
      </dt>
      <dd className="mt-1.5 font-mono text-2xl text-ink">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-faint">{detail}</dd>
    </div>
  )
}

// Single-measure categorical breakdown: every row direct-labeled with count and
// share, an accent fill on a quiet track — a readable list first, a chart second.
function BreakdownBars({ rows, total }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const pct = total ? Math.round((row.count / total) * 100) : 0
        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-muted">{row.label}</span>
              <span className="shrink-0 font-mono text-ink">
                {row.count} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Upcoming({ icon: Icon, phase, title, text }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-bg text-ink-faint">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <span className="font-mono text-xs text-ink-faint">{phase}</span>
      </div>
      <h3 className="mt-3 text-sm font-medium text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{text}</p>
    </div>
  )
}

function EmptySurvey() {
  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-line bg-paper px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-bg text-ink-faint">
        <LuChartColumn aria-hidden className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">No responses yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
          Once participants complete the survey, their counts, attention-check pass rates, and
          demographics appear here.
        </p>
      </div>
      <a
        href="#/survey"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <LuLink2 aria-hidden className="h-4 w-4" />
        Get the participant link
      </a>
    </div>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 className="mb-3 border-b border-line pb-1.5 text-sm font-semibold text-ink">{children}</h2>
  )
}
