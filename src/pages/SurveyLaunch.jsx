import { useState } from 'react'
import { LuArrowRight, LuCheck, LuCopy, LuExternalLink, LuLink2 } from 'react-icons/lu'
import responses from '@/data/survey-responses-360.json'
import { TRIPLET_COUNT, RATING_SCALES } from '@/lib/survey360'
import { phaseById } from '@/lib/phases'

// Researcher-side launch panel for P3 (the P3 tab). The survey itself is
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
          Two tasks, in order. First {TRIPLET_COUNT} rounds of three plazas shown as navigable
          360° panoramas, where the participant marks the two that feel most similar — this is
          what the perceptual weights are fitted on. Then a semantic-differential block rating
          each plaza they saw on {RATING_SCALES.length} plain-language scales, which tests whether
          each metric is independently perceptible rather than only in competition with the
          others. Two optional demographic questions close the session. Each answer saves as
          it&rsquo;s given, so an abandoned session keeps whatever the participant got through.
          Responses save to{' '}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-[13px] text-ink">
            src/data/survey-responses-360.json
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
            {responses.length} {responses.length === 1 ? 'session' : 'sessions'} recorded — review
            in Results
            <LuArrowRight aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-faint">
          Deploy note: on the static/hosted build the local save endpoint isn&rsquo;t present —
          the local save endpoint isn&rsquo;t present. Remote submissions go to the Google Apps
          Script Web App configured in <code className="font-mono">src/lib/surveyEndpoint.js</code>{' '}
          — see <code className="font-mono">docs/survey-360-storage-setup.md</code>.
        </p>
      </div>
    </div>
  )
}
