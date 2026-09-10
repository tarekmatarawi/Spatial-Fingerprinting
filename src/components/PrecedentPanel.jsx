import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'

import { PlazaPlan } from '@/components/PlazaPlan'
import { Figure } from '@/components/Figure'
import { METRICS, METRIC_LABELS } from '@/lib/analysis/fingerprints'
import { projectSite } from '@/lib/site'
import { allParts } from '@/lib/sandbox'
import { partBlocks } from '@/lib/presets'
import {
  PRECEDENT_FOV_DEG,
  PRECEDENT_RANGE_M,
  PRECEDENT_TOP_N,
  buildProbeIndex,
  defaultHeading,
  probeView,
  rankPrecedents,
  segmentLabelFits,
  standableVantage,
} from '@/lib/precedent'
import { bearingTo } from '@/lib/isovist'
import {
  ACCENT,
  CANVAS_W,
  COOL,
  FAINT,
  INK,
  MONO,
  MUTED,
  NEG,
  OK,
  PAPER,
  RULE,
  TYPE,
} from '@/components/charts/tokens'

// Three.js arrives only when a precedent has actually been found, which is the
// same arrangement the Tier B model uses — nobody should pay for a WebGL
// context to read a zone diagnosis.
const ViewRender = lazy(() =>
  import('@/components/ViewRender').then((m) => ({ default: m.ViewRender }))
)

// P9's precedent panel — the one place on this page that speaks 120°.
//
// THE HEADING SAYS "CLOSEST PRECEDENT VIEW", NOT "CLOSEST VALIDATED PRECEDENT
// VIEW", and the difference is deliberate. What P8 tested is that when the
// weighted space calls two views similar, people tend to agree — at 15 of an
// intended ~40 participants, significant on the measure adjudication and NOT
// significant on the agreement stratum's participant-level test. "Validated"
// in a heading would be read as a property of the match on screen, which is
// exactly the claim the study has not yet earned. The evidence block below
// carries the live numbers and says which half is which; the heading stays a
// description of what the panel does.
//
// LAYER: perceptual_120 throughout, normalised against the frozen 120° bounds,
// and never blended with the 360° zone diagnosis above it. See lib/precedent.js.

