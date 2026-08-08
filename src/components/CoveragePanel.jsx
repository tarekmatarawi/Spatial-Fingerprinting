import { useMemo, useState } from 'react'
import { LuCircleAlert, LuGrid3X3, LuLayers, LuSigma, LuTriangleAlert } from 'react-icons/lu'
import { pooledCoverage, rampBands, rampStep } from '@/lib/coverage'

// Pooled coverage across every session collected so far — the empirical check on
// the assumption the survey sampler rests on.
//
// Each participant's triplets are drawn independently, with no coordination
// between participants, so balanced coverage of the 153 site pairs is something
// we *expect* to emerge at the target scale (30–50 participants) rather than
// something the sampler guarantees. This panel is how that expectation gets
// checked against real data instead of taken on faith: if a pair is still at
// zero at n=30, the assumption is wrong and the fit will be thin there.

// Side of one square in the pair matrix, in px. Big enough for a two-digit count
// at 10px mono — the cells print their own numbers rather than leaving the fill
// as the only way to read a value.
const MATRIX_CELL = 26

export function CoveragePanel({ records, sites }) {
  const [fitEligibleOnly, setFitEligibleOnly] = useState(false)
  const siteIds = useMemo(() => sites.map((s) => s.id), [sites])
  const nameById = useMemo(() => new Map(sites.map((s) => [s.id, s.name || s.id])), [sites])

  const coverage = useMemo(
    () => pooledCoverage(records, siteIds, { fitEligibleOnly }),
    [records, siteIds, fitEligibleOnly]
  )

  const pctSeen = coverage.pairsPossible
    ? Math.round((coverage.pairsSeenOnce / coverage.pairsPossible) * 100)
    : 0
  const pctTwice = coverage.pairsPossible
    ? Math.round((coverage.pairsSeenTwice / coverage.pairsPossible) * 100)
    : 0

  if (siteIds.length < 3) {
    return (
      <p className="rounded-xl border border-line bg-paper px-4 py-6 text-sm text-ink-muted">
        Coverage needs at least three active plazas in the register.
      </p>
    )
  }

  return (
    <div>
      {/* One filter row scoping every figure below it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Which sessions to count"
          className="inline-flex rounded-full border border-line-strong bg-paper p-0.5"
        >
          {[
            { key: false, label: 'All sessions' },
            { key: true, label: 'Fit-eligible' },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              onClick={() => setFitEligibleOnly(opt.key)}
              aria-pressed={fitEligibleOnly === opt.key}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
                fitEligibleOnly === opt.key
                  ? 'bg-primary text-white'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="font-mono text-xs text-ink-faint">
          {coverage.judged} triplet{coverage.judged === 1 ? '' : 's'} judged ·{' '}
          {coverage.sessions} session{coverage.sessions === 1 ? '' : 's'}
          {fitEligibleOnly && coverage.excludedSessions > 0
            ? ` · ${coverage.excludedSessions} failed the check`
            : ''}
        </p>
      </div>

      {/* Headline coverage numbers */}
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={LuGrid3X3}
          label="Pairs seen at least once"
          value={`${coverage.pairsSeenOnce}/${coverage.pairsPossible}`}
          detail={`${pctSeen}% of all possible pairs`}
        />
        <Stat
          icon={LuLayers}
          label="Pairs seen twice or more"
          value={`${coverage.pairsSeenTwice}/${coverage.pairsPossible}`}
          detail={`${pctTwice}% — the density the fit wants`}
        />
        <Stat
          icon={LuSigma}
          label="Observations per pair"
          value={coverage.meanPair.toFixed(1)}
          detail={`mean · min ${coverage.minPair} · max ${coverage.maxPair}`}
        />
        <Stat
          icon={LuCircleAlert}
          label="Pairs never shown"
          value={coverage.zeroPairs.length}
          detail={
            coverage.zeroPairs.length === 0
              ? 'every pair has been compared'
              : 'listed under the matrix'
          }
          alert={coverage.zeroPairs.length > 0}
        />
      </dl>

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="min-w-0">
          <SectionHeading>Pair coverage</SectionHeading>
          <PairMatrix coverage={coverage} siteIds={siteIds} nameById={nameById} />
          {coverage.zeroPairs.length > 0 && (
            <ZeroPairs pairs={coverage.zeroPairs} nameById={nameById} />
          )}
        </section>

        <section className="min-w-0">
          <SectionHeading>Site appearances</SectionHeading>
          <SiteBars
            rows={coverage.siteCounts}
            nameById={nameById}
            max={coverage.siteCounts.reduce((m, r) => Math.max(m, r.count), 0)}
          />
          <p className="mt-3 font-mono text-xs leading-relaxed text-ink-faint">
            Least-shown first. Each judged triplet counts three appearances, so
            these total {coverage.judged * 3}.
          </p>
        </section>
      </div>

      {coverage.skipped > 0 && (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-wash px-3 py-2 text-xs leading-relaxed text-ink-muted">
          <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
          <span>
            {coverage.skipped} judged triplet{coverage.skipped === 1 ? '' : 's'} named a plaza
            that is no longer active in the register, so {coverage.skipped === 1 ? 'it is' : 'they are'}{' '}
            left out of the counts above. The answers stay on file.
          </span>
        </p>
      )}
    </div>
  )
}

