import { useMemo, useState } from 'react'
import { LuCheck, LuMinus, LuX } from 'react-icons/lu'

import analysis from '@/data/analysis-panoramic.json'
import ratings from '@/data/rating-validation.json'
import sites from '@/data/sites.json'
import readings from '@/data/results.json'
import { METRICS, METRIC_LABELS, buildFingerprints } from '@/lib/analysis/fingerprints'
import { activeSites } from '@/lib/site'
import {
  buildHypotheses,
  summariseVerdicts,
  reliabilityPrecondition,
  concealmentCorrelations,
  VERDICT,
  R_SIGNIFICANCE_18,
} from '@/lib/analysis/hypotheses'
import {
  ParallelCoordinates,
  SimilarityMDS,
  DimensionLoadings,
  ScatterMatrix,
  PairedFoldChart,
  ConcealmentComparison,
  ConvergenceScatter,
  MetricCorrelation,
} from '@/components/charts/FingerprintCharts'

// P5 — Weight Fitting & Hypothesis Testing.
//
// The page is ordered the way the argument runs, not the way the pipeline
// runs: what was fitted, whether it predicts anything, whether people perceive
// what was measured, and only then the six hypotheses those three sections
// answer. A reader who stops after the first screen should still have the
// weights and the accuracy.
//
// Everything here is read from the two analysis outputs. Nothing is computed in
// the browser, so what is on screen is exactly what `npm run analyze` and
// `npm run validate:ratings` wrote — no risk of the page and the record
// drifting apart.

const pct = (v) => `${(v * 100).toFixed(1)}%`

const VERDICT_STYLE = {
  [VERDICT.SUPPORTED]: { label: 'Supported', cls: 'bg-ok-wash text-ok', Icon: LuCheck },
  [VERDICT.PARTLY]: { label: 'Partly supported', cls: 'bg-warn-wash text-warn', Icon: LuMinus },
  [VERDICT.NOT_SUPPORTED]: { label: 'Not supported', cls: 'bg-redline-wash text-redline', Icon: LuX },
}