export function PrecedentPanel({
  site,
  sitesById,
  geometry,
  masses,
  recesses,
  windowRadius,
  centre,
  corpus,
  weights,
  evidence,
}) {
  // The click-then-aim gesture from P7's marker editor, with one difference
  // that matters: the first click ALREADY COMMITS a reading, aimed at the
  // plaza centroid — P2's convention for an unaimed view, and the direction a
  // person standing in a square is usually looking.
  //
  // P7 needs both halves before it has a marker, because a view cloud is a
  // record and a half-placed record is not one. Here the reading is a question
  // being asked, and answering it on the first click means the panel is never
  // sitting empty while someone works out what the second click is for. The
  // second click re-aims rather than completes, which is the same gesture doing
  // less work rather than a different one.
  //
  // `aiming` therefore means "the next click re-aims this view", not "this view
  // does not exist yet".
  const [placed, setPlaced] = useState(null)
  const [aiming, setAiming] = useState(false)
  const [hover, setHover] = useState(null)
  const [includeHome, setIncludeHome] = useState(false)
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setAiming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Rebuilt whenever the sandbox changes, NOT debounced. The 360° field
  // recompute is debounced because it is 967 casts; this is one, at about 2 ms,
  // and delaying it would leave a probe reporting a plaza that no longer has
  // the mass the researcher just deleted standing in it.
  const probeGeometry = useMemo(
    () => (geometry ? buildProbeIndex(geometry, masses) : null),
    [geometry, masses]
  )

  const standable = useCallback(
    (point) => probeGeometry && standableVantage(point, probeGeometry.composed, geometry?.boundary),
    [probeGeometry, geometry]
  )

  // The live wedge, while aiming. One 120-ray cast per mouse move through the
  // edge index — the same cost the P7 editor's preview pays, and what makes the
  // gesture legible: you see the cone you are about to measure rather than an
  // arrow and a promise.
  const preview = useMemo(() => {
    if (!aiming || !placed || !hover || !probeGeometry) return null
    const headingRad = bearingTo(placed.vantage, hover)
    return probeView({ vantage: placed.vantage, headingRad, ...probeGeometry })
  }, [aiming, placed, hover, probeGeometry])

  // The committed reading. Recast rather than remembered, so an intervention
  // added or removed after the view was placed moves the numbers under it
  // instead of leaving a stale reading on screen that still looks current.
  const probe = useMemo(() => {
    if (!placed || !probeGeometry) return null
    return probeView({
      vantage: placed.vantage,
      headingRad: placed.headingRad,
      ...probeGeometry,
    })
  }, [placed, probeGeometry])

  const ranking = useMemo(() => {
    if (!probe || !corpus) return null
    return rankPrecedents({
      probe,
      corpus,
      weights,
      excludeSiteId: includeHome ? null : site?.id,
      topN: PRECEDENT_TOP_N,
    })
  }, [probe, corpus, weights, includeHome, site])

  const best = ranking?.ranked[0] ?? null

  // The matching plaza's own surveyed geometry — never the sandbox's, and never
  // the sandbox's masses carried across. The precedent is a real place and the
  // render has to be of that place; drawing Konstablerwache's colonnade into a
  // picture of Rathausmarkt would be the most misleading thing this panel could
  // do, and it would look completely convincing.
  //
  // Projected from the register on demand rather than held on the corpus
  // records, so there is one copy of each plaza's geometry and no second one to
  // drift from sites.json.
  const bestGeometry = useMemo(() => {
    const record = best && sitesById?.get(best.siteId)
    if (!record) return null
    try {
      return projectSite(record)
    } catch {
      return null
    }
  }, [best, sitesById])

  function handleClick(point) {
    if (!point || !probeGeometry || !geometry) return

    // Re-aim. The click is a DIRECTION, not a position, so it is not tested for
    // standability — you can look at a wall you could not stand in, and
    // refusing the click would make aiming across a facade impossible.
    if (aiming && placed) {
      setPlaced({ vantage: placed.vantage, headingRad: bearingTo(placed.vantage, point) })
      setAiming(false)
      return
    }

    if (!standable(point)) {
      setRejected(true)
      return
    }
    setRejected(false)
    setPlaced({ vantage: point, headingRad: defaultHeading(point, geometry.centroid) })
    setAiming(true)
  }

  if (!geometry || !corpus) return null

  return (
    <section className="pt-12 pb-16">
      <div className="border-b border-line pb-3">
        <h2 className="text-lg font-semibold text-ink">Closest precedent view</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Click where you would stand, and this measures the one 120° view you would have from
          there — then ranks it against the {corpus.total} views placed across all eighteen plazas
          in P7. What comes back is a list of real positions in real squares, nearest first. The
          view starts facing the middle of the plaza; a second click aims it.
        </p>
      </div>

      {/* The layer warning comes before the tool, not after it. Everything else
          on this page is a 360° field number, and a reader arriving at a fifth
          panel of four-metric readouts has every reason to assume this one is
          the same kind. It is not, and the two must never be compared. */}
      <div className="mt-4 rounded-lg border border-warn/40 bg-warn-wash p-4">
        <p className="text-sm leading-relaxed text-ink">
          <span className="font-medium">This is a different measurement system.</span>{' '}
          Everything above is 360° — what a place is, whichever way you look. This is 120°,
          directional: what one person sees standing in one spot facing one way. The four metric
          names are the same and the numbers are not comparable, so they are scaled here against
          the frozen 120° bounds from the eighteen survey readings and kept entirely separate from
          the zone diagnosis. A distance in this panel and a distance in that one are different
          quantities that happen to be written the same way.
        </p>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
        <Figure
          title="The view you placed, as a 120° isovist"
          caption={
            'The wedge is drawn from the cast’s own ray endpoints, not as an arc — so it shows ' +
            'where the view actually stops, which in a square is rarely 200 m in every direction ' +
            'it is aimed at. Interventions are in markup red, solid where they reach the 1.6 m ' +
            'eye-height slice and hollow where they do not.'
          }
          filename="konstablerwache-precedent-probe"
          target="svg[data-plan]"
          className="mt-0"
          note={
            'Perceptual 120° layer. This drawing and the 360° zone maps above show the same ' +
            'plaza at the same scale and measure different quantities; the wedge is one person’s ' +
            'view from one spot, not a property of the ground it stands on.'
          }
        >
          <PlazaPlan
            geometry={geometry}
            windowRadius={windowRadius}
            centre={centre}
            interactive
            onPlanClick={handleClick}
            onPlanMove={(point) => setHover(point)}
            onPlanLeave={() => setHover(null)}
            ariaLabel={`${site?.name ?? 'Plaza'} plan — place a 120° view`}
          >
            {({ k }) => (
              <>
                {/* The sandbox as it stands, in the same convention Tier B's
                    plan uses: solid where a part reaches the eye-height slice,
                    hollow where it does not. A probe cast past a pergola sees
                    through it, and the drawing has to say so. */}
                {allParts(masses).map((part, i) => (
                  <polygon
                    key={`${part.elementId}-${i}`}
                    points={part.footprint.map((p) => `${p.x},${-p.y}`).join(' ')}
                    fill="var(--color-redline)"
                    fillOpacity={partBlocks(part) ? 0.4 : 0.1}
                    stroke="var(--color-redline)"
                    strokeWidth={0.5 * k}
                    strokeDasharray={partBlocks(part) ? undefined : `${1.5 * k} ${1.2 * k}`}
                  />
                ))}
                {(recesses ?? []).map(({ element, cut }) => (
                  <polygon
                    key={element.id}
                    points={cut.opening.map((p) => `${p.x},${-p.y}`).join(' ')}
                    fill="var(--color-bg)"
                    stroke="var(--color-redline)"
                    strokeWidth={0.5 * k}
                  />
                ))}

                {/* The committed wedge stays drawn while a new heading is being
                    previewed, so re-aiming is a comparison rather than a
                    replacement — you can see what you are turning away from. */}
                {probe && <Wedge result={probe} k={k} committed />}
                {preview && <Wedge result={preview} k={k} />}

                {probe && (
                  <circle
                    cx={probe.local_x}
                    cy={-probe.local_y}
                    r={1.3 * k}
                    fill="var(--color-accent)"
                    stroke="var(--color-paper)"
                    strokeWidth={0.4 * k}
                  />
                )}
              </>
            )}
          </PlazaPlan>
          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-faint">
            <span>
              {PRECEDENT_FOV_DEG}° to {PRECEDENT_RANGE_M} m · eye height 1.6 m · height-aware
            </span>
            <span className={aiming || !probe ? 'text-primary' : ''}>
              {aiming
                ? 'click to aim · Esc to keep it facing the centre'
                : probe
                  ? `facing ${Math.round(probe.direction_deg)}° · click to stand somewhere else`
                  : 'click where you would stand'}
            </span>
          </p>
        </Figure>

        <div className="min-w-0">
          {rejected && (
            <p className="mb-3 text-[11px] leading-relaxed text-redline">
              Nobody can stand there — it is outside the plaza boundary, or inside (or within a
              metre of) something that blocks at eye height. The same rule the field grid and the
              P7 view clouds use.
            </p>
          )}

          <ProbeReadout probe={probe} ranking={ranking} />

          <div className="mt-4 rounded-lg border border-line bg-surface p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={includeHome}
                onChange={(e) => setIncludeHome(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">
                  Include {site?.name ?? 'this plaza'}&rsquo;s own eight views
                </span>
                <br />
                Off by default: a view in this square resembling this square is not a precedent.
                Turn it on once Tier B has changed the plaza — &ldquo;this corner no longer looks
                like the square it is in&rdquo; is a real finding, and this is the only way to see
                it.
              </span>
            </label>
            {ranking && (
              <p className="mt-2 font-mono text-[10px] text-ink-faint">
                ranking against {ranking.pooled} of {corpus.total} views
                {ranking.excluded ? ` · ${ranking.excluded} excluded` : ''}
              </p>
            )}
          </div>

          <Evidence evidence={evidence} />
        </div>
      </div>

      {ranking && best && (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <figure>
              <Suspense
                fallback={
                  <div className="flex aspect-[16/10] items-center justify-center rounded-md border border-line bg-surface">
                    <p className="font-mono text-xs text-ink-faint">Rendering the view…</p>
                  </div>
                }
              >
                {bestGeometry ? (
                  <ViewRender
                    geometry={bestGeometry}
                    vantage={{ x: best.marker.local_x, y: best.marker.local_y }}
                    headingDeg={best.marker.direction_deg}
                    fovDeg={PRECEDENT_FOV_DEG}
                    className="aspect-[16/10] w-full"
                    label={`${best.siteName} · view ${best.viewNumber} · ${Math.round(
                      best.marker.direction_deg
                    )}°`}
                  />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center rounded-md border border-line bg-surface">
                    <p className="font-mono text-xs text-ink-faint">
                      No geometry bundled for {best.siteName}.
                    </p>
                  </div>
                )}
              </Suspense>
              <figcaption className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                The nearest of the {ranking.pooled} corpus views, drawn from the same extruded
                masses the isovist ran on — no textures, no invented detail. A prettier render
                would show you something never measured.{' '}
                <span className="text-ink-faint">
                  Your own view is not rendered beside it: the model draws every footprint from the
                  ground up, so a pergola roof or a raised plinth would appear as a solid block and
                  the picture would disagree with the metrics under it, in the direction that
                  flatters the comparison.
                </span>
              </figcaption>
            </figure>

            <RankingList ranking={ranking} />
          </div>

          <Figure
            title={`What separates the placed view from its ${ranking.ranked.length} nearest precedents`}
            caption={
              `Each row splits one precedent's gap into the four measured dimensions, as ` +
              `percentages that add to 100%. Read it as “most of what makes this view unlike ` +
              `${best.siteName} is X”. The shares are of the WEIGHTED squared distance, so a ` +
              `dimension's band is its real contribution to the ranking rather than its raw ` +
              `difference — which is why a large gap in one metric can carry a small share and ` +
              `the reverse. Every bar is the same width because the comparison here is between ` +
              `compositions; how far away each precedent actually is, is the number at the end of ` +
              `its row and the bar beside it in the list above.`
            }
            filename="konstablerwache-precedent-decomposition"
            note={
              'Perceptual 120° layer, normalised against the frozen bounds from the eighteen ' +
              'canonical readings and weighted by the P5 weights — the same space P7 measured its ' +
              'view-level matches in and P8 tested. Applying weights fitted on the 360° panoramic ' +
              'survey to 120° readings is the transfer assumption stated in the spec; it is P7’s ' +
              'assumption, not a new one.'
            }
          >
            <PrecedentDecomposition ranking={ranking} />
          </Figure>
        </>
      )}

      {probe && ranking && !best && (
        <p className="mt-6 font-mono text-xs text-ink-faint">
          Nothing left to rank against — every corpus view was excluded.
        </p>
      )}
    </section>
  )
}

/* -------------------------------------------------------------- sub-panels */

// The placed reading's own numbers, in raw units and on the corpus scale.
//
// Both, because neither alone is enough: the raw value is the one a designer
// can check against a drawing, and the normalised one is what the ranking
// actually used. Showing only the second would make an out-of-range view
// unreadable; showing only the first would hide why a match came out where it
// did.
function ProbeReadout({ probe, ranking }) {
  if (!probe) {
    return (
      <div className="rounded-lg border border-line bg-surface p-3">
        <p className="text-[11px] leading-relaxed text-ink-muted">
          No view placed yet. Click the plan where you would stand — the view starts facing the
          middle of the square, and a second click aims it wherever you like.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h3 className="text-xs font-semibold text-ink">The view you placed</h3>
      <dl className="mt-2 space-y-1 font-mono text-[11px]">
        {METRICS.map((metric, k) => {
          const raw = probe[RAW_KEYS[metric]]
          const n = ranking?.probeN[k]
          const out = n != null && (n < 0 || n > 1)
          return (
            <div key={metric} className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-faint">{METRIC_LABELS[metric]}</dt>
              <dd className="tabular-nums text-ink-muted">
                {FORMAT_RAW[metric](raw)}
                {n != null && (
                  <span className={out ? 'ml-2 text-redline' : 'ml-2 text-ink-faint'}>
                    {n.toFixed(2)}
                  </span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="mt-2 border-t border-line pt-2 font-mono text-[10px] text-ink-faint">
        raw · normalised on the 120° corpus scale
      </p>
      {ranking?.outOfRange.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-redline">
          {ranking.outOfRange.map((m) => METRIC_LABELS[m].toLowerCase()).join(' and ')}{' '}
          {ranking.outOfRange.length === 1 ? 'sits' : 'sit'} outside anything the eighteen surveyed
          views span. The ranking still works — nothing is clipped — but the nearest precedent is
          the nearest of what exists, not a close one.
        </p>
      )}
    </div>
  )
}

// The top five, as a list rather than a chart.
//
// Five distances is not a distribution and drawing it as one would invite it to
// be read as evidence about the corpus. What the list has to make visible is
// whether the top match stands clear or sits in a pile of near-ties, and a
// number for that (`separation`) beats an eyeballed gap between two bars.
function RankingList({ ranking }) {
  const max = ranking.ranked[ranking.ranked.length - 1]?.distance || 1

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-line pb-1.5">
        <h3 className="text-xs font-semibold text-ink">
          Nearest {ranking.ranked.length} of {ranking.pooled}
        </h3>
        {/* Said explicitly, because a longer bar reads intuitively as "more"
            and here it means "further away" — the opposite of better. */}
        <span className="font-mono text-[10px] text-ink-faint">
          weighted 120° distance · shorter is closer
        </span>
      </div>

      <ol className="mt-2 space-y-1.5">
        {ranking.ranked.map((v, i) => (
          <li key={`${v.siteId}-${v.viewNumber}`} className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 font-mono text-[10px] text-ink-faint tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`text-sm ${i === 0 ? 'font-medium text-ink' : 'text-ink-muted'}`}>
                {v.siteName}
              </span>
              <span className="ml-1.5 font-mono text-[10px] text-ink-faint">
                view {v.viewNumber}
                {v.origin === 'canonical' ? ' · survey' : ''}
              </span>
              {/* Every bar is drawn in a colour that can be SEEN against the
                  track. The first version marked ranks 2–5 with RULE (#DCDCD5),
                  which is within a shade of the track itself, so four of the
                  five bars simply were not there and the row looked broken
                  rather than de-emphasised. Rank is carried by position and by
                  the accent on first place; it must not be carried by making a
                  bar invisible. */}
              <span className="mt-1 block h-[5px] rounded-sm bg-line">
                <span
                  className="block h-full rounded-sm"
                  style={{
                    width: `${Math.max(4, (v.distance / max) * 100)}%`,
                    background: i === 0 ? ACCENT : MUTED,
                  }}
                />
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
              {v.distance.toFixed(3)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
        {ranking.separation == null ? (
          'Only one candidate.'
        ) : ranking.separation < 0.08 ? (
          <>
            <span className="font-medium text-ink">A near-tie.</span> Second place is only{' '}
            {(ranking.separation * 100).toFixed(0)}% further away, so which of these is &ldquo;the&rdquo;
            precedent is not a claim this ranking supports — read the top few as one group.
          </>
        ) : (
          <>
            <span className="font-medium text-ink">First place stands clear:</span> the runner-up is{' '}
            {(ranking.separation * 100).toFixed(0)}% further away.
          </>
        )}
      </p>
    </div>
  )
}

// What P8 found, live, with the two strata kept apart.
//
// Never one pooled headline. The agreement stratum tests the framework against
// chance and the discriminating stratum adjudicates between the measures; a
// single number combining them would be an accuracy computed partly on trials
// selected BECAUSE the measures disagreed, which is biased by construction in a
// direction that depends on the mix. P8's own page makes that argument at
// length — this is the short form, and it must not quietly undo it.
function Evidence({ evidence }) {
  if (!evidence) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-surface p-3">
        <h4 className="text-xs font-semibold text-ink">What backs this comparison</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          The P8 validation analysis could not be read, so no evidence is shown rather than a
          remembered number.
        </p>
      </div>
    )
  }

  const { agreement, discriminating } = evidence

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <h4 className="text-xs font-semibold text-ink">What backs this comparison</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
        P8 put pairs of these views in front of participants and asked which was more like a
        reference. It is the reason to take a ranking in this space seriously at all — and it is
        still running.
      </p>

      <dl className="mt-2.5 space-y-2">
        <EvidenceRow
          ok={agreement.significant}
          label="People agree with the space"
          value={`${(agreement.accuracy * 100).toFixed(1)}% of ${agreement.n}`}
          detail={
            `sign test p = ${fmtP(agreement.signP)}` +
            (agreement.significant ? '' : ' — not significant')
          }
        />
        <EvidenceRow
          ok={discriminating.significant}
          label="View-level beats plaza-level"
          value={`${(discriminating.accuracy * 100).toFixed(1)}% of ${discriminating.n}`}
          detail={`exact McNemar p = ${fmtP(discriminating.mcnemarP)} on ${discriminating.discordant} discordant`}
        />
      </dl>

      <p className="mt-2.5 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
        {evidence.status}
      </p>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-ink-faint">
        {evidence.participants} participants · {evidence.judgements} judgements · read live from
        the responses, never fixed in the text
      </p>
    </div>
  )
}

function EvidenceRow({ ok, label, value, detail }) {
  const Icon = ok ? LuCircleCheck : LuTriangleAlert
  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-[3px] size-3 shrink-0 ${ok ? 'text-ok' : 'text-warn'}`} />
      <div className="min-w-0">
        <dt className="text-[11px] font-medium text-ink">{label}</dt>
        <dd className="font-mono text-[10px] text-ink-faint">
          <span className="tabular-nums text-ink-muted">{value}</span> · {detail}
        </dd>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- drawings */

// The 120° cone, drawn from the cast's own ray endpoints rather than as an arc.
//
// An arc would draw the view as though it reached 200 m in every direction it
// was aimed at, which is what the wedge looks like in an empty field and almost
// never what it looks like in a square. Drawing the rays is drawing the
// measurement.
function Wedge({ result, k, committed = false }) {
  const points = useMemo(() => {
    const vantage = `${result.local_x},${-result.local_y}`
    const arc = result.rays.map((r) => `${r.point.x},${-r.point.y}`).join(' ')
    return `${vantage} ${arc}`
  }, [result])

  return (
    <>
      <polygon
        points={points}
        fill="var(--color-accent)"
        opacity={committed ? 0.22 : 0.14}
        pointerEvents="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={(committed ? 0.45 : 0.3) * k}
        opacity={committed ? 0.9 : 0.5}
        pointerEvents="none"
      />
    </>
  )
}

// One stacked bar per precedent: how the weighted squared distance divides
// across the four dimensions.
//
// Stacked rather than grouped because the quantity IS a sum — the four
// contributions add to the squared distance, and a stack says that where four
// side-by-side bars would leave a reader to add them up by eye.
//
// EVERY SEGMENT CARRIES ITS SHARE AS A NUMBER. The first version relied on the
// reader estimating widths against a legend, which is the work a figure exists
// to do for them.
//
// EVERY BAR IS THE SAME WIDTH, and that is a correction rather than a
// simplification. Bars were first scaled to the largest distance in the set, so
// that a short bar meant a close precedent. It read well and it broke the
// labelling in the worst possible place: the closest precedents have the
// shortest bars, so the rows a designer actually cares about were the ones whose
// numbers would not fit. Checked against real probes, a 15% share was going
// unlettered on a second-place row while a 5% share was lettered on a fifth —
// the figure was hardest to read exactly where it mattered most.
//
// Magnitude has not been dropped, it has moved to where it reads better: the
// distance is printed at the end of each row, with its ratio to the closest
// match, and the ranking list beside this figure draws the same distances as
// bars. This panel now answers one question — what the gap is MADE OF — and
// answers it at the same resolution on every row.
//
// Rows are drawn at FULL OPACITY, all five. Fading ranks 2–5 to emphasise the
// first also faded the white numerals on them to something unreadable, and rank
// is already carried by position and by the row's own label.
function PrecedentDecomposition({ ranking }) {
  const rows = ranking.ranked
  const rowH = 42
  const barH = 22
  const padTop = 36
  const padBottom = 60
  const labelW = 210
  const barW = CANVAS_W - labelW - 110
  const height = padTop + rows.length * rowH + padBottom

  const closest = rows[0]?.distance || 1

  return (
    <svg viewBox={`0 0 ${CANVAS_W} ${height}`} width="100%" role="img">
      <text x={0} y={14} {...TYPE.panelTitle}>
        What the gap to each precedent is made of
      </text>
      <text x={0} y={28} {...TYPE.annotation}>
        each dimension&rsquo;s share of the weighted squared distance · bars are equal width, so
        rows compare · perceptual 120° layer
      </text>

      {rows.map((row, i) => {
        const y = padTop + i * rowH
        const total = row.distance ** 2
        const width = barW
        const barY = y + 4
        let x = labelW

        return (
          <g key={`${row.siteId}-${row.viewNumber}`}>
            {/* The rank, so a row can be matched to the list beside the
                render without counting down from the top. */}
            <text x={0} y={barY + barH / 2 + 3.5} {...TYPE.tick} fill={i === 0 ? ACCENT : FAINT}>
              {i + 1}
            </text>
            <text
              x={labelW - 10}
              y={barY + 6}
              textAnchor="end"
              {...TYPE.markLabel}
              fill={i === 0 ? INK : MUTED}
            >
              {row.siteName}
            </text>
            <text x={labelW - 10} y={barY + 18} textAnchor="end" {...TYPE.tick}>
              view {row.viewNumber}
              {row.origin === 'canonical' ? ' · survey' : ''}
            </text>

            {METRICS.map((metric, k) => {
              const share = total > 0 ? row.contributions[k] / total : 0
              const seg = share * width
              const at = x
              x += seg
              const label = `${Math.round(share * 100)}%`
              // The rule lives in lib/precedent.js because the caption below
              // promises what it guarantees — see segmentLabelFits.
              const fits = segmentLabelFits(share, width)

              return (
                <g key={metric}>
                  <rect
                    x={at}
                    y={barY}
                    width={Math.max(0, seg)}
                    height={barH}
                    fill={SERIES[metric]}
                  />
                  {/* A hairline in the figure's own ground, so a segment too
                      narrow for a number is still visibly a segment. */}
                  {k > 0 && seg > 0 && (
                    <line
                      x1={at}
                      y1={barY}
                      x2={at}
                      y2={barY + barH}
                      stroke={PAPER}
                      strokeWidth={1}
                    />
                  )}
                  {fits && (
                    <text
                      x={at + seg / 2}
                      y={barY + barH / 2 + 3.4}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontFamily={MONO}
                      fill={PAPER}
                    >
                      {label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Magnitude, in words rather than width: how far this precedent
                is, and how many times further than the closest one. "×1.4" is
                the thing a reader would otherwise be estimating off two bar
                lengths, and it is exact. */}
            <text x={labelW + width + 8} y={barY + barH / 2 + 0.5} {...TYPE.tick} fill={MUTED}>
              {row.distance.toFixed(3)}
            </text>
            <text x={labelW + width + 8} y={barY + barH / 2 + 10} {...TYPE.tick} fill={FAINT}>
              {i === 0 ? 'closest' : `×${(row.distance / closest).toFixed(2)}`}
            </text>
          </g>
        )
      })}

      {/* Legend at the foot, in the metric order the vectors use, so a reader
          matching a colour to a name never has to guess which end of the stack
          is which. */}
      <g transform={`translate(${labelW}, ${padTop + rows.length * rowH + 16})`}>
        <line x1={0} y1={-8} x2={barW} y2={-8} stroke={RULE} strokeWidth={1} />
        {METRICS.map((metric, k) => (
          <g key={metric} transform={`translate(${k * 150}, 0)`}>
            <rect x={0} y={0} width={9} height={9} fill={SERIES[metric]} />
            <text x={13} y={8.5} {...TYPE.tick} fill={MUTED}>
              {METRIC_LABELS[metric]}
            </text>
          </g>
        ))}
        <text x={0} y={26} {...TYPE.annotation}>
          Shares are of the weighted quantity and add to 100% across each row. A band with no
          figure on it is under about 5% — too narrow to letter, never a missing value.
        </text>
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------- bits */

// The same four series colours the Tier A response figure uses, so a dimension
// is one colour everywhere on this page.
const SERIES = {
  area: COOL,
  compactness: OK,
  occlusivity: NEG,
  enclosure: ACCENT,
}

const RAW_KEYS = {
  area: 'area_m2',
  compactness: 'compactness',
  occlusivity: 'occlusivity_m',
  enclosure: 'enclosure_ratio',
}

const FORMAT_RAW = {
  area: (v) => `${Math.round(v).toLocaleString()} m²`,
  compactness: (v) => v.toFixed(3),
  occlusivity: (v) => `${Math.round(v)} m`,
  enclosure: (v) => v.toFixed(3),
}

// p-values below the smallest thing this sample can resolve are shown as a
// bound rather than as a suspiciously precise decimal.
function fmtP(p) {
  if (p == null) return '—'
  return p < 0.001 ? '< 0.001' : p.toFixed(3)
}
