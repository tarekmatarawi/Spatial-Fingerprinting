import { useState } from 'react'

// P9's methods disclosure.
//
// Same arrangement as P6's "Methods & robustness", P7's "Methods & assumptions"
// and P8's "Methods and limitations": collapsed by default, one section, at the
// foot of the page. Collapsed because a researcher who has read it once should
// not scroll past it every visit; present because the page above it makes
// claims that are only defensible with these caveats attached, and a caveat
// that lives in a git commit is not disclosed.
//
// WHAT BELONGS HERE THAT DOES NOT BELONG ON THE PAGE ABOVE: the deviations from
// the spec, the two metrics that exist only in this phase and what each is
// worth, and the things this tool cannot tell you. The page itself carries the
// caveats a reader needs AT the moment they read a number — that a solid-share
// change is sign-only, that Tier A moves numbers rather than buildings. This is
// the record, written once, in the order an examiner would ask.

export function DiagnoseMethods({ site, field, fieldIndex, zonesFile, corpus, evidence }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-10 mb-16 rounded-lg border border-line bg-paper">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
      >
        <span className="text-sm font-semibold text-ink">
          Methods, deviations and limitations
        </span>
        <span className="font-mono text-xs text-ink-faint">{open ? 'hide' : 'show'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-muted">
          <H>What is measured, and where</H>
          <p>
            <B>One case, developed.</B> {site?.name ?? 'Konstablerwache'} carries this phase
            because the tool has to be usable before it is general: a plaza the researcher knows,
            large enough to hold several zone types, and already carried through every earlier
            phase. Nothing here is specific to it — the same code would run on any of the
            eighteen — but nothing here has been checked against a second site either.
          </p>
          <p>
            <B>Two layers, never mixed.</B> The diagnosis, Tier A and Tier B are all field 360°:
            what a location is, whichever way you look, normalised against P5&rsquo;s frozen
            perceptual_360 bounds so a distance here means what a distance meant in P6. The
            precedent panel is the page&rsquo;s only perceptual 120° surface — a directional view
            from one spot — normalised against the frozen 120° bounds from the eighteen canonical
            readings, computed separately and never blended into the zone numbers. The two produce
            non-interchangeable values under the same four metric names, which is precisely why
            they are labelled everywhere they appear.
          </p>
          <p>
            <B>200 m sight line, everywhere, unchanged.</B> Every cast on this page runs to the
            same range as P1&ndash;P8. There is deliberately no second viewing-range control: a
            metric computed at a different range is a different quantity, and offering the choice
            here would make P9&rsquo;s numbers incomparable with the corpus they are judged
            against.
          </p>

          <H>The diagnosis</H>
          <p>
            <B>Zone types, not plaza types.</B> Assigning one label to a whole square was cut from
            scope in P6 on this project&rsquo;s own evidence — a single plaza produces materially
            different readings depending where you stand. So the unit of diagnosis is an area
            WITHIN a plaza, measured against one of the {zonesFile.k} types the corpus was
            clustered into.
          </p>
          <p>
            <B>Per point, then averaged — never the distance of the mean.</B> A selection is
            diagnosed by measuring every sampled point inside it against the intended type and
            averaging those distances. Collapsing the selection to its mean point first and
            measuring that once is a different number, and a flattering one: the mean of a
            transitional area sits between two types and can land close to either, reporting a
            tidy fit for a place that has no consistent character at all. The same rule governs
            Tier A&rsquo;s curves, which report the SHARE OF POINTS that reclassify rather than
            whether the mean point crosses a boundary.
          </p>
          <p>
            <B>The typology is frozen, and is never refitted.</B> Points are assigned to the
            centres P6 clustered from all eighteen plazas, as written to disk. Re-running k-means
            with an intervention in the pool would let the intervention redefine the categories it
            is being judged by. The P5 weights are equally final: they are read, never fitted.
          </p>
          <p>
            <B>Transfer assumption, inherited not introduced.</B> The weights were fitted on the
            360° panoramic survey and are used here to weight both the 360° zone distances and the
            120° precedent distances. That relative metric importance carries across viewing
            conditions is an assumption P6 and P7 already make and state; P9 inherits it and does
            not re-test it.
          </p>

          <H>Deviations from the build spec</H>
          <p>
            <B>The whole plaza is recomputed, not an &ldquo;affected region&rdquo;.</B> The spec
            calls for recomputing the grid region an edit affects. There is no such region:
            sightlines run to 200 m, so a mass dropped anywhere in this plaza is visible from very
            nearly every sampled point in it, and any radius-of-effect rule would be an
            approximation that is silently wrong somewhere. All{' '}
            {field?.point_count?.toLocaleString() ?? '~970'} points are re-measured at 360°, which
            takes about 150 ms — the exact answer is also the fast one.
          </p>
          <p>
            <B>Height-aware ray casting, as a flagged mode.</B> The engine&rsquo;s default treats
            every footprint as obstructing regardless of height, which is correct for buildings and
            wrong for the things a designer draws: without the flag a 300 mm planter rim would stop
            a sightline like a tower, and a pergola roof four metres up would block along its whole
            footprint. P9 casts with <code className="font-mono text-xs">heightAware: true</code>,
            which admits an obstacle only if it straddles the 1.6 m eye-height slice.{' '}
            <B>P1&ndash;P8 call the engine unflagged and are byte-identical</B> — when the flag is
            off, not one of the comparisons it introduces is evaluated, so the old path is not
            merely equivalent to the old behaviour, it is the old behaviour.
          </p>
          <p>
            The flag is a module constant, not a per-call option, so a before/after comparison
            cannot be run half in one mode and half in the other — which would attribute the
            difference between two measurement systems to the intervention, and would look
            entirely plausible. It also happens to be moot for the buildings at this site: every
            one of them stands above 1.6 m, so an empty edit reproduces P6&rsquo;s stored field
            point for point, and the flag changes only what the drawn parts do.
          </p>
          <p>
            <B>Nothing is written to the site register.</B> That is the phase gate. Interventions
            live in this browser; named scenarios go to{' '}
            <code className="font-mono text-xs">src/data/scenarios.json</code> and store what was
            drawn, never anything measured. <code className="font-mono text-xs">sites.json</code>{' '}
            is neither read for this nor written, and the endpoint that saves scenarios refuses
            any payload shaped like site data before it reaches disk.
          </p>

          <p>
            <B>Demolition, added after the first build.</B> Every additive preset in the library
            lowers isovist area, compactness and occlusivity together — measured across all nine,
            that is the one direction they travel, because an object standing in a square can only
            ever shrink and complicate the view from it. That makes whole regions of the corpus
            typology unreachable by building alone: no addition can raise area, and several zone
            types need it to. Removing a surveyed building is the only move that opens that
            direction. It stores an INDEX into the site&rsquo;s own building list, never a copy of
            the footprint, so the phase gate holds the same way it does everywhere else — nothing a
            demolition does is written to the register, and reversing it (delete it from the
            element list) restores the building exactly as surveyed. A removed building&rsquo;s
            footprint is drawn as a hole in the zone map rather than as new plaza: P6&rsquo;s grid
            never sampled the ground a building stood on, so there are no readings to show there.
          </p>

          <H>The two P9-only metrics</H>
          <p>
            Compactness (4&pi;A/P²) collapses under sparse slender obstacles: a 250 mm post stops
            one ray while its neighbours run on a hundred metres, adding two long radial edges to
            the perimeter — and perimeter enters compactness squared. Measured here, a pergola
            takes 2.5% off isovist area and 53% off compactness. Two diagnostics were added for
            this phase alone to say something useful where compactness cannot.
          </p>
          <p>
            <B>Solidity</B> (isovist area over the area of its convex hull) is the reliable one. A
            hull ignores serration by construction, so solidity reports how much of the
            space&rsquo;s reach is actually occupied rather than how ragged its edge has become. It
            is what to read instead of compactness when thin elements are in play.
          </p>
          <p>
            <B>Solid share</B> is <B>directional only</B>. It is the fraction of rays that
            terminate on something built, and at this site the baseline is already 0.981 — about
            two points of headroom at the 200 m sight line. Every additive intervention raised it
            and none lowered it, so the SIGN is a finding and the MAGNITUDE is not. It is never
            presented beside solidity as an equally reliable number.
          </p>
          <p>
            <B>Solid frontage</B> is computed and excluded from every judgement on this page. It
            reports how much built surface is in view, not how much was added, so an object
            standing in front of a facade lowers it while adding real surface. It is kept as a
            field because it costs nothing, and it does not adjudicate anything.
          </p>
          <p>
            Neither solidity nor solid share ever reaches a weight model, and neither is written to
            any corpus data file. The zone assignment uses the four validated metrics alone,
            exactly as P6 does.
          </p>

          <H>What the tiers can and cannot tell you</H>
          <p>
            <B>Tier A is a sensitivity analysis, not a design simulation.</B> It asks what would
            happen to the classification if one number moved, holding the other three fixed. No
            real design move does that: the four metrics come from one shared geometry, so a taller
            building or a narrower gap shifts several together. Tier A is for finding which
            dimension the classification here actually depends on, before spending effort on a move
            in Tier B. Its curves are drawn dashed beyond the range the other seventeen plazas were
            measured in — a dimension that only reaches its target in the dashed portion is not
            reachable from any real position in the corpus.
          </p>
          <p>
            <B>Tier B measures rather than assumes.</B> The same engine that measured all eighteen
            plazas re-measures this one with what has been drawn standing in it. What it cannot
            tell you is whether the result is good: it reports that a region moved closer to or
            further from an intended type, in a space fitted from judgements about whole
            photographs, and that is a claim about measured similarity rather than about how the
            place would feel to stand in.
          </p>
          <p>
            <B>Points that leave the sample.</B> A mass drawn over standable ground removes those
            positions from the comparison rather than measuring from inside a building. Where that
            happens the page says how many, because an apparent improvement can partly be the
            disappearance of the worst positions rather than the improvement of them.
          </p>
          <p>
            <B>What it did to the numbers, added after the first build.</B> The per-metric
            decomposition figure above reads P6&rsquo;s stored field and describes the plaza AS
            SURVEYED — it does not move when something is drawn, which is correct for a diagnosis
            but meant the page had no per-metric readout that responded to an edit at all. Tier B
            now carries one: the same four metrics, before and with the intervention,
            over the same surviving points on both sides, re-measured height-aware rather than read
            from the stored file. A change under half a percent prints as a dash rather than a
            number, because at this grid a fraction of a percent is not a result.
          </p>

          <H>Two findings that look like the tool is wrong, and are not</H>
          <p>
            <B>A short, close object can raise enclosure where a tall, distant one lowers it — from
            the same intervention.</B> The engine casts one flat ray per horizontal direction and
            stops at the first thing it meets; the enclosure angle for that direction comes from
            whatever was hit, never from anything behind it. So screening a distant facade with a
            near object does not add the two together — it SWAPS one angle for the other, and
            whichever is bigger wins. For an object of height <i>h</i> at distance <i>d</i> in
            front of a facade of height <i>H</i> at distance <i>D</i>, enclosure rises only where{' '}
            <code className="font-mono text-xs">d &lt; D·h/H</code>; beyond that distance the same
            intervention lowers it. Measured at a colonnade near Konstablerwache&rsquo;s centre:
            enclosure rose 22&ndash;36% within 12 m of it and fell slightly beyond about 20 m. This
            is not a defect — a real eye cannot see through a solid near object either — but it
            means &ldquo;enclosure went up nearby&rdquo; and &ldquo;enclosure went up across the
            selection&rdquo; can be opposite findings from one intervention, and the selection
            radius decides which one a reader sees.
          </p>
          <p>
            <B>Thin, discrete elements cannot reach &ldquo;Tight, strongly enclosed&rdquo; at any
            height or spacing.</B> That zone&rsquo;s centre needs both high enclosure AND a
            SMOOTH isovist. A colonnade closes the enclosure gap easily but serrates the isovist
            outline into dozens of long radial spikes — measured near Konstablerwache&rsquo;s
            centre, closing the column spacing to its minimum turned a 1,179 m perimeter into
            4,357 m while area fell by two thirds, driving compactness from 0.13 to 0.003. Height
            moves enclosure and nothing else; it cannot touch compactness, which is pure plan
            geometry. A solid wall of the same run reaches the enclosed type at lower enclosure
            than the tallest colonnade manages, because it does not fragment the outline. The
            corpus typology can tell &ldquo;enclosed and smooth&rdquo; from &ldquo;enclosed and
            serrated&rdquo;; it has no way to credit a rhythm of columns with reading as a
            continuous edge to a person standing among them, which architecturally it can.
          </p>
          <p>
            <B>Every additive move travels toward the same zone, which is why it dominates.</B>{' '}
            Sampling the space the corpus occupies, &ldquo;Tight, irregular&rdquo; has the SMALLEST
            basin of the five types — about 6% of the reachable space, against 36% for &ldquo;Open,
            regular&rdquo; and 28% for &ldquo;Vast, regular.&rdquo; It still dominates every
            intervention tried here because it is the only type whose required direction (lower
            area, lower compactness, lower occlusivity, higher enclosure) matches what adding an
            object to an open square does to all four at once. Two solid sides of enclosure, built
            unbroken, is the threshold that escapes it — one hole in the enclosure returns a point
            to &ldquo;Tight, irregular&rdquo; immediately, which is why the four zone types other
            than it and &ldquo;Open, facade-rich&rdquo; are hard to reach without demolition
            widening what an intervention can do.
          </p>
          <p>
            <B>One preset is the exception, and it was found by drawing scenarios rather than by
            reasoning about the library.</B> The recessed arcade is the only intervention here that
            makes a zone type MORE itself. Cut into three separate facades around this square it
            takes &ldquo;Open, facade-rich&rdquo; from 68.0% of the plaza to 93.3%, raising
            occlusivity 15.0%, isovist area 1.1% and solidity 1.2% together — the only move of the
            ten that improves three metrics at once, and the only additive one that raises area at
            all. It works because its piers stand on the ORIGINAL building line, so the surface it
            adds extends the run of continuous edge that occlusivity counts instead of breaking it,
            which is exactly what every freestanding object does instead. The qualification matters
            as much as the finding: adding one 40 m freestanding colonnade alongside those three
            recesses inverts the result — zone 0 back to 29.4%, compactness −57.6% — because
            nothing three recesses add offsets serration on that scale. An edge strategy is not one
            move, and the two halves of one pull in opposite directions.
          </p>
          <p>
            <B>Where a mass goes changes what it does to the plan, by more than the mass does.</B>{' '}
            Three pavilions placed against this square&rsquo;s existing transport accesses RAISE
            compactness 9.7%. The same three &mdash; identical footprints, identical heights &mdash;
            moved into open ground lower it 19.9%: a 28-point swing from position alone. Building
            against an obstruction that is already standing absorbs it into one silhouette, where
            the same mass in the open adds a second independent notch to the isovist. So the rule
            above &mdash; that additive moves lower area, compactness and occlusivity together
            &mdash; describes ISOLATED additions, and consolidating an existing interruption is
            outside it. That placement is also the only route found here to &ldquo;Open,
            regular&rdquo;: 0.3% of the plaza at baseline, 9.3% with the pavilions, 0.0% in the
            displaced control.
          </p>
          <p>
            <B>Height moves enclosure and nothing else, measured rather than argued.</B> Holding
            footprint and position fixed and varying only height, a 20 &times; 20 m mass gives
            isovist area −18.1% at both 8 m and 15 m, compactness +5.9% at both, and enclosure
            9.9% against 16.9% &mdash; +47.5% against +67.4% within 25 m of it. The other three
            metrics are pure plan geometry, which follows from how the engine is built; this is
            the controlled measurement of it rather than the inference.
          </p>
          <p>
            <B>A coherent-looking zone map and a structured one are not the same thing, and one
            number cannot separate them.</B> The most uniform result in the scenario set scores
            the highest neighbour agreement (96.2%) precisely because it flattened the square to
            one type. The map that reads as designed scores worse on that statistic (80.3%) and
            carries more distinct regions &mdash; 17 patches against 13, its largest 406 points
            against 670. Read patch COUNT and the size of the dominant patch beside any agreement
            figure, or homogenisation will look like structure.
          </p>

          <H>The precedent panel</H>
          <p>
            <B>A ranking is a lookup, not a validation.</B> Finding that a drawn view is close to a
            real one says a measured position exists nearby in the weighted space. It does not say
            the drawn view is good, that the precedent worked, or that anyone has agreed the two
            are alike.
          </p>
          <p>
            <B>The corpus is P7&rsquo;s {corpus?.total ?? 144} views</B> — eighteen canonical
            fingerprints plus the placed markers — cast unflagged. The probe is cast height-aware.
            Those agree exactly across the whole corpus: exactly one footprint in the eighteen
            sites stands below eye height, and it lies beyond the 200 m sight line of every view in
            the study. That is a fact about this corpus rather than a general property, and it is
            asserted in <code className="font-mono text-xs">test/precedent.test.js</code> so that
            adding a low structure near a plaza fails loudly instead of quietly.
          </p>
          {evidence && (
            <p>
              <B>What P8 established, and what it did not.</B> The matched-view study is interim:{' '}
              {evidence.participants} of an intended ~40 participants,{' '}
              {evidence.judgements} judgements. On the agreement stratum participants matched the
              framework&rsquo;s prediction{' '}
              {(evidence.agreement.accuracy * 100).toFixed(1)}% of {evidence.agreement.n} times —
              above chance on the pooled binomial (p ={' '}
              {evidence.agreement.pooledP.toFixed(3)}), which treats one person&rsquo;s twelve
              answers as twelve independent observations and therefore overstates confidence, and{' '}
              <B>not significant</B> on the participant-level sign test (p ={' '}
              {evidence.agreement.signP.toFixed(3)}), which is the defensible one. On the
              discriminating stratum the view-level measure beat both cloud-level measures{' '}
              {(evidence.discriminating.accuracy * 100).toFixed(1)}% of{' '}
              {evidence.discriminating.n} times, exact McNemar p ={' '}
              {evidence.discriminating.mcnemarP.toFixed(3)}. Those trials were selected BECAUSE the
              measures disagreed there, so the direction is interpretable and the magnitude is not
              an estimate of any measure&rsquo;s general accuracy. All of these numbers are read
              live from the responses on every page load, never written into this text.
            </p>
          )}

          <H>Provenance</H>
          <p className="font-mono text-xs leading-relaxed">
            typology: {zonesFile.k} centres, {zonesFile.generated_at ?? 'unknown'} · weights:{' '}
            {zonesFile.weighted_by?.source ?? 'unknown'} · field:{' '}
            {fieldIndex.spacing_m} m spacing, {fieldIndex.range_m} m range, normalised against{' '}
            {fieldIndex.normalisation_source} · precedent corpus: {corpus?.total ?? 0} views,{' '}
            {corpus?.fovMode ?? 'perceptual_120'}
          </p>
          <p className="font-mono text-xs leading-relaxed">
            rebuild the field with <code>npm run fields</code>, the typology with{' '}
            <code>npm run zones</code>; check the intervention library with{' '}
            <code>npm run validate:presets</code>.
          </p>
        </div>
      )}
    </section>
  )
}

function H({ children }) {
  return (
    <h3 className="pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary first:pt-0">
      {children}
    </h3>
  )
}

function B({ children }) {
  return <strong className="font-medium text-ink">{children}</strong>
}
