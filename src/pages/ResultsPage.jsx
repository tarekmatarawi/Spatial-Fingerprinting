import {
  LuChartColumn,
  LuFlaskConical,
  LuLink2,
  LuNetwork,
  LuRadar,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuTimer,
  LuUsersRound,
} from 'react-icons/lu'
import responses from '@/data/survey-responses.json'
import isovistReadings from '@/data/results.json'
import { phaseById } from '@/lib/phases'

// The researcher's command center: survey response quality today, with clearly
// labeled berths for the Phase 5/6 analyses (fitted weights, hypothesis tests,
// clustering) so the page grows into the study instead of being rebuilt for it.
// Reads src/data/survey-responses.json — the same file the dev-server endpoint
// appends to — so it's current on every reload while collecting locally.

// An attention check repeats one plaza twice; a pass is choosing that pair,
// which stores as a chosen_pair of two identical ids.
function participantStats(record) {
  const checks = (record.responses ?? []).filter((r) => r.is_attention_check)
  const passed = checks.filter((r) => r.chosen_pair?.[0] === r.chosen_pair?.[1]).length
  const started = new Date(record.started_at).getTime()
  const finished = new Date(record.finished_at).getTime()
  const durationS =
    Number.isFinite(started) && Number.isFinite(finished) && finished >= started
      ? Math.round((finished - started) / 1000)
      : null
  return {
    id: record.participant_id,
    answered: (record.responses ?? []).length,
    checks: checks.length,
    passed,
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

const BACKGROUND_LABELS = {
  yes: 'Design background',
  no: 'No design background',
  undisclosed: 'Not disclosed',
}

export function ResultsPage() {
  const phase = phaseById.get('results')
  const participants = responses.map(participantStats)

  const totalAnswers = participants.reduce((s, p) => s + p.answered, 0)
  const totalChecks = participants.reduce((s, p) => s + p.checks, 0)
  const totalPassed = participants.reduce((s, p) => s + p.passed, 0)
  const passRate = totalChecks ? Math.round((totalPassed / totalChecks) * 100) : null
  const medianDuration = median(participants.map((p) => p.durationS))

  const backgroundSplit = ['yes', 'no', 'undisclosed'].map((key) => ({
    label: BACKGROUND_LABELS[key],
    count: participants.filter((p) => p.background === key).length,
  }))
  const ageLabels = [...new Set(participants.map((p) => p.ageGroup).filter(Boolean))].sort()
  const ageSplit = [
    ...ageLabels.map((label) => ({
      label,
      count: participants.filter((p) => p.ageGroup === label).length,
    })),
    { label: 'Not given', count: participants.filter((p) => !p.ageGroup).length },
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
          <p className="font-mono text-xs text-ink-faint">reads src/data/survey-responses.json</p>
        </div>

        {participants.length === 0 ? (
          <EmptySurvey />
        ) : (
          <>
            {/* Vital signs */}
            <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                icon={LuUsersRound}
                label="Participants"
                value={participants.length}
                detail={`${totalAnswers} triplet judgements`}
              />
              <Stat
                icon={LuShieldCheck}
                label="Attention checks passed"
                value={passRate == null ? '—' : `${passRate}%`}
                detail={`${totalPassed} of ${totalChecks} checks`}
              />
              <Stat
                icon={LuTimer}
                label="Median completion"
                value={formatDuration(medianDuration)}
                detail="from first screen to submit"
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
                        <th className="px-3 py-2 text-right font-medium">Answers</th>
                        <th className="px-3 py-2 text-right font-medium">Checks</th>
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
                          <td className="px-3 py-2 text-right">{p.answered}</td>
                          <td
                            className={`px-3 py-2 text-right ${
                              p.checks > 0 && p.passed < p.checks ? 'text-redline' : 'text-ok'
                            }`}
                          >
                            {p.passed}/{p.checks}
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
                  A failed check (red) flags a submission for exclusion from the perceptual fit.
                </p>
              </section>

              <aside className="space-y-6">
                <section>
                  <SectionHeading>Background</SectionHeading>
                  <BreakdownBars rows={backgroundSplit} total={participants.length} />
                </section>
                <section>
                  <SectionHeading>Age group</SectionHeading>
                  <BreakdownBars rows={ageSplit} total={participants.length} />
                </section>
              </aside>
            </div>
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
