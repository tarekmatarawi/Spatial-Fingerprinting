import { useState } from 'react'
import { LuArrowRight, LuCheck, LuCopy, LuExternalLink, LuLink2 } from 'react-icons/lu'
import responses from '@/data/survey-responses.json'
import { SURVEY_LENGTH, ATTENTION_CHECKS } from '@/lib/triplets'
import { phaseById } from '@/lib/phases'

// Researcher-side launch panel for Phase 4 (the P4 tab). The survey itself is
// participant-facing and lives at ?survey; here the researcher copies that link
// and opens a preview. Instrument-grade to match the admin/viewer surfaces.
export function SurveyLaunch() {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${import.meta.env.BASE_URL}?survey`
  const phase = phaseById.get('survey')

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-primary">
          <phase.icon aria-hidden className="h-4 w-4" />
          {phase.code}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Participant survey</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          A triplet-comparison study: each participant sees {SURVEY_LENGTH} rounds of three squares
          and marks the two that feel most similar, then answers two optional demographic
          questions. {ATTENTION_CHECKS} of the rounds are attention checks. Responses save to{' '}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px] text-ink">
            src/data/survey-responses.json
          </code>{' '}
          while running locally.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <label className="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
            <LuLink2 aria-hidden className="h-3.5 w-3.5" />
            Participant link
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="input min-w-0 flex-1 font-mono text-[13px]"
            />
            <button
              onClick={copy}
              className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium shadow-sm outline-none transition-all duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-wash ${
                copied
                  ? 'border-ok/40 bg-ok-wash text-ok'
                  : 'border-line-strong bg-paper text-ink hover:border-primary hover:text-primary-deep'
              }`}
            >
              {copied ? (
                <LuCheck aria-hidden className="h-4 w-4" />
              ) : (
                <LuCopy aria-hidden className="h-4 w-4" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2.5 text-xs text-ink-faint">
            Share this with participants. It opens the survey full-screen — intro, comparisons,
            two demographic questions, thank-you — with no researcher controls and no way into
            the rest of the platform.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a
            href={link}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <LuExternalLink aria-hidden className="h-4 w-4" />
            Open preview
          </a>
          <a
            href="#/results"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted underline-offset-4 outline-none transition-colors duration-150 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            {responses.length} {responses.length === 1 ? 'submission' : 'submissions'} collected —
            review in Results
            <LuArrowRight aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-faint">
          Deploy note: on the static/hosted build the local save endpoint isn&rsquo;t present —
          swap in a serverless function (e.g. a Vercel route) at <code className="font-mono">/__save-survey</code>{' '}
          to collect responses from remote participants.
        </p>
      </div>
    </div>
  )
}
