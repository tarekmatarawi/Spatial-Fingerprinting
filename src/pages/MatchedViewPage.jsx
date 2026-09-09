import { Suspense, lazy, useMemo, useState } from 'react'
import { LuExternalLink, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu'

import sites from '@/data/sites.json'
import bankFile from '@/data/matched-view-trials.json'
import { Figure } from '@/components/Figure'
import { activeSites, projectSite } from '@/lib/site'
import { useMatchedViewResponses } from '@/lib/matchedViewData'
import {
  CANVAS_W,
  COOL,
  GRID,
  INK,
  MUTED,
  NEG,
  OK,
  PAPER,
  RULE,
  TYPE,
} from '@/components/charts/tokens'
import {
  BLOCK_LENGTH,
  PREDICTORS,
  PREDICTOR_LABELS,
  STRATA,
  TRIALS_PER_STRATUM,
} from '@/lib/matchedView'
import { analyseMatchedView } from '@/lib/analysis/matchedView'

const ViewRender = lazy(() =>
  import('@/components/ViewRender').then((m) => ({ default: m.ViewRender }))
)

// P8 — the researcher's read on the matched-view validation survey.
//
// The page is laid out in the order the argument has to be made:
//
//   1. what the instrument IS — the frozen bank, previewable as a real trial
//   2. how much data has come in, and what was excluded
//   3. the two strata's accuracies, each against chance
//   4. the adjudication between the three measures, paired
//   5. the margin curve — the instrument's own sanity check
//   6. the methods disclosure
//
// Everything on it is computed in the browser from the bank and the responses.
// That is cheap here (a few thousand trials through exact binomials) and it
// means the numbers move the moment a response lands, which is what a
// researcher watching a study fill up actually needs.

const ACTIVE = activeSites(sites)
const SITE_BY_ID = new Map(ACTIVE.map((s) => [s.id, s]))

const STRATUM_COPY = {
  agreement: {
    title: 'Agreement trials',
    blurb:
      'On these trials, all three measures (Centroid, Gaussian, and Chamfer) predicted the same candidate before any participant saw the trial. This stratum is the baseline check: if participants cannot beat chance (50%) even where every measure agrees, the framework as a whole has nothing to stand on, and the discriminating stratum below would not be worth reading.',
  },
  discriminating: {
    title: 'Discriminating trials',
    blurb:
      'On these trials, Chamfer predicted one candidate while Centroid and Gaussian both predicted the other. This is the stratum that actually adjudicates between the measures: since the predictions genuinely disagree, whichever one participants side with more often is direct evidence for that measure over the others.',
  },
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const pval = (p) =>
  p == null ? '—' : p < 0.001 ? p.toExponential(1) : p.toFixed(3)

export function MatchedViewPage() {
  const { records, refresh, loading, source, readAt } = useMatchedViewResponses()
  const result = useMemo(() => analyseMatchedView(records, bankFile), [records])

  const hasData = result.n_rows > 0

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-xs font-medium tracking-wide text-primary">
            P8 · Matched-View Validation
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Do people agree with the views Chamfer matches?
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
            P7 produced three distance measures (Centroid, Gaussian, Chamfer), each predicting which
            view in one plaza most resembles a view in another — but purely from geometry, never
            checked against a human judgement. This page puts those predictions in front of real
            participants as a two-alternative forced-choice task, and scores their answers against
            all three measures at once, so the question here is not just &ldquo;is the model
            right,&rdquo; but &ldquo;which version of it is.&rdquo;
          </p>
        </header>

        <BankSummary result={result} />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="?matched-view-survey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm outline-none transition-all duration-150 hover:bg-primary-deep active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuExternalLink aria-hidden className="h-4 w-4" />
            Open the participant survey
          </a>
          {import.meta.env.DEV && (
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm text-ink-muted outline-none transition-colors duration-150 hover:border-primary hover:text-primary disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary-wash"
            >
              <LuRefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Reload responses
            </button>
          )}
          <p className="font-mono text-xs text-ink-faint">
            {source === 'live' ? 'live from disk' : 'bundled snapshot'}
            {readAt ? ` · read ${readAt.toLocaleTimeString()}` : ''}
          </p>
        </div>

        <Provenance result={result} />

        {hasData ? (
          <>
            {STRATA.map((stratum) => (
              <StratumPanel key={stratum} data={result.strata[stratum]} />
            ))}
            <Adjudication result={result} />
            <MarginCurve result={result} />
            <PerTrialTable result={result} />
          </>
        ) : (
          <EmptyState />
        )}

        <TrialPreview />
        <Methods result={result} />
      </div>
    </div>
  )
}

// What the instrument is, before any result.
function BankSummary({ result }) {
  const counts = useMemo(() => {
    const out = { agreement: 0, discriminating: 0 }
    for (const t of bankFile.trials) out[t.stratum]++
    return out
  }, [])

  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-line bg-paper p-5 sm:grid-cols-4">
      <Stat label="trial bank" value={`${bankFile.trials.length} trials`} note={`${counts.agreement} agreement · ${counts.discriminating} discriminating`} />
      <Stat label="trials per participant" value={`${BLOCK_LENGTH}`} note={`${TRIALS_PER_STRATUM} per stratum, ~2 min`} />
      <Stat label="participants" value={String(result.n_participants)} note={`${result.n_rows} judgements collected`} />
      <Stat
        label="bank frozen on"
        value={bankFile.generated_at ? bankFile.generated_at.slice(0, 10) : '—'}
        note="fixed for the study's duration"
      />
    </dl>
  )
}