export function WeightsPage() {
  const hypotheses = useMemo(() => buildHypotheses(analysis, ratings), [])
  const summary = useMemo(() => summariseVerdicts(hypotheses), [hypotheses])
  const precondition = useMemo(() => reliabilityPrecondition(ratings), [])

  // Geometry for the figures. Built from the same frozen bounds the fit used,
  // so a chart and a weight always describe the same space.
  const siteIds = useMemo(() => activeSites(sites).map((s) => s.id), [])
  const names = useMemo(
    () => new Map(activeSites(sites).map((s) => [s.id, s.name ?? s.id])),
    []
  )
  const fingerprints = useMemo(
    () => buildFingerprints(readings, siteIds, analysis.fov_mode).fingerprints,
    [siteIds]
  )
  const concealment = useMemo(() => concealmentCorrelations(ratings), [])

  // One plaza is selected across every figure on the page, so a line in the
  // profile chart, a dot on the map and a point in the scatterplot matrix read
  // as the same square. Hovering selects temporarily; clicking pins — which is
  // what lets a reader hold one plaza still while studying another figure, and
  // what makes a screenshot of a single plaza possible.
  const [hovered, setHovered] = useState(null)
  const [pinned, setPinned] = useState(null)
  // A pin outranks the pointer, so hovering elsewhere cannot disturb it.
  const selected = pinned ?? hovered
  const togglePin = (id) => setPinned((current) => (current === id ? null : id))
  const link = { selected, pinned, onHover: setHovered, onPin: togglePin }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b-2 border-ink pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            P5 · Weight Fitting &amp; Hypothesis Testing
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            What the geometry sees, and what people see
          </h1>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Four isovist dimensions fitted against {analysis.fit.n} similarity judgements, then
            checked independently against {ratings.ratings.toLocaleString()} ratings of the same
            plazas.
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
            <Fact label="participants" value={analysis.inputs.participants.used} />
            <Fact label="triplets" value={analysis.fit.n} />
            <Fact label="ratings" value={ratings.ratings.toLocaleString()} />
            <Fact label="plazas" value={ratings.scales[0]?.n_plazas ?? 18} />
            <Fact label="layer" value="360° · 200 m" />
          </dl>
        </header>

        <Section n="01" title="The fitted weights">
          <p className="max-w-2xl text-sm text-ink-muted">
            Each plaza is placed by measured geometry alone. For every triplet the model compares
            the weighted distance between each pair and searches for the weights that make the
            observed choices most likely — across all {analysis.fit.n} judgements at once. A larger
            weight means differences on that dimension mattered more to which pair people picked.
          </p>

          <div className="mt-5 space-y-3">
            {METRICS.map((m, i) => (
              <WeightBar
                key={m}
                label={METRIC_LABELS[m]}
                weight={analysis.fit.weights_normalised[i]}
                ci={analysis.bootstrap.per_metric[i]}
                drop={analysis.ablation.results.find((r) => r.metric === m)?.drop}
              />
            ))}
          </div>

          <Note label="Weights sum to 1 by construction">
            So each is a share of influence, not an absolute quantity. The bracket is the 95%
            interval over {analysis.bootstrap.resamples.toLocaleString()} participant resamples —
            how much the weight would move given a different {analysis.inputs.participants.used}{' '}
            people. Every interval clears zero, so no dimension is idle; they overlap heavily, which
            is why ranking them is not a question this design can answer.
          </Note>

          <Note label="Weight and ablation cost measure different things">
            Compactness carries the second-largest weight yet costs least to remove; enclosure
            carries the smallest weight yet costs most. Weight says how strongly a dimension is used
            when all four are present. Ablation says how much worse the model gets without it. A
            dimension that overlaps with others can be heavily used and still replaceable.
          </Note>

          <ParallelCoordinates
            siteIds={siteIds}
            names={names}
            fingerprints={fingerprints}
            weights={analysis.fit.weights_normalised}
            {...link}
          />

          <SimilarityMDS
            siteIds={siteIds}
            names={names}
            fingerprints={fingerprints}
            weights={analysis.fit.weights_normalised}
            {...link}
          />

          <DimensionLoadings
            siteIds={siteIds}
            fingerprints={fingerprints}
            weights={analysis.fit.weights_normalised}
          />
        </Section>

        <Section n="02" title="Does it predict real judgements?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Against chance"
              value={pct(analysis.crossval.mean_accuracy)}
              compare={`vs ${pct(analysis.crossval.chance)} chance`}
              detail={`permutation p = ${analysis.permutation.p.toFixed(4)}`}
              tone="ok"
            />
            <Stat
              label="Against area alone"
              value={pct(analysis.crossval.mean_accuracy)}
              compare={`vs ${pct(analysis.crossval.area_only.mean_accuracy)} for area alone`}
              detail={`sign test p = ${analysis.crossval.paired.signTestP.toFixed(3)} — a tie`}
              tone="no"
            />
          </div>

          <p className="mt-5 max-w-2xl text-sm text-ink-muted">
            Accuracy is <span className="font-medium text-ink">leave-one-plaza-out</span>: a plaza is
            removed, the weights are refitted on the remaining {17}, and the model then predicts
            judgements about the plaza it never saw. Repeated for all{' '}
            {analysis.crossval.per_fold.length}. Chance is {pct(analysis.crossval.chance)} because
            each triplet offers three possible pairs.
          </p>

          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            The model beats chance decisively — no shuffled-label run out of{' '}
            {analysis.permutation.permutations.toLocaleString()} reached this accuracy. It does not
            beat isovist area used on its own: the full model wins{' '}
            {analysis.crossval.paired.wins} of{' '}
            {analysis.crossval.paired.wins + analysis.crossval.paired.losses} decided folds, which is
            a coin flip.
          </p>

          <PairedFoldChart crossval={analysis.crossval} names={names} {...link} />

          <FoldChart folds={analysis.crossval.paired.perFold} names={names} />

          <ScatterMatrix siteIds={siteIds} names={names} fingerprints={fingerprints} {...link} />

          <MetricCorrelation siteIds={siteIds} fingerprints={fingerprints} />
        </Section>

        <Section n="03" title="Do people perceive what the geometry measures?">
          <p className="max-w-2xl text-sm text-ink-muted">
            An independent check. Each plaza's mean rating on a plain-language scale is correlated
            against its computed value across the 18 plazas. These ratings never entered the weight
            fit, so this can contradict it freely.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-3 font-semibold">Dimension</th>
                  <th className="py-2 pr-3 text-right font-semibold">r</th>
                  <th className="py-2 pr-3 text-right font-semibold">p (Holm)</th>
                  <th className="py-2 pr-3 text-right font-semibold">Raters agreed</th>
                  <th className="py-2 pr-3 font-semibold">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {[...ratings.scales]
                  .sort((a, b) => b.pearson_aligned - a.pearson_aligned)
                  .map((s) => {
                    const ok = s.pearson_p_holm < 0.05 && s.pearson_aligned > 0
                    return (
                      <tr key={s.metric} className="border-b border-line">
                        <td className="py-2 pr-3 text-ink">{s.label}</td>
                        <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink">
                          {s.pearson_aligned.toFixed(3)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                          {s.pearson_p_holm.toFixed(4)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                          {s.reliability?.toFixed(2)}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                              ok ? 'bg-ok-wash text-ok' : 'bg-redline-wash text-redline'
                            }`}
                          >
                            {ok ? 'Established' : 'Not established'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <Note label="Reading the columns">
            <span className="font-medium text-ink">r</span> is reported <em>aligned</em>, so positive
            always means agreement. This matters for occlusivity, whose scale runs backwards
            relative to its metric — its “7” end reads <em>clear sightlines, nothing hidden</em>,
            which is <em>low</em> occlusivity.{' '}
            <span className="font-medium text-ink">Raters agreed</span> is split-half reliability:
            whether people agree with <em>each other</em>. It sets a ceiling, because no measurement
            can track a group average more closely than that average tracks itself — and it is what
            separates “our formula is wrong” from “people were guessing”. With 18 plazas, r must
            exceed about {R_SIGNIFICANCE_18} to reach significance on its own.
          </Note>

          <ConvergenceScatter ratings={ratings} />

          <p className="mt-8 max-w-2xl text-sm text-ink-muted">
            The table above asks each metric about its own scale. H3 asks a harder question — of
            the four dimensions, which best tracks a single percept, concealment? Answering it
            needs every metric correlated against the <em>same</em> ratings, which is the figure
            below.
          </p>

          <ConcealmentComparison rows={concealment} significanceThreshold={R_SIGNIFICANCE_18} />

          <div className="mt-8 rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">
              Precondition — rater reliability {precondition.lo.toFixed(2)}–{precondition.hi.toFixed(2)}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">{precondition.statement}</p>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">{precondition.why}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-ink-faint">
              {precondition.perScale.map((s) => (
                <div key={s.metric}>
                  <dt className="inline">{s.label.toLowerCase()} </dt>
                  <dd className="inline text-ink-muted">{s.reliability?.toFixed(2)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-faint">
              Reported here rather than as a hypothesis: it establishes that the instrument works
              and that participants were not guessing, which is a data-quality check rather than a
              finding about urban space.
            </p>
          </div>
        </Section>

        <Section n="04" title="The five hypotheses">
          <p className="max-w-2xl text-sm text-ink-muted">
            Ordered as the argument runs, not as the pipeline runs: the core claim first, then
            whether the measures are valid, the standout negative result, the nuance, and finally
            the limitation and the study it implies.
          </p>
          <p className="mt-3 font-mono text-xs text-ink-faint">
            {summary.supported} supported · {summary.partly} partly · {summary.notSupported} not
            supported
          </p>

          <div className="mt-5 space-y-4">
            {hypotheses.map((h) => (
              <HypothesisCard key={h.id} h={h} />
            ))}
          </div>
        </Section>

        <Section n="05" title="Method &amp; inputs">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">What was used</h3>
              <dl className="mt-2 space-y-1 font-mono text-xs text-ink-muted">
                <Row k="participants" v={`${analysis.inputs.participants.used} of ${analysis.inputs.participants.collected}`} />
                <Row k="triplets fitted" v={`${analysis.inputs.responses.used} of ${analysis.inputs.responses.collected}`} />
                <Row k="dropped" v={analysis.inputs.participants.dropped === 0 ? 'none' : analysis.inputs.participants.dropped} />
                <Row k="attention check" v={analysis.inputs.attentionCheckAdministered ? 'administered' : 'none in this instrument'} />
                <Row k="model NLL" v={analysis.fit.nll.toFixed(2)} />
                <Row k="restarts" v={analysis.fit.restarts} />
                <Row k="converged" v={String(analysis.fit.converged)} />
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Normalisation bounds</h3>
              <p className="mt-1 text-xs text-ink-faint">
                Frozen at fit time and reused by every later phase, including P6's field grid.
              </p>
              <dl className="mt-2 space-y-1 font-mono text-xs text-ink-muted">
                {METRICS.map((m) => (
                  <Row
                    key={m}
                    k={METRIC_LABELS[m].toLowerCase()}
                    v={`${analysis.bounds[m].min} – ${analysis.bounds[m].max}`}
                  />
                ))}
              </dl>
            </div>
          </div>

          <Note label="The fit reads the triplets only">
            Every plaza is placed by measured geometry; the rating block never enters the
            coordinates. An earlier version blended the two, and it was dropped on two grounds — the
            50/50 mixture was a stated preference rather than a derivable quantity, and it was
            circular, since locating plazas by participants' ratings to predict those same
            participants' choices uses one sample twice. A leave-one-participant-out test showed the
            apparent gain vanishing entirely.
          </Note>

          <p className="mt-4 font-mono text-[11px] text-ink-faint">
            fit {new Date(analysis.generated_at).toLocaleDateString()} · ratings{' '}
            {new Date(ratings.generated_at).toLocaleDateString()} · seeds{' '}
            {analysis.seeds.fit}/{analysis.seeds.bootstrap}/{analysis.seeds.permutation} ·{' '}
            {analysis.source.label}
          </p>
        </Section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function Fact({ label, value }) {
  return (
    <div>
      <dt className="inline">{label} </dt>
      <dd className="inline text-ink-muted">{value}</dd>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1">
      <dt>{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  )
}

function Section({ n, title, children }) {
  return (
    <section className="pt-10">
      <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-primary">{n}</span>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Note({ label, children }) {
  return (
    <div className="mt-6 border-t-2 border-primary pb-1 pt-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
        {label}
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">{children}</p>
    </div>
  )
}

// The bar is the weight; the hairline over it is the bootstrap interval. Both
// are drawn on the same 0–0.5 scale so the four rows are directly comparable.
function WeightBar({ label, weight, ci, drop }) {
  const SCALE = 0.5
  return (
    <div className="grid grid-cols-[130px_1fr_128px] items-center gap-3">
      <span className="text-sm text-ink">{label}</span>
      <span className="relative h-6 rounded-sm bg-surface">
        <span
          className="absolute inset-y-0 left-0 rounded-sm bg-primary/80"
          style={{ width: `${Math.min(100, (weight / SCALE) * 100)}%` }}
        />
        <span
          className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-muted"
          style={{
            left: `${(ci.lo / SCALE) * 100}%`,
            width: `${((ci.hi - ci.lo) / SCALE) * 100}%`,
          }}
        />
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-ink">
        {weight.toFixed(3)}
        <span className="ml-2 text-ink-faint">
          {drop != null ? `−${(drop * 100).toFixed(2)}pp` : ''}
        </span>
      </span>
    </div>
  )
}

function Stat({ label, value, compare, detail, tone }) {
  const toneCls = tone === 'ok' ? 'text-ok' : 'text-redline'
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      <p className="mt-1 text-sm text-ink-muted">{compare}</p>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">{detail}</p>
    </div>
  )
}

// Per-plaza difference between the full model and the area-only baseline. The
// spread is the point: a mean of +0.4 pp is built from folds ranging roughly
// ±12 pp, which is why the difference is not distinguishable from zero.
function FoldChart({ folds, names }) {
  const rows = useMemo(() => [...folds].sort((a, b) => a.delta - b.delta), [folds])
  const max = useMemo(() => Math.max(...rows.map((r) => Math.abs(r.delta))), [rows])

  return (
    <figure className="mt-6">
      <figcaption className="font-mono text-[11px] text-ink-faint">
        The same 18 folds as differences — four-metric model minus area-only, ranked
      </figcaption>
      <div className="mt-3 space-y-1">
        {rows.map((r) => {
          const half = (Math.abs(r.delta) / max) * 50
          const positive = r.delta >= 0
          return (
            <div key={r.site} className="grid grid-cols-[150px_1fr_66px] items-center gap-3">
              <span className="truncate text-xs text-ink-muted">
                {names?.get(r.site) ?? r.site.split('-')[0]}
              </span>
              <span className="relative h-3.5">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                <span
                  className={`absolute inset-y-0 rounded-sm ${positive ? 'bg-ok' : 'bg-redline'}`}
                  style={
                    positive
                      ? { left: '50%', width: `${half}%` }
                      : { right: '50%', width: `${half}%` }
                  }
                />
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-ink-muted">
                {r.delta >= 0 ? '+' : ''}
                {(r.delta * 100).toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

function HypothesisCard({ h }) {
  const [open, setOpen] = useState(false)
  const style = VERDICT_STYLE[h.verdict]
  const { Icon } = style

  return (
    <article className="rounded-lg border border-line bg-paper p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold tracking-wider text-primary">{h.id}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            {h.group}
          </p>
          <p className="mt-2 max-w-[54ch] font-medium leading-snug text-ink">{h.claim}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${style.cls}`}
        >
          <Icon aria-hidden className="h-3 w-3" />
          {style.label}
        </span>
      </div>

      <p className="mt-3 font-mono text-sm tabular-nums text-ink">{h.headline}</p>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 font-mono text-[11px] text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        {open ? 'Hide evidence' : 'Show evidence'}
      </button>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <ul className="space-y-2">
            {h.evidence.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {e.label}
                </span>
                <span
                  className={
                    e.ok === true ? 'text-ok' : e.ok === false ? 'text-redline' : 'text-ink-muted'
                  }
                >
                  {e.value}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">{h.why}</p>
        </div>
      )}
    </article>
  )
}
