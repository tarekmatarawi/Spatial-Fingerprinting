import { LuArrowLeft } from 'react-icons/lu'
import { phaseTitle } from '@/lib/phases'

// The berth a planned phase occupies until it is built. It exists so the
// workflow reads as all nine phases from the start — a station that is honestly
// empty is more useful than one that is missing, because it tells the
// researcher (and a supervisor being shown the tool) what is coming and in what
// order. It deliberately shows no numbers, no charts, and no "coming soon"
// marketing: just the phase's own description and what it is waiting on.
//
// `standalone` renders it without the researcher shell, for a participant-
// facing survey link that has been shared before the survey exists.
export function PhasePlaceholder({ phase, standalone = false }) {
  if (!phase) return null

  const body = (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
      <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-primary">
        <phase.icon aria-hidden className="h-4 w-4" />
        {phase.code}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{phaseTitle(phase)}</h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{phase.blurb}</p>

      <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-paper/60 px-5 py-6">
        <p className="font-mono text-xs tracking-wide text-ink-faint">NOT BUILT YET</p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
          {standalone
            ? 'This survey has not opened yet. The link is reserved so it can be shared in advance — check back once the study begins.'
            : 'This phase has its place in the workflow but no implementation behind it. Phases are built one at a time, in order, with a validation gate between each.'}
        </p>
      </div>

      {!standalone && (
        <a
          href="#/"
          className="mt-8 inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted underline-offset-2 outline-none transition-colors duration-150 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          <LuArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Back to the overview
        </a>
      )}
    </div>
  )

  if (!standalone) return <div className="h-full overflow-y-auto">{body}</div>

  return <div className="min-h-screen bg-bg">{body}</div>
}
