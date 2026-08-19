import { LuArrowLeft, LuClock, LuRefreshCw, LuTimer, LuUsersRound, LuImageOff } from 'react-icons/lu'
import sites from '@/data/sites.json'
import { activeSites } from '@/lib/site'
import { usePilot360Responses } from '@/lib/pilot360Data'
import { expectedPanoramas, PILOT_SURVEY_LENGTH, SURVEY_VERSION, PANORAMA_SETTINGS } from '@/lib/pilot360'
import { sessionStatus, STATUS_COMPLETED, STATUS_LABELS } from '@/lib/session'

// Panoramic pilot — the researcher's review surface.
//
// This pilot exists to answer two practical questions before any powered run:
// how long does a panoramic comparison actually take, and where do people give
// up. So this page reports timing and drop-off, not findings. It deliberately
// shows no weights, no accuracy and no hypothesis — 10 participants cannot
// support them, and putting them here would invite reading them anyway.

const PANORAMAS = expectedPanoramas(activeSites(sites))

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function secs(ms) {
  if (ms == null) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

function mins(ms) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function Pilot360Review() {
  const { records, refresh, loading, source, readAt } = usePilot360Responses()

  const sessions = records.map((r) => {
    const answers = r.responses ?? []
    const durations = answers.map((a) => a.duration_ms).filter((d) => Number.isFinite(d))
    const started = new Date(r.started_at).getTime()
    const last = new Date(r.updated_at ?? r.started_at).getTime()
    return {
      id: r.participant_id,
      status: sessionStatus(r),
      answered: answers.length,
      medianPerQuestion: median(durations),
      totalActive: durations.reduce((s, d) => s + d, 0),
      wallClock: Number.isFinite(started) && Number.isFinite(last) ? last - started : null,
      // Where someone stopped, for the drop-off column.
      stoppedAt: answers.length < PILOT_SURVEY_LENGTH ? answers.length + 1 : null,
      background: r.background ?? null,
      durations,
    }
  })

  const completed = sessions.filter((s) => s.status === STATUS_COMPLETED)
  const dropped = sessions.filter((s) => s.status !== STATUS_COMPLETED)
  const allDurations = sessions.flatMap((s) => s.durations)
  const medianQ = median(allDurations)
  const medianSession = median(completed.map((s) => s.wallClock))

  // Per-question-position medians: does panning fatigue set in, and where?
  const byPosition = Array.from({ length: PILOT_SURVEY_LENGTH }, (_, i) => {
    const at = sessions
      .map((s) => s.durations[i])
      .filter((d) => Number.isFinite(d))
    return { position: i + 1, median: median(at), n: at.length }
  })
  const slowest = Math.max(1, ...byPosition.map((b) => b.median ?? 0))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong pb-4">
          <div>
            <p className="font-mono text-xs font-medium tracking-wide text-primary">
              Pilot · {SURVEY_VERSION}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              Panoramic pilot review
            </h1>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
              Feasibility and burden only — how long a panoramic comparison takes and where people
              stop. Kept separate from the main survey dataset.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-sm outline-none transition-all duration-150 hover:border-primary hover:text-primary-deep active:scale-[0.97] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-wash"
            >
              <LuRefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Reading…' : 'Refresh'}
            </button>
            <p className="font-mono text-xs text-ink-faint">
              {source === 'live'
                ? `src/data/pilot-360-responses.json · read ${readAt?.toLocaleTimeString() ?? 'just now'}`
                : 'build-time snapshot — run npm run dev for live reads'}
            </p>
          </div>
        </div>

        <PanoramaCoverage />

        {sessions.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
            <p className="font-mono text-xs tracking-wide text-ink-faint">NO PILOT SESSIONS YET</p>
            <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
              Share the pilot link and responses will appear here. Each session is saved after every
              answer, so a participant who stops halfway still leaves their timings behind.
            </p>
          </div>
        ) : (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                icon={LuUsersRound}
                label="Sessions"
                value={sessions.length}
                detail={`${completed.length} completed · ${dropped.length} incomplete`}
              />
              <Stat
                icon={LuTimer}
                label="Median per comparison"
                value={secs(medianQ)}
                detail={`${allDurations.length} timed answers`}
              />
              <Stat
                icon={LuClock}
                label="Median session"
                value={mins(medianSession)}
                detail={`${PILOT_SURVEY_LENGTH} comparisons, completed only`}
              />
              <Stat
                icon={LuImageOff}
                label="Framing"
                value={`${PANORAMA_SETTINGS.HFOV_DEG}° hFOV`}
                detail={`pitch ±${PANORAMA_SETTINGS.PITCH_LIMIT_DEG}° · zoom off`}
              />
            </dl>

            <section className="mt-9">
              <SectionHeading>Time per question position</SectionHeading>
              <p className="mt-1 font-mono text-xs text-ink-faint">
                Rising times toward the end would indicate fatigue rather than difficulty.
              </p>
              <div className="mt-4 space-y-1.5">
                {byPosition.map((b) => (
                  <div key={b.position} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-faint">
                      {b.position}
                    </span>
                    <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-surface">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: b.median ? `${(b.median / slowest) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-xs text-ink-muted">
                      {secs(b.median)}
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-faint">
                      n={b.n}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-9">
              <SectionHeading>Sessions</SectionHeading>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-paper">
                <table className="w-full border-collapse text-left font-mono text-xs text-ink">
                  <thead>
                    <tr className="border-b border-line text-ink-muted">
                      <th className="px-3 py-2 font-medium">Participant</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Answered</th>
                      <th className="px-3 py-2 text-right font-medium">Stopped at</th>
                      <th className="px-3 py-2 text-right font-medium">Median/q</th>
                      <th className="px-3 py-2 text-right font-medium">Session</th>
                      <th className="px-3 py-2 font-medium">Background</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b border-line/60 last:border-b-0">
                        <td className="px-3 py-2 text-ink-muted" title={s.id}>
                          {String(s.id).slice(0, 8)}
                        </td>
                        <td
                          className={`px-3 py-2 ${
                            s.status === STATUS_COMPLETED ? 'text-ink' : 'text-ink-faint'
                          }`}
                        >
                          {STATUS_LABELS[s.status]}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.answered}
                          <span className="text-ink-faint">/{PILOT_SURVEY_LENGTH}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-redline">
                          {s.stoppedAt ? `Q${s.stoppedAt}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">{secs(s.medianPerQuestion)}</td>
                        <td className="px-3 py-2 text-right">{mins(s.wallClock)}</td>
                        <td className="px-3 py-2 text-ink-muted">{s.background ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 font-mono text-xs text-ink-faint">
                &ldquo;Stopped at&rdquo; is the question a participant did not answer. Partial
                sessions keep every answer given before that point.
              </p>
            </section>
          </>
        )}

        <a
          href="#/"
          className="mt-10 inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted underline-offset-2 outline-none transition-colors duration-150 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          <LuArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Back to the overview
        </a>
      </div>
    </div>
  )
}

// Which sites still need a panorama uploaded, and which have no declared north
// offset. Both block a clean pilot, and neither is visible from the data alone.
function PanoramaCoverage() {
  const uncalibrated = PANORAMAS.filter((p) => !p.calibrated)

  return (
    <section className="mt-6 rounded-xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">Panorama coverage</h2>
        <p className="font-mono text-xs text-ink-faint">
          {PANORAMAS.length} active sites · expected in <code>public/panoramas/</code>
        </p>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
        A file is only confirmed missing when the survey tries to load it, so this lists what is
        expected rather than what is present. Upload each as{' '}
        <code className="font-mono text-xs">public/panoramas/&lt;slug&gt;.jpg</code> — the same slug
        as that site&rsquo;s static photo.
      </p>

      {uncalibrated.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-bg px-4 py-3">
          <p className="font-mono text-xs text-ink">
            {uncalibrated.length} of {PANORAMAS.length} sites have no{' '}
            <code>pano_north_offset_deg</code>
          </p>
          <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">
            An equirectangular image has an arbitrary yaw origin, so without this each panorama
            opens at its own image centre rather than a shared compass heading. That is consistent
            and reproducible, but it is <em>not</em> the same view direction across plazas. Set the
            field on each site in <code>sites.json</code> to the compass bearing of its image&rsquo;s
            centre column to align them.
          </p>
        </div>
      )}

      <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {PANORAMAS.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-2 font-mono text-xs">
            <span className="truncate text-ink-muted">{p.name}</span>
            <span className={p.calibrated ? 'shrink-0 text-ok' : 'shrink-0 text-ink-faint'}>
              {p.calibrated ? 'aligned' : 'centre'}
            </span>
          </li>
        ))}
      </ul>
    </section>
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

function SectionHeading({ children }) {
  return (
    <h2 className="border-b border-line-strong pb-2 text-base font-semibold tracking-tight text-ink">
      {children}
    </h2>
  )
}