// Lower-triangle matrix of how often each pair has been shown together. Every
// cell prints its own count, so the fill is a second reading of a number that is
// already there rather than the only way to get it.
function PairMatrix({ coverage, siteIds, nameById }) {
  const bands = rampBands(coverage.maxPair)
  // Row 0 has no cells to its left, so the drawn rows start at the second site.
  const rows = siteIds.slice(1)

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-left">
          <caption className="sr-only">
            Number of times each pair of plazas has appeared together in a triplet
          </caption>
          <thead>
            <tr>
              <th />
              {siteIds.slice(0, -1).map((id, i) => (
                <th
                  key={id}
                  scope="col"
                  title={nameById.get(id)}
                  className="pb-1 text-center font-mono text-[10px] font-normal text-ink-faint"
                  style={{ width: MATRIX_CELL, minWidth: MATRIX_CELL }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowId, r) => (
              <tr key={rowId}>
                <th
                  scope="row"
                  className="max-w-[11rem] truncate pr-2 text-right text-[11px] font-normal whitespace-nowrap text-ink-muted"
                  title={nameById.get(rowId)}
                >
                  <span className="font-mono text-ink-faint">{r + 2}</span>{' '}
                  {nameById.get(rowId)}
                </th>
                {siteIds.slice(0, -1).map((colId, c) => {
                  // Only the lower triangle: a pair appears once, and the
                  // diagonal would be a site against itself.
                  if (c > r) return <td key={colId} />
                  const count = coverage.pairCount(rowId, colId)
                  return (
                    <MatrixCell
                      key={colId}
                      count={count}
                      max={coverage.maxPair}
                      label={`${nameById.get(rowId)} + ${nameById.get(colId)}`}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scale legend — a fill scale has to say what its steps mean in counts */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        <span className="font-mono text-[11px] text-ink-faint">times shown together</span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-[3px] border border-redline/50 bg-redline-wash" />
          <span className="font-mono text-[11px] text-ink-muted">0 — never</span>
        </span>
        {bands.map((band) => (
          <span key={band.step} className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 rounded-[3px]"
              style={{ background: `var(--color-cover-${band.step})` }}
            />
            <span className="font-mono text-[11px] text-ink-muted">
              {band.lo === band.hi ? band.lo : `${band.lo}–${band.hi}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function MatrixCell({ count, max, label }) {
  const step = rampStep(count, max)
  const uncovered = step === 0
  return (
    <td
      title={`${label} — shown together ${count} time${count === 1 ? '' : 's'}`}
      className={`rounded-[3px] text-center align-middle font-mono text-[10px] tabular-nums transition-colors duration-150 ${
        uncovered
          ? 'border border-redline/40 bg-redline-wash text-redline'
          : // Steps 1–3 hold ≥4.5:1 with ink; step 4 is dark enough to need white.
            step === 4
            ? 'text-white'
            : 'text-ink'
      }`}
      style={{
        width: MATRIX_CELL,
        height: MATRIX_CELL,
        minWidth: MATRIX_CELL,
        background: uncovered ? undefined : `var(--color-cover-${step})`,
      }}
    >
      {count}
    </td>
  )
}

// Zero-coverage pairs, spelled out. The matrix marks them, but a researcher
// needs the names to act on them — and colour alone can't carry a warning.
function ZeroPairs({ pairs, nameById }) {
  return (
    <div className="mt-4 rounded-xl border border-redline/30 bg-redline-wash p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <LuCircleAlert aria-hidden className="h-4 w-4 text-redline" />
        {pairs.length} pair{pairs.length === 1 ? '' : 's'} never compared
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        No participant has yet seen these two plazas in the same triplet. Expected early on;
        if it persists past ~20 sessions the independent-sampling assumption needs a look.
      </p>
      <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {pairs.map((p) => (
          <li key={`${p.a}|${p.b}`} className="truncate font-mono text-xs text-ink-muted">
            {nameById.get(p.a)} + {nameById.get(p.b)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// One series, one hue — bar length carries the magnitude and every row is
// direct-labeled, so no legend and no value-ramp across the bars.
function SiteBars({ rows, nameById, max }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-muted" title={nameById.get(row.id)}>
              {nameById.get(row.id)}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-ink">{row.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: max ? `${(row.count / max) * 100}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Stat({ icon: Icon, label, value, detail, alert = false }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alert ? 'border-redline/30 bg-redline-wash' : 'border-line bg-paper'
      }`}
    >
      <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Icon aria-hidden className={`h-3.5 w-3.5 ${alert ? 'text-redline' : 'text-primary'}`} />
        {label}
      </dt>
      <dd className="mt-1.5 font-mono text-2xl text-ink">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-faint">{detail}</dd>
    </div>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 className="mb-3 border-b border-line pb-1.5 text-sm font-semibold text-ink">{children}</h2>
  )
}