function Stat({ label, value, note }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {note && <dd className="font-mono text-[11px] text-ink-faint">{note}</dd>}
    </div>
  )
}

// Responses that could not be scored, and why. Never silent.
function Provenance({ result }) {
  if (!result.orphaned.length && !result.stale.length) return null
  return (
    <div className="mt-5 rounded-lg border border-redline/40 bg-redline/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <LuTriangleAlert aria-hidden className="h-4 w-4 text-redline" />
        Responses excluded from every figure below
      </p>
      <ul className="mt-2 space-y-1 text-sm text-ink-muted">
        {result.orphaned.length > 0 && (
          <li>
            <strong className="font-medium text-ink">{result.orphaned.length}</strong> answer(s) name
            a trial the current bank does not contain — the bank was rebuilt after they were
            collected, so the prediction they were tested against no longer exists.
          </li>
        )}
        {result.stale.length > 0 && (
          <li>
            <strong className="font-medium text-ink">{result.stale.length}</strong> answer(s) carry
            predictions that disagree with the current bank&rsquo;s. The trial id still resolves, but
            it no longer means what it meant when it was answered, so it is not rescored.
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">
        Rebuilding the bank mid-study invalidates the answers already collected against it. If this
        is showing, either restore the earlier bank or treat those sessions as a separate wave.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-paper p-6">
      <h2 className="text-sm font-semibold text-ink">No responses yet</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        The instrument and its analysis are built and tested — <code className="font-mono text-xs">npm run matched-view:selftest</code>{' '}
        confirms the scoring recovers a planted answer and holds its size under a random-responding
        null. What is missing is people. Open the participant link above to take it yourself, or
        deploy the storage endpoint and circulate it.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every figure on this page appears as soon as the first session lands. Nothing below is
        simulated or placeholder — an empty study shows as empty.
      </p>
    </div>
  )
}

// One stratum's accuracies, three measures side by side.
function StratumPanel({ data }) {
  const copy = STRATUM_COPY[data.stratum]
  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold text-ink">{copy.title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">{copy.blurb}</p>
      <p className="mt-2 font-mono text-xs text-ink-faint">
        {data.n_trials} judgements from {data.n_participants} participant
        {data.n_participants === 1 ? '' : 's'}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-semibold">Measure</th>
              <th className="py-2 pr-3 text-right font-semibold">Accuracy</th>
              <th className="py-2 pr-3 font-semibold">95% CI</th>
              <th className="py-2 pr-3 text-right font-semibold">p (pooled)</th>
              <th className="py-2 pr-3 text-right font-semibold">Mean per person</th>
              <th className="py-2 pr-3 text-right font-semibold">Above / below</th>
              <th className="py-2 text-right font-semibold">p (sign test)</th>
            </tr>
          </thead>
          <tbody>
            {PREDICTORS.map((p) => {
              const s = data.predictors[p]
              const sig = s.pooled.p_value < 0.05
              return (
                <tr key={p} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{PREDICTOR_LABELS[p]}</td>
                  <td className={`py-2 pr-3 text-right font-mono tabular-nums ${sig ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                    {pct(s.accuracy)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs tabular-nums text-ink-faint">
                    {pct(s.pooled.ci.low)} – {pct(s.pooled.ci.high)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">
                    {pval(s.pooled.p_value)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">
                    {pct(s.participant_level.mean_accuracy)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-faint">
                    {s.participant_level.above} / {s.participant_level.below}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink-muted">
                    {pval(s.participant_level.p_value)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AccuracyChart data={data} />

      <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-ink-faint">
        <strong className="font-medium text-ink-muted">Accuracy</strong> is the share of judgements
        that matched a measure&rsquo;s prediction; the <strong className="font-medium text-ink-muted">95% CI</strong>{' '}
        (confidence interval) is the range the true accuracy plausibly falls in — an interval
        crossing 50% means the data cannot yet distinguish that measure from chance. The{' '}
        <strong className="font-medium text-ink-muted">p-value</strong> is the probability of seeing
        a result this far from chance if the measure were in fact no better than a coin flip; below
        0.05 is the conventional line for "probably not luck." The pooled p-value treats every
        judgement as independent, which it is not — one participant answers{' '}
        {TRIALS_PER_STRATUM} of these — so that column overstates confidence. The{' '}
        <strong className="font-medium text-ink-muted">sign test</strong>, which gives each person
        one vote regardless of how many trials they answered, is the more defensible of the two and
        is reported alongside rather than instead, so nothing is hidden.
      </p>
    </section>
  )
}

// Accuracy with its interval, against the 50% line.
function AccuracyChart({ data }) {
  const W = CANVAS_W
  const H = 150
  const left = 96
  const right = 40
  const plotW = W - left - right
  const x = (v) => left + v * plotW
  const rowY = (i) => 44 + i * 32

  return (
    <Figure
      title={`${STRATUM_COPY[data.stratum].title} — accuracy against chance`}
      caption="Each measure's share of judgements that matched its prediction, with a 95% Wilson interval. An interval crossing the 50% line is a measure the data cannot distinguish from guessing."
      filename={`p8-accuracy-${data.stratum}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <rect width={W} height={H} fill={PAPER} />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={x(v)} y1={30} x2={x(v)} y2={rowY(PREDICTORS.length - 1) + 14} stroke={v === 0.5 ? RULE : GRID} strokeWidth={v === 0.5 ? 1.25 : 1} />
            <text x={x(v)} y={22} textAnchor="middle" {...TYPE.tick}>
              {`${v * 100}%`}
            </text>
          </g>
        ))}
        <text x={x(0.5)} y={H - 8} textAnchor="middle" {...TYPE.annotation}>
          chance
        </text>

        {PREDICTORS.map((p, i) => {
          const s = data.predictors[p]
          if (s.accuracy == null) return null
          const clears = s.pooled.ci.low > 0.5 || s.pooled.ci.high < 0.5
          const colour = !clears ? MUTED : s.accuracy > 0.5 ? OK : NEG
          return (
            <g key={p}>
              <text x={left - 10} y={rowY(i) + 4} textAnchor="end" {...TYPE.markLabel}>
                {PREDICTOR_LABELS[p]}
              </text>
              <line
                x1={x(s.pooled.ci.low)}
                y1={rowY(i)}
                x2={x(s.pooled.ci.high)}
                y2={rowY(i)}
                stroke={colour}
                strokeWidth={2}
                opacity={0.55}
              />
              <circle cx={x(s.accuracy)} cy={rowY(i)} r={5} fill={colour} />
              <text x={x(s.pooled.ci.high) + 8} y={rowY(i) + 4} {...TYPE.annotation} fill={INK}>
                {pct(s.accuracy)}
              </text>
            </g>
          )
        })}
      </svg>
    </Figure>
  )
}

// The paired comparison — the phase's actual question.
function Adjudication({ result }) {
  const disc = result.strata.discriminating
  const pairs = [
    ['chamfer_vs_centroid', 'Chamfer vs Centroid'],
    ['chamfer_vs_gaussian', 'Chamfer vs Gaussian'],
  ]

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold text-ink">Adjudication — which measure do people back?</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
        Exact McNemar test on the discriminating trials. Only judgements where the two measures
        predicted differently can separate them — on every other trial they would have made the same
        guess anyway, so counting those would dilute the comparison toward no difference. The
        discordant count is this test&rsquo;s real sample size and is shown beside the p-value.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-semibold">Comparison</th>
              <th className="py-2 pr-3 text-right font-semibold">Chamfer only</th>
              <th className="py-2 pr-3 text-right font-semibold">Other only</th>
              <th className="py-2 pr-3 text-right font-semibold">Discordant</th>
              <th className="py-2 pr-3 text-right font-semibold">p</th>
              <th className="py-2 font-semibold">Reads as</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(([key, label]) => {
              const a = disc.adjudication[key]
              const verdict =
                a.discordant === 0
                  ? 'nothing to separate them'
                  : a.p_value >= 0.05
                    ? 'not separated at this sample size'
                    : a.a_only > a.b_only
                      ? 'favours Chamfer'
                      : 'favours the cloud measure'
              return (
                <tr key={key} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{label}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">{a.a_only}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">{a.b_only}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-faint">{a.discordant}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">{pval(a.p_value)}</td>
                  <td className="py-2 text-sm text-ink-muted">{verdict}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-ink-faint">
        Discriminating trials were selected because the measures disagreed there, and among those,
        the most decisive were chosen. This accuracy is therefore an estimate on decisive
        disagreements, not on all disagreements — a deliberate trade of generality for statistical
        power. The direction of the result is interpretable ("people lean toward Chamfer"); its exact
        magnitude should not be read as Chamfer&rsquo;s accuracy in general.
      </p>
    </section>
  )
}

// The instrument's own sanity check, standing in for the attention check.
function MarginCurve({ result }) {
  const curve = result.strata.agreement.margin_curve.chamfer
  if (!curve.length) return null

  const W = CANVAS_W
  const H = 300
  const pad = { top: 30, right: 30, bottom: 52, left: 60 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const maxX = Math.max(...curve.map((b) => b.strength_max)) * 1.05
  const x = (v) => pad.left + (v / maxX) * plotW
  const y = (v) => pad.top + (1 - v) * plotH

  return (
    <section className="mt-6">
      <Figure
        title="Accuracy against how decisive the prediction was"
        caption="Agreement trials only, binned by margin into equal-count groups, with 95% Wilson intervals. This study runs no attention check, so this chart stands in for one: the 'margin' is how confidently the measures preferred one candidate over the other. If participants were genuinely judging the space, accuracy should rise as that margin widens; a flat line across margins is the signature of random clicking rather than real perception."
        filename="p8-margin-curve"
        note="A diagnostic on the instrument's data quality, not a hypothesis test — no p-value is attached to the slope, and the bins are not independent of the accuracies reported above."
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
          <rect width={W} height={H} fill={PAPER} />
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={pad.left} y1={y(v)} x2={W - pad.right} y2={y(v)} stroke={v === 0.5 ? RULE : GRID} strokeWidth={v === 0.5 ? 1.25 : 1} />
              <text x={pad.left - 8} y={y(v) + 3} textAnchor="end" {...TYPE.tick}>
                {`${v * 100}%`}
              </text>
            </g>
          ))}
          <text x={pad.left - 44} y={pad.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 ${pad.left - 44} ${pad.top + plotH / 2})`} {...TYPE.axisTitle}>
            Agreement with the prediction
          </text>
          <text x={pad.left + plotW / 2} y={H - 12} textAnchor="middle" {...TYPE.axisTitle}>
            Prediction margin (share of a typical distance)
          </text>
          <text x={W - pad.right} y={y(0.5) - 6} textAnchor="end" {...TYPE.annotation}>
            chance
          </text>

          <polyline
            points={curve.map((b) => `${x(b.strength_mid)},${y(b.accuracy)}`).join(' ')}
            fill="none"
            stroke={COOL}
            strokeWidth={1.75}
          />
          {curve.map((b) => (
            <g key={b.bin}>
              <line x1={x(b.strength_mid)} y1={y(b.ci.low)} x2={x(b.strength_mid)} y2={y(b.ci.high)} stroke={COOL} strokeWidth={1.5} opacity={0.45} />
              <circle cx={x(b.strength_mid)} cy={y(b.accuracy)} r={4.5} fill={COOL} />
              <text x={x(b.strength_mid)} y={H - pad.bottom + 16} textAnchor="middle" {...TYPE.tick}>
                {`n=${b.n}`}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={x(maxX * f)} y={H - pad.bottom + 32} textAnchor="middle" {...TYPE.tick}>
              {(maxX * f).toFixed(2)}
            </text>
          ))}
        </svg>
      </Figure>

      <div className="mt-4 rounded-lg border border-line bg-paper p-4">
        <p className="text-sm font-semibold text-ink">Position check</p>
        <p className="mt-1 text-sm text-ink-muted">
          Participants chose the left-hand view on {pct(result.position_bias.left_share)} of
          judgements (p = {pval(result.position_bias.p_value)}). Which candidate lands on the left is
          randomised per participant per trial, so a preference here could not bias any measure&rsquo;s
          accuracy above — but a strong one would mean people were answering by screen position
          rather than by content.
        </p>
      </div>
    </section>
  )
}

// Which specific pairs people split on.
function PerTrialTable({ result }) {
  const [stratum, setStratum] = useState('discriminating')
  const rows = useMemo(
    () => result.per_trial.filter((t) => t.stratum === stratum).slice(0, 25),
    [result, stratum]
  )
  if (!result.per_trial.length) return null

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Trial by trial</h2>
        <div className="flex gap-1.5">
          {STRATA.map((s) => (
            <button
              key={s}
              onClick={() => setStratum(s)}
              aria-pressed={stratum === s}
              className={`rounded-full border px-3 py-1 font-mono text-[11px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-wash ${
                stratum === s
                  ? 'border-primary bg-primary-wash/60 text-ink'
                  : 'border-line-strong bg-paper text-ink-faint hover:border-primary hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        The share of participants who chose the candidate Chamfer predicted, per trial, most-answered
        first. A trial the measures call decisively and people split evenly on is a specific place
        worth going back to — it is a finding, not noise, though with a handful of answers each these
        are exploratory.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-semibold">Reference</th>
              <th className="py-2 pr-3 font-semibold">Candidates</th>
              <th className="py-2 pr-3 text-right font-semibold">n</th>
              <th className="py-2 pr-3 text-right font-semibold">Chose Chamfer&rsquo;s</th>
              <th className="py-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.trial_id} className="border-b border-line/60">
                <td className="py-2 pr-3 text-ink">{t.reference.site_name}</td>
                <td className="py-2 pr-3 text-ink-muted">
                  {t.candidates.map((c) => c.site_name).join(' · ')}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-faint">{t.n}</td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">
                  {pct(t.chamfer_share)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-ink-faint">
                  {t.strength.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// A real trial from the bank, rendered exactly as a participant meets it.
//
// Present whether or not any data has been collected: the stimulus is the part
// of a survey most easily got wrong and least easily checked from a number, and
// a reader should be able to see what was actually asked.
function TrialPreview() {
  const [index, setIndex] = useState(0)
  const trial = bankFile.trials[index % bankFile.trials.length]

  const geometry = (siteId) => {
    try {
      const site = SITE_BY_ID.get(siteId)
      return site ? projectSite(site) : null
    } catch {
      return null
    }
  }

  const views = [
    { view: trial.reference, role: 'reference' },
    { view: trial.candidates[0], role: `candidate a${trial.predictions.chamfer === 'a' ? ' · Chamfer' : ''}${trial.predictions.centroid === 'a' ? ' · cloud measures' : ''}` },
    { view: trial.candidates[1], role: `candidate b${trial.predictions.chamfer === 'b' ? ' · Chamfer' : ''}${trial.predictions.centroid === 'b' ? ' · cloud measures' : ''}` },
  ]

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">What a trial looks like</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-faint">
            {index + 1} of {bankFile.trials.length} · {trial.stratum}
          </span>
          <button
            onClick={() => setIndex((i) => (i + 1) % bankFile.trials.length)}
            className="rounded-full border border-line-strong bg-paper px-3 py-1 font-mono text-[11px] text-ink-muted outline-none transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            next trial
          </button>
        </div>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">
        The same building masses the isovist measured, at the same 120° field and 1.6 m eye height —
        no textures and no invented detail, because a prettier render would show a participant
        something that was never measured. Participants see no plaza names and no labels; they are
        added here only so the trial can be audited.
      </p>

      <Suspense fallback={<p className="mt-4 font-mono text-xs text-ink-faint">Preparing the 3D views…</p>}>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {views.map(({ view, role }) => {
            const g = geometry(view.site_id)
            return (
              <figure key={role}>
                {g ? (
                  <ViewRender
                    geometry={g}
                    vantage={{ x: view.local_x, y: view.local_y }}
                    headingDeg={view.direction_deg}
                    fovDeg={view.fov_deg ?? 120}
                    className="aspect-[16/10] w-full"
                  />
                ) : (
                  <div className="flex aspect-[16/10] w-full items-center justify-center rounded-md border border-line bg-surface">
                    <p className="font-mono text-xs text-ink-faint">unavailable</p>
                  </div>
                )}
                <figcaption className="mt-2">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{role}</p>
                  <p className="text-sm font-medium text-ink">{view.site_name}</p>
                  <p className="font-mono text-[11px] text-ink-faint">
                    view {view.view_index + 1} · {Math.round(view.direction_deg)}°
                  </p>
                </figcaption>
              </figure>
            )
          })}
        </div>
      </Suspense>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3 font-mono text-xs text-ink-faint">
        <div>
          <dt className="inline">best-match margin (Chamfer) </dt>
          <dd className="inline tabular-nums text-ink-muted">{trial.margins.view.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="inline">centroid margin </dt>
          <dd className="inline tabular-nums text-ink-muted">{trial.margins.centroid.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="inline">gaussian margin </dt>
          <dd className="inline tabular-nums text-ink-muted">{trial.margins.gaussian.toFixed(3)}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">
        margin: how strongly each measure preferred one candidate over the other — a fraction of
        that measure&rsquo;s typical distance, not a percentage. The best-match margin comes from the
        same search that picked which of each candidate plaza&rsquo;s 8 views to display here: it is
        the gap between the winning candidate&rsquo;s best-matching view and the losing
        candidate&rsquo;s best-matching view, not a separate calculation.
      </p>
    </section>
  )
}

function Methods({ result }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-6 mb-10 rounded-lg border border-line bg-paper">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        <span className="text-sm font-semibold text-ink">Methods and limitations</span>
        <span className="font-mono text-xs text-ink-faint">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-muted">
          <p>
            <strong className="font-medium text-ink">The trial.</strong> One reference view, two
            candidate views, forced choice. Each candidate plaza is represented by its own view
            nearest the reference in the P5-weighted space (never a random view from that plaza) —
            that constraint is what makes the screen fair to the cloud-level measures: with a
            randomly drawn foil the view-level measure (Chamfer) would win trivially, for a reason
            that has nothing to do with human perception.
          </p>
          <p>
            <strong className="font-medium text-ink">The predictions were frozen first.</strong> The
            bank of trials was built and written to disk before any participant saw it, so this is
            genuine out-of-sample validation — the measures were not tuned afterward to match what
            people said. Answers carry the predictions that were live when they were given; if the
            bank is rebuilt, affected sessions are flagged rather than silently rescored.
          </p>
          <p>
            <strong className="font-medium text-ink">Centroid and Gaussian predict at plaza level.</strong>{' '}
            They are set-to-set measures with no view-level pairing of their own, so &ldquo;which
            plaza, ignoring which view&rdquo; is their actual prediction rather than a weakened form
            of it. The adjudication therefore tests whether knowing which exact view you stand at
            adds anything over knowing which plaza you are in.
          </p>
          <p>
            <strong className="font-medium text-ink">No attention check</strong>, matching P3 — the
            earlier static-photo study&rsquo;s check discriminated nobody across 50 participants, and
            this instrument is kept to about two minutes. The cost is a missing ceiling for the
            accuracies above, which the margin curve recovers instead: it shows whether accuracy
            actually rises with prediction confidence, the signature of genuine judgement rather than
            random clicking.
          </p>
          <p>
            <strong className="font-medium text-ink">Transfer assumption, inherited.</strong>{' '}
            Distances use the P5 weights — fitted on the panoramic 360° survey — applied here to
            120° readings. This is the same assumption P6 and P7 make, and it is not re-tested by
            this phase. A result here validates the matching under those weights, not the weights
            themselves.
          </p>
          <p>
            <strong className="font-medium text-ink">Non-independence.</strong> One participant
            answers {BLOCK_LENGTH} trials and one trial is answered by several participants, so
            neither judgements nor trials are fully independent observations. The pooled binomial
            (p-value column) ignores both and therefore overstates confidence; the participant-level
            sign test handles the first issue but not the second. A fully correct treatment would be
            a mixed-effects model with crossed random effects for participant and trial, which this
            sample size does not support — named here as a limitation rather than worked around.
          </p>
          <p>
            <strong className="font-medium text-ink">Bank:</strong>{' '}
            <span className="font-mono text-xs">
              {result.bank_version} · {result.bank_generated_at}
            </span>{' '}
            · rebuild with <code className="font-mono text-xs">npm run trials:matched-view</code>,
            verify with <code className="font-mono text-xs">npm run matched-view:selftest</code>.
          </p>
        </div>
      )}
    </section>
  )
}
