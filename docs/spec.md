# Spatial Fingerprinting — Web Platform Build Specification

Phased build spec for the research platform. Phases are executed **one at a time, in order**, with validation before moving on.

---

## Project Overview

A research web platform for a master's thesis in urban design called "Spatial Fingerprinting." The platform:

1. Displays 18 real public plazas (European city squares) as 3D models built from building footprints and heights
2. Lets a user click any point inside a plaza and computes four geometric metrics from that point: isovist area, compactness, occlusivity, and enclosure ratio
3. Runs a perceptual survey (triplet comparison: "which two of these three plazas feel most spatially similar?") and stores responses
4. Fits perceptual weights for the four metrics from survey data using softmax-based maximum likelihood optimization
5. Fits perceptual weights, maps isovist fields into zone types, and drives a design-diagnostic tool

Accuracy of the geometry engine matters more than speed of delivery.

Tech stack: React + Three.js for the 3D viewer; backend architecture for survey storage and weight fitting decided at P3 (leading option: GitHub Pages frontend + Supabase for responses + local Python script for fitting).

---

## Design System

The frontend carries a "drafting instrument" visual identity — see [PRODUCT.md](../PRODUCT.md) for the full brief — re-based on the environment-settings design tokens (July 2026). Warm cream paper surfaces (`#F4F2EC` page / `#EAE6DB` panels), near-black ink, and orange as the technical-pen brand color: the reference's `#F97316`/`#EA580C` carries graphic accents (progress bars, selection rings, isovist fill) while text and buttons use a darker AA-safe cut of the same hue. Redline red stays reserved for markup (viewpoint marker, warnings, wall hits). Typography is Inter for UI text and JetBrains Mono for data/coordinates/labels; primary actions are pill-shaped, cards/panels rounded. All tokens live in `src/index.css` as OKLCH `--color-*` variables. Every subsequent phase's UI (results dashboard) should extend this system rather than introduce new visual language — keep the researcher's dense working surfaces and the single-task participant survey feeling like the same family at different densities.

---

## P1 — Site Register (Data Model & Site Setup)

Foundational data structure, no computation.

**Task:** Create a `sites.json` schema seeded with entries for 18 sites. Each site:

```json
{
  "id": "gendarmenmarkt-berlin",
  "name": "Gendarmenmarkt",
  "city": "Berlin",
  "country": "Germany",
  "center_lat": 52.5136,
  "center_lng": 13.3919,
  "boundary": { "type": "Polygon", "coordinates": [[["lng", "lat"], "..."]] },
  "buildings": [
    {
      "footprint": { "type": "Polygon", "coordinates": [[["lng", "lat"], "..."]] },
      "height_m": 24.5
    }
  ],
  "default_viewpoint": { "lat": 52.5136, "lng": 13.3919 },
  "street_view_image": "/images/gendarmenmarkt.jpg"
}
```

Plus a simple admin/data-entry page: paste a building footprint (GeoJSON from OpenStreetMap) and a height value, and it appends correctly to a site's `buildings` array. All 18 sites' geometry is populated manually via OSM export — the tool accepts this data, it does not source it automatically (OSM height data is unreliable).

**Gate: do not proceed to P2 until the data structure is confirmed working and at least 2 sites are populated with real building data.**

---

## P2 — Spatial Analysis: 3D Viewer & Ray-Casting Engine

**Task:** A Three.js scene that:

- Loads a selected site's `boundary` and `buildings` from `sites.json`
- Renders each building as an extruded polygon (footprint extruded up by `height_m`)
- Renders the plaza's open boundary as a ground plane
- Camera orbit/pan/zoom
- Click anywhere inside the plaza boundary → place a visible marker (small sphere) at that point and log its coordinates
- After placing the vantage point, a second click sets a **viewing direction** (facing bearing) — load-bearing for both the isovist and the enclosure ratio in the metrics engine below, since both share the same 120° cone centered on it

**Validation before the ray-casting engine:** load a real site; confirm buildings appear at correct relative heights and positions; confirm clicking places a marker at the correct location (not offset or inverted); confirm the viewing direction can be set and read back correctly.

**Status: done.** Click-to-place + click-to-aim implemented in `SiteViewer.jsx` — first click places the vantage point (with a default facing direction toward the plaza centroid), second click re-aims it; a "Move viewpoint" button restarts the cycle.

---

### P2 (continued) — Unified Ray-Casting Engine (THE CRITICAL PART)

The most important and error-prone phase. Follow exactly — do not approximate the geometry logic.

#### Design: unified single-cone ray-casting

Isovist and Enclosure Ratio are computed from **one shared ray-casting pass**, not two independent ones — same vantage point, same viewing direction, same 120° field of view, same 200 m range.

**Inputs:**
- Vantage point `(x0, y0)` — the clicked point; planar 2D isovist to start (see note below)
- Viewing direction — set via the second click in the viewer (facing bearing)
- Field of view: **120°**, centered on the viewing direction
- The site's building footprint polygons (obstacles), each with an effective height
- Max ray length `max_vista = 200 m`
- Ray count: **120 rays** (1 ray per degree across the 120° cone) — matches the original Grasshopper "Precision" setting (1 ray/degree)

**Algorithm:**
1. Cast 120 rays evenly spaced across the 120° FOV, centered on the viewing direction, from `(x0, y0)`.
2. Test each ray against every building footprint edge (line segment) in the site.
3. Record the **nearest intersection** per ray, and the height of the building hit (if any). No intersection within `max_vista` → terminate at `max_vista`, flag as **open**. Hit a wall → terminate there, flag as **wall** (with the building's height).
4. The isovist polygon is the vantage point plus the ordered ray endpoints (sorted by angle) — the vantage point itself closes the two side edges of the cone, since a 120° wedge isn't a full loop of ray endpoints alone.
5. Separately, the `(height, distance)` pairs feed Enclosure — every ray, with a no-hit ray contributing 0 (see the formula below).

**Metric formulas — confirmed against real Grasshopper output (Gendarmenmarkt, Berlin):**

Given the isovist polygon vertices `(xᵢ, yᵢ)` relative to the vantage point:

- **Area** (shoelace): `Area = |Σ (x[i-1]·y[i] − x[i]·y[i-1])| / 2`
- **Perimeter**: `Σ sqrt((x[i]−x[i-1])² + (y[i]−y[i-1])²)` over all polygon edges (wall-bound and range-bound)
- **Compactness** (isoperimetric quotient): `(4π × Area) / Perimeter²`
- **Occlusivity — closed perimeter (Uv), a raw length in meters, NOT a 0–1 ratio:** `Σ sqrt((x[i]−x[i-1])² + (y[i]−y[i-1])²)` over consecutive vertex pairs where both are wall-type **and the edge runs along continuous facade** — both hits on the same building, or on two buildings that meet (within 1.5 m). Do **not** implement `1 − Uv/Perimeter` (Benedikt's normalized ratio) — confirmed via reverse calculation that this does not match the existing 18-site dataset.

  **Compared against Grasshopper 2026-08-29 — one site, one point.** The reverse calculation above only excluded Benedikt's *normalised ratio*, which is a 0–1 figure where Grasshopper reports metres. It never excluded Benedikt's occlusivity as a **raw length** — the occluding radials, also in metres — so "we compute what Grasshopper computes" rested on an assumption, not a test. Now tested directly against a Grasshopper run on Zeil reporting all four metrics at one point (area 11027.471661, compactness 0.109993, occlusivity 376.34603, enclosure 0.533774, 360° / 200 m). Area and compactness are definition-stable, so they pin the pose without presupposing anything about the quantity under test; sampling vantage points inside the boundary and keeping the 86 that reproduce both within 6% gives:

  | candidate | range over matching poses | holds 376.35? |
  |---|---|---|
  | closed perimeter (this implementation) | 259.9 – 425.3, median 353.8 | **yes** |
  | occluding radials (Benedikt, raw length) | 636.0 – 771.9 | no — ~2× high |
  | radials + range-capped arc | 684.8 – 831.3 | no |

  On this one comparison Decoding Spaces reports closed perimeter, and the margin against Benedikt is wide enough (~2x) that no plausible pose or geometry difference closes it. **This is agreement at a single point on a single site, not verification.** One reference point cannot establish that the two implementations agree in general: it rules out the Benedikt forms convincingly, but a systematic offset that happens to be small at Zeil would not show up here. Two or three further Grasshopper runs — different plazas, all four metrics and the exact vantage point recorded each time — are needed before the engine can be described as validated rather than consistent. Note the reference run is **360°**: no 120° pose reproduces that area, so a directional reference cannot be used for this comparison.

  The **Gendarmenmarkt** reference below must NOT be used to test metric definitions. At our canonical point its area agrees to 0.7% while compactness is off by 53% — the isovist is a different shape, so the pose or the building model differs, and no definition would match. It survives only as the order-of-magnitude sanity check it is described as.

  **Corrected 2026-08-27.** The rule was previously "both vertices are wall-type", with no check that they lay on the *same* wall. Where one ray stops on a near facade and the next slips past its corner into a side street to land on a different building far away, the edge between those hits crosses open street — it is the gap between buildings, the opposite of closed perimeter — yet both ends are wall hits, so it was counted. The error is one-directional (a phantom edge can only add length) and large: measured against Grasshopper at a matched point on Zeil, 559 m vs 376 m, where the corrected rule gives 355 m. It also made the metric unstable in a way a measurement of a place must not be — 199→273 m across ray counts at one fixed point, and ~27% across a 1.2° rotation, while area moved under 0.5%. Correcting it lowered stored occlusivity by ~50% at every site and left area, perimeter and compactness untouched (drift 0.000%), which is the signature of a labelling fix rather than a geometry one. Readings were re-derived in place from the same vantage points via `npm run recompute:readings`.
- **Enclosure**: `average( atan(hᵢ / dᵢ) / (π/2) )` over **every** ray `i`, where a ray that meets no building contributes **0**. `hᵢ` is the hit building's height, `dᵢ` the horizontal distance from the vantage point. The result is 0–1: the mean angle the built edge rises to around you, as a share of the 90° you could in principle look up. Multiply by 90 to read it in degrees, which is how the classical enclosure thresholds are stated (45° / 27° / 18° / 14°).

  **Changed 2026-08-27**, from `average(hᵢ / dᵢ)` over wall-hit rays only. Two flaws, both structural rather than calibration:
  1. **Openings were invisible.** Rays meeting no building were *excluded from the average* rather than counted as 0, so a square leaking 40% of its horizon to streets was scored only on the walled 60% — and could tie with one completely ringed by the same facades. Openness is not missing data about enclosure; it is the absence of enclosure, and must enter the average as such.
  2. **`h/d` is unbounded, but a view is not.** You cannot look up past 90°, so the step from `h/d` = 4 to 8 (76° → 83°) is nothing like the doubling the ratio implies. Because the figure is averaged over the ring, an unbounded term also let a single tall building near the vantage point dominate it. The arctangent saturates: height still raises enclosure (doubling every building raises it ≈1.7×) without one direction swamping the rest.

  Chosen on those grounds plus a better match to the P3 ratings (partial *r* controlling for isovist area: 0.51 → 0.63), **before** refitting — deliberately not chosen by which formulation maximises enclosure's fitted weight, since H3 is a claim *about* that weight. For the record, the change raises it ~58–61%, and leaves held-out accuracy unmoved (±0.5 pp). Readings re-derived in place via `npm run recompute:readings`.

**Gendarmenmarkt validation reference (from Grasshopper):**

| Metric | Reference value |
|---|---|
| Isovist Area | 12437.877366 m² |
| Compactness | 0.269934 |
| Occlusivity (closed perimeter) | 354.097561 m |
| Enclosure Ratio | 0.330407 | ← *superseded: computed under the pre-2026-08-27 `mean(h/d)` definition, not comparable to the current angular measure* |

**Validation gate before P3:** compute all four metrics for Gendarmenmarkt and compare against the table above (~2–3% tolerance; >10–15% indicates a bug — most likely candidates: angle convention, vertex ordering before the shoelace formula, or wall/open misclassification). The exact original Grasshopper vantage point/direction were not recorded, so an exact match isn't expected — treat this as a soft sanity check on order of magnitude and internal consistency, not a byte-for-byte match.

**Implementation note:** start with a **planar (2D) isovist** — matches what Decoding Spaces computes and is far simpler to get correct. True 3D isovist only after 2D is fully validated.

#### 3D Visualization (build alongside the engine)

- **Isovist polygon**: flat, semi-transparent polygon at ground level from the shared ray pass.
- **Enclosure profile**: a ribbon rising from ground to each wall-hit ray's building height, connected in ray order, breaking at open rays — reads as a partial "fence" tracing the enclosing buildings within the cone.
- Both update live as the vantage point or viewing direction change.

**Status: done.** Implemented in `src/lib/isovist.js` (ray-casting + metrics) and `src/components/IsovistOverlay.jsx` (live polygon + ribbon rendering), wired into `SiteViewer.jsx`. Best-effort validated against the Gendarmenmarkt reference above (Area/Compactness/Occlusivity within ~5–11% at an arbitrary vantage point; Enclosure Ratio further off, expected since the original point wasn't reproduced exactly). No console errors; visually confirmed the isovist wedge and enclosure ribbon render correctly, bounded by real building facades.

---

## P3 — Perceptual Survey: Views

- Participant lands on a survey URL, no login, gets an independently generated random set of 27 triplets (see "Triplet sampling — as built" below)
- Each triplet: 3 site images (pre-uploaded Street View, not live API) side by side
- Instruction: "Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Please judge based on the sense of space, not architectural style or surface materials."
- Participant picks a pair; stored as `{ participant_id, triplet_id, site_a, site_b, site_c, chosen_pair, timestamp }`
- 1 attention-check triplet with an obvious extreme pair, flagged separately, placed around question 13–14 so it isn't clustered with the closing questions
- Thank-you screen; only optional self-report field: "Do you have a background in architecture, urban design, or planning? Yes/No" (for the rater-expertise limitations analysis)

**Target sample:** 30–50 participants. This figure is not decoration — it is the assumption the sampling design rests on (see below), and it is defined once in code as `TARGET_PARTICIPANTS` in `src/lib/triplets.js`.

**Triplet sampling — as built.** Each participant is served an independently generated set of triplets, and **nothing is coordinated or tracked across participants**:

- On opening the survey, a participant gets a fresh id, which seeds a private pool of triplets built so that within *that pool* every pair of the active sites co-occurs at least `MIN_PAIR_COVERAGE` (2) times.
- Their 27 questions are a seeded slice of that pool — 26 genuine triplets plus one attention check. The pool runs to ~120 triplets for 18 sites, so a participant sees roughly a fifth of it.
- Two participants therefore never negotiate: their sets are drawn blind to one another and may overlap freely. Nor does any individual participant get a guarantee about their own 26 — a given site may appear only once, or not at all, in one person's set.

**Why no cross-participant coordination.** An earlier draft of this spec called for subsets "tracked so participants don't see heavily overlapping sets." That mechanism was never built, and after review it is deliberately **out of scope**: at the 30–50 participant target, independent random sampling is expected to accumulate ample pooled coverage of all 153 site pairs on its own, which is the level the P5 weight fit actually consumes. Real-time coordination would require server-side assignment state for a benefit the scale already provides. Simulating the shipped sampler supports this: all 153 pairs reach ≥2 co-occurrences at around 20 participants, and by 30–50 the per-pair minimum sits near 6–13 with a mean of 15–25. That is a simulation of the assumption, not evidence about real recruitment — which is exactly why the coverage panel below exists.

**How the assumption is checked.** Because pooled balance is now an expectation rather than an enforced property, it is verified empirically instead of assumed: the **Pooled coverage** panel on the P4 dashboard computes, live from the stored responses, how many times each site and each of the 153 pairs has actually been shown — with the per-pair minimum, maximum, and mean, and any pair still at zero flagged explicitly. Attention checks are excluded (they repeat a site against itself), and the panel can be restricted to fit-eligible sessions. If coverage has not converged by the time recruitment nears the target, the assumption is wrong and the sampling design — not the analysis — is what needs revisiting. Implementation: `src/lib/coverage.js` and `src/components/CoveragePanel.jsx`.

**Session records:** each participant's session is one record, saved again after every answer (upserted on `participant_id`) rather than once at the end, so an abandoned survey still retains everything answered up to the point the participant left. Alongside the responses each record carries `status` (`in_progress` → `completed` on reaching the thank-you screen; read as `abandoned` after 30 minutes of inactivity without completion — derived, never destructive) and `attention_check_passed`, a top-level boolean so submissions can be filtered for the P5 weight fit without parsing the nested response list. See `src/lib/session.js`.

---

## P4 — Survey Results Dashboard

The researcher's read on the collected responses, and nothing derived from them. Route `#/results`.

- Session counts: total, completed, abandoned (derived after 30 minutes of inactivity — a label, never a deletion), triplet judgements collected
- Attention-check pass rate over the sessions that reached the check; sessions that stopped before it are neither passes nor failures
- Median completion time, participant background and age breakdowns (completed sessions only — demographics are asked last)
- Per-session table: status, answers given, check result, duration, background, age
- **Pooled coverage** panel (`src/lib/coverage.js`, `src/components/CoveragePanel.jsx`) — the empirical check on the P3 sampling assumption described above

Everything computed *from* the responses — fitted weights, hypothesis tests, zone typology — belongs to P5 and later, not here.

**Status: done.**

---

## P5 — Weight Fitting & Hypothesis Testing

Operates on whichever perceptual layer matches the instrument — see **Source pairing** below. Module `src/lib/analysis/`, runner `npm run analyze` → `src/data/analysis-<source>.json`. Route `#/weights`.

**Source pairing (added 2026-08-29).** The stimulus a participant judged and the geometry the fit reads must be the same measurement of the same thing. Panoramic responses are judgements of the full surround and pair with `perceptual_360`; the archived static-photo responses are judgements of one directed view and pair with `perceptual_120`. The pairing is declared in one place (`SOURCES` in `scripts/analyze.mjs`) and selected by name, so the two halves can never be set independently and disagree. The live study is `--source=panoramic`. `--limit=N` refits on the first N participants by start time, for checking whether a conclusion has settled as the sample grew.

**Sight-line range: 200 m.** A 100 m variant was built and tested against Gehl's social field of vision and is not carried. The plazas reorder very little between the two, and 200 m is what the Grasshopper reference toolchain uses, which keeps the study comparable to the established isovist literature rather than to one reading of one author.

**The fit reads the TRIPLETS ONLY (decided 2026-08-29).** Every plaza is placed by measured geometry; the rating block never enters the coordinates. An earlier version blended the two, placing each plaza midway between what the engine measured and what participants reported. It was dropped on two grounds:

1. **The mixture fraction was unjustifiable.** 50/50 is a stated preference, not a quantity the study can derive, and a thesis should not rest on a free parameter chosen by the author.
2. **It was circular.** Locating plazas by participants' ratings and then predicting those same participants' choices uses one sample twice. A leave-one-participant-out test — rebuilding the space from the other 29 for each held-out person — showed the apparent gain vanishing entirely (47.5% against 49.7% for pure geometry, sign-test p = 0.84).

The rating block is not discarded, it is **repurposed**. It answers a different and cleaner question — do people perceive these four dimensions the way the geometry measures them? — as an independent validation in `scripts/validate-ratings.mjs` → `src/data/rating-validation.json`. Ratings never touch the weights, which is what makes that validation a real test rather than a restatement of the fit.

**Rating validation method.** Per scale, each plaza's mean rating is correlated against its computed value across the 18 plazas. Reported **aligned**: the occlusivity scale runs backwards relative to its metric (its 7 end reads "clear sightlines, nothing hidden", i.e. LOW occlusivity), so its raw *r* is negated and positive always means agreement. `EXPECTED_SIGN` encodes this once and is asserted against `RATING_SCALES` so a reworded anchor cannot silently flip a result. Three further quantities are reported because a bare correlation is ambiguous:

- **Split-half reliability** (Spearman–Brown corrected, 2000 random splits) — whether participants agree with *each other*. This is the ceiling: no measurement can track a group mean better than that mean tracks itself, and it separates "our formula is wrong" from "people were guessing".
- **Two intervals.** A Fisher interval asks how well 18 plazas pin the number down; a participant bootstrap asks whether a different sample of people would have given the same answer. A dimension is established only when both are narrow and clear of zero.
- **Holm correction** across the four scales, since testing four dimensions on one dataset inflates the chance of a false positive.

Given the survey responses and the 18 sites' canonical 4 metrics (min–max normalised across sites, bounds frozen into `analysis.json` and reused by every later phase):

For each response `(site_a, site_b, site_c, chosen_pair)`:
- Weighted distance per pair: `d(x,y) = sqrt(Σ wₖ (xₖ − yₖ)²)` over the 4 metrics
- Softmax choice probability: `P(pair) = exp(−d(pair)²) / Σ exp(−d(other pairs)²)`
- NLL contribution: `−log(P(chosen_pair))`

Minimise total NLL over `w1..w4`, optimised in log-space for positivity, multi-start from seeded inits. Reported weights are normalised to sum to 1 **after** fitting — never as a constraint during it, since overall weight scale is the model's only sharpness parameter (softmax temperature is not separately identifiable and is deliberately not a model parameter).

**Also:**
- **Bootstrap:** 1000 participant-level resamples → mean + 95% CI per weight, seeded
- **Leave-one-plaza-out CV:** hold out all triplets involving one site, refit, predict held out; average accuracy over 18 folds; permutation test (1000 label shuffles)
- **Area-only baseline** and **leave-one-metric-out ablation** for all four metrics
- **Exclusions:** attention-check triplets are dropped from the fit (they repeat a site against itself and carry no similarity judgement); participants who failed the check are dropped. Partial sessions that reached and passed the check are included. The dashboard states the resulting breakdown explicitly.

  **Attention checks are per-instrument (added 2026-08-29).** The panoramic survey administers none, by design. `instrumentHasAttentionCheck()` in `exclusions.js` detects this — no `attention_check_passed` field and no `is_attention_check` triplet anywhere in the records — and when an instrument has no check, every participant is eligible. Without that test the "never reached the check" rule dropped *every* panoramic participant, silently, because none of them could reach a check that does not exist. The analysis prints which case applies rather than leaving it to be inferred.

**Hypotheses (reformulated 2026-09-04).** The original H1–H3 were placeholders. Two were unsound and were replaced before the proposal: the old H2 ("four metrics beat area alone") is a model-selection question the design is far too underpowered to resolve — the interval on the difference spans ±3 pp — and its answer depends on how correlated the metrics happen to be in the chosen corpus rather than on anything about perception. The old H3 ("enclosure carries the largest weight") is **not scale-invariant**: under min–max normalisation the order is area > compactness > enclosure > occlusivity, and under rank normalisation compactness and enclosure swap. A hypothesis whose answer changes with a preprocessing choice is not a hypothesis about the world, and with all four bootstrap intervals overlapping heavily the design cannot rank them regardless.

The replacement set follows the standard construct-validation sequence — is there a percept, do the measures capture it, do they predict independent judgements, do they add up to more than their strongest part:

| | Claim | Test |
|---|---|---|
| **H1** | Untrained observers agree with one another in judging plaza spatial properties | Split-half reliability per scale |
| **H2** | Computed isovist metrics converge with lay judgements of the same properties | Aligned *r*, Holm-corrected, per dimension |
| **H3** | Occlusivity does not converge with perceived concealment, for definitional rather than implementation reasons | All four published definitions vs the ratings; reliability confirms the percept is stable |
| **H4** | Perceived similarity is predicted by distance in the measured isovist space | Leave-one-plaza-out accuracy vs chance, permutation test |
| **H5** | All four dimensions carry non-zero perceptual weight | Bootstrap intervals excluding zero; leave-one-metric-out ablation |
| **H6** | The fingerprint predicts similarity better than its single strongest dimension | Paired sign test against the area-only baseline across folds |

H5 is the answerable form of the old H3 — it asks whether each dimension is used at all, which is scale-invariant, rather than ranking them, which is not. H6 preserves the old H2's question but is framed so that failing it is a finding about corpus composition rather than about the framework.

These were formulated with results in hand, replacing placeholders before the proposal. That is legitimate and must be **stated plainly in the methods**; the exploratory analyses behind H3 in particular are to be labelled as such.

**Two rules govern cross-validation, and both are load-bearing:**

1. **No fold is warm-started from the full-data fit.** Seeding a fold's optimisation from weights that were fitted using the held-out triplets leaks the answer into the prediction — cross-validation measuring itself. Every fold starts neutral and finds its own optimum from its training half alone.
2. **The observed statistic and every permutation replicate use the identical fold-fitting procedure** (`FOLD_FIT` in `src/lib/analysis/crossval.js`: one neutral start, 300 Adam iterations). A permutation test is exact only when the statistic is computed the same way on real and shuffled labels; fitting the observed folds harder than the null's would bias the null downward and make every p-value look better than it is.

**Gradient.** The fitter uses the exact analytic gradient `∂NLL/∂wₖ = Σ_t [δ_chosen,k − Σ_p P_p·δ_p,k]` rather than central differences. It is both exact and about eight times cheaper, which is what brings 1000 bootstrap refits and an 18-fold × 1000-replicate permutation test into minutes. `test/analysis.test.js` checks it against central differences so the derivation cannot rot silently.

**Fold multiplicity.** A triplet names three sites, so it is held out in three of the eighteen folds. Accuracy is reported as the mean of the eighteen fold accuracies — a macro-average over plazas, not a pooled count over triplets, which would weight each triplet three times.

**Gate: synthetic-data recovery.** Generate responses from known weights via the same softmax model, confirm recovery within tolerance and permutation p uniform under shuffled labels. No real number is trustworthy until this passes.

---

## P6 — Isovist Field Mapping & Zone Typology

Operates only on the field (360°) layer. Batch script `scripts/compute-fields.mjs` + `npm run fields`. Route `#/field`.

- Regular grid across each site boundary, excluding points inside or too close to buildings; spacing configurable, default 2.5 m; every point computed at 360° and recorded with `fov_mode: "field_360"`
- **Normalisation reuses P5's frozen bounds — corrected 2026-09-04.** This section previously said the field layer pools its own bounds across all 18 sites' grid points *and* that clustering happens "in the P5-weighted space". Those instructions contradict each other. The weights (area 0.312, compactness 0.275, occlusivity 0.207, enclosure 0.206) were fitted against P5's normalisation; grid points include positions tight against walls with very small isovists, so a pooled field range is much wider, and reusing the weights on a rescaled axis would silently change what each weight means. The resolution is to normalise field points against **P5's `perceptual_360` bounds**, so the weighted space is continuous with the perceptual results and a weight keeps its fitted meaning.

  Grid points more extreme than any surveyed vantage point therefore fall **outside 0–1**, which is correct and is recorded rather than clipped: clipping would collapse genuinely distinct positions onto the boundary value. The field output records the share of points outside range per metric so the extrapolation is visible.

  This is a deliberate exception to the layer-separation rule below, which forbids sharing bounds *between measurement systems*. Here the field layer is deliberately expressed in the perceptual layer's coordinates so that P5's weights apply; the exception is recorded in the output as `normalisation_source: "perceptual_360"` so no reader has to infer it.
- Global zone typology: k-means over the pooled points in the P5-weighted space; k chosen from k=2–12 diagnostics (silhouette and inertia computed in the same weighted space), documented with written justification; seeded k-means++ with multiple restarts so the typology is reproducible
- Per-site metric heatmaps, zone maps, zone composition profiles, and a cross-site composition chart
- Every composition figure states the per-site sampled point count beside it — small plazas yield few points and their percentages must not be read as precise

**Gate:** all 18 sites computed; zone types render with consistent global colours; composition chart produced.

**Built 2026-09-04.** `npm run fields` (grid + 360° cast) then `npm run zones` (typology) then route `#/field`. Outcome:

- **11,580 points** across the 18 plazas at 2.5 m, from 186 (Naschmarkt) to 1,297 (Hauptwache). Points inside a footprint or within 1 m of a facade are not sampled.
- **A spatial index was added to the engine** (`buildEdgeIndex` in `isovist.js`): building edges are bucketed into a uniform grid and a ray walks only the cells it crosses, nearest first, stopping once the closest hit so far beats the next cell's entry distance. It is a speed change only — `test/isovist.test.js` asserts the indexed and brute-force paths agree **exactly**, per ray and per metric, not merely closely. Measured 36–208× faster, which turned a ~10-minute grid run into seconds and is what makes P9 Tier B's interactive recompute feasible.
- **k = 5, chosen on two criteria, not one.** Mean silhouette peaks at k = 3 — but there 13 of 18 plazas come out as a single zone, so the map restates which plaza you are in rather than describing places within it. That is plaza-level typology, removed from scope below, and it would leave P9 (which diagnoses zone types, not whole-plaza labels) with nothing to operate on. k is therefore the smallest value whose silhouette stays within 0.04 of the peak AND which resolves structure inside plazas; both thresholds are stated in `compute-zones.mjs` rather than tuned to an outcome, and the full k = 2–12 table is written to `zones.json` so the choice can be re-argued from the numbers. At k = 5: silhouette 0.353 against a 0.380 peak, 4 single-zone plazas, 2.2 zones per plaza.
- **Robustness:** clustering with all four metrics weighted equally leaves **95.9%** of points in a corresponding zone, so the typology is not an artefact of the transfer assumption.
- Out-of-range shares under P5 normalisation: area 6.6%, compactness 13.7%, occlusivity 11.2%, enclosure 11.5%.

---

## P7 — View-Cloud Comparison

Perceptual (120°) layer. Route `#/cloud-comparison`. User-placed viewpoint markers with headings form each plaza's view cloud; compared set-to-set by centroid, Gaussian/Wasserstein, and Chamfer distance, all in the weighted space. No clustering is applied to these distances.

**Gate:** Chamfer reproduces the centroid-failure case on a constructed two-cluster example.

**Built 2026-09-06.** Route `#/cloud-comparison`. Marker placement and all three distances run in the browser; there is no batch script, because eighteen clouds of eight points is a few thousand distance evaluations (measured: 14 ms for all three 18x18 matrices) and the numbers have to respond while views are being placed. Decisions taken:

- **Cloud composition.** A cloud is the plaza's canonical 120° fingerprint plus seven placed markers. The canonical reading is composed in at read time from `results.json` rather than copied into `view-clouds.json`, so it cannot drift from P5; it is locked in the editor and cannot be deleted. `view-clouds.json` therefore stores only placed markers.
- **Placement surface.** Markers are placed on a top-down plan (`ViewCloudEditor`), not in the 3D viewer. The measurement is identical either way — the same `castIsovist`, 120 rays over 120° to 200 m — but the judgement being made is different: not "does this match a photograph" (the canonical protocol, which the 3D viewer suits) but "are these positions spread across the plaza the way a person moving through it would stand", which is a question about plan layout. Vantages must sit inside the boundary and at least 1 m from any facade, the same clearance the P6 grid uses, so both layers agree about what counts as standable ground. That rule governs newly placed markers only: two canonical vantages (Marktplatz Heidelberg, Hauptmarkt Trier) sit just outside their boundary because the capture protocol put them where the Street View camera stood, and enforcing the rule on them would mean either moving a P5 fingerprint or dropping it from its own cloud.
- **Eight views per plaza, equal everywhere.** Not proportional to plaza size: Chamfer averages over each cloud, so a more densely sampled plaza would give its neighbours more chances to find a close match without being charged for it. Eight is also the least that leaves a 4x4 covariance with more observations than dimensions, which the Gaussian measure needs. The comparison section refuses to draw a matrix until every cloud reaches the target.
- **Normalisation.** Markers are scaled against the frozen `perceptual_120` bounds from the eighteen canonical readings — never P6's 360° bounds, and never the markers' own pooled range, which would move the scale each time a view was added. Out-of-range markers are kept unclipped and counted on the page; a scratch run with randomly placed views put over half of them outside 0–1, so this is not a marginal case.
- **Weights: a transfer assumption, stated.** Distances use the P5 weights, which were fitted on the panoramic 360° survey. Applying them to 120° readings assumes relative metric importance carries across viewing conditions — the same assumption P6 makes. An equal-weight rank correlation is reported on the page as the robustness check.
- **Gaussian implementation.** W₂² = ‖μA−μB‖² + tr(ΣA + ΣB − 2(ΣA^½ ΣB ΣA^½)^½), using the Bures form rather than the textbook inverse-based one. With eight points in four dimensions the sample covariance is near-singular by construction, and the inverse form produces large numbers out of rounding error; the Bures form needs no inverse. `test/clouds.test.js` pins this on a deliberately rank-deficient cloud.
- **The gate, twice.** `test/clouds.test.js` constructs the centroid-failure case the spec asks for (two separated groups against a cloud sitting between them: centroid < 0.01, Chamfer 0.27, a factor above 20) and then a harder one the spec does not: two clouds with *identical* mean and *identical* covariance, so centroid and Gaussian both report exactly zero by mathematical necessity while Chamfer still separates them. The second is the real argument for Chamfer, since it shows the limit of the Gaussian and not only of the centroid.
- **View-level matching, added 2026-09-06.** The cloud distances answer "which plazas are alike"; they do not answer the question the phase is actually interesting for, which is which *view* corresponds to which. `matchViews` and `globalNearestViews` expose the pairings Chamfer already computes internally and previously averaged away. The page reports the closest individual view pairs across the corpus (same-plaza pairs excluded — two views of one square being alike is not a finding), a plan diagram joining each view in one plaza to its nearest counterpart in another, and a side-by-side perspective render of any chosen pair.
- **The perspective render is P8's stimulus generator, built early.** `ViewRender` places a camera at a marker's vantage and heading at 1.6 m eye height with the measured 120° field, over the same extruded masses the isovist ran on — no textures or invented detail, which would show a reader something never measured. The horizontal-to-vertical FOV conversion is in `lib/viewGeometry.js` and tested: passing the 120 straight to three.js would render 144° on a 16:9 frame, a fifth more world than was counted, and would look entirely correct on screen. Building it in P7 means the phase's claim can be checked by eye, and P8 inherits a tested component.
- **One drawing scale across the platform, corrected 2026-09-06.** P6's fixed-window rule lived inside `FieldPage`, and P7's first version cropped each plan to its own plaza — so plazas were drawn at different scales and stroke widths in map units read thick on a small square and thin on a large one. The rule is now `corpusWindowRadius` in `lib/site.js` (widest boundary + 40 m context = 114.9 m), shared by P6's field maps and P7's plans. The editor keeps a "fit plaza" toggle for placement precision, defaulting to corpus scale.
- **The single-point comparison quantified, 2026-09-08.** The original figure plotted only the selected measure against canonical distance with a Spearman ρ in the caption — qualitative ("dots on a rising line"). It now reports Pearson r, R² and Spearman ρ for all three measures side by side (`SinglePointGradient`), so the claim that richer aggregation recovers information is a numeric progression across the row, not an impression from one scatter. On the real placed data (126 markers, all 18 clouds complete): centroid r²=0.367, gaussian r²=0.238, chamfer r²=0.319 against the canonical single-point distance — none near 1, meaning the cloud comparison is not simply restating what one point already said. A table of the six pairs whose Chamfer distance deviates furthest from the OLS trend line names the specific plazas where the richer measure disagrees most with the single-point picture, rather than leaving disagreement as a visual impression.
- **Non-independence, stated rather than glossed.** The 153 points in each panel are pairwise distances among 18 plazas — each plaza's distances appear in 17 of the 153 pairs — so they are not independent observations and a textbook p-value on r would overstate significance. r/R²/ρ are reported as descriptive effect sizes only; a rigorous significance test would need a Mantel-style permutation on plaza labels, named here as a limitation rather than silently worked around.
- **One figure type scale, corrected 2026-09-06.** P5's palette and type sizes were private to `FingerprintCharts.jsx`, so P6 and P7 re-picked their own. They now live in `components/charts/tokens.js`. The subtler half of the same bug: an SVG with a viewBox renders scaled to its container, so P7's 460-unit canvases magnified their text about twice as much as P5's 900-unit ones — identical `fontSize` numbers, visibly different sizes. Canvas width is therefore part of the type scale and is recorded as `CANVAS_W` beside it.
- **No clustering, and no MDS map.** Chamfer can violate the triangle inequality, so it is not a metric, and both k-means and classical MDS assume one. P5's 18-plaza map has no counterpart here on purpose. What is drawn instead is the pairwise matrix, the Spearman agreement between the three measures, the plaza pairs whose rank moves furthest between centroid and Chamfer, and cloud distance against the canonical single-point distance — the figure that says whether the phase changed any answer.

---

## P8 — Matched-View Validation Survey

Two-alternative forced choice testing whether the view pairs Chamfer matches are the ones people agree with. Participant route `?matched-view-survey` (chrome-free, like P3); researcher review lives in the Analysis group. Binomial test against 50%; the same responses are re-scored against centroid- and Gaussian-derived predictions so the three measures can be adjudicated.

**Gate:** instrument runs end to end; analysis correct on synthetic data.

**Built 2026-09-08.** `npm run trials:matched-view` (freeze the bank) then `npm run matched-view:selftest` (the gate), participant route `?matched-view-survey`, researcher route `#/matched-view`. Decisions taken:

- **The trial, and how one screen adjudicates three measures.** A reference view on top, two candidate views below, forced choice. Each candidate plaza is represented by **its own view nearest the reference** in the weighted space. That constraint is what makes the screen fair rather than rigged: with a randomly drawn foil the view-level measure would win trivially and the comparison would be worthless. Chamfer then predicts the candidate whose *view* is nearer — its own internal pairing, exposed by `matchViews` instead of averaged away — while centroid and Gaussian predict the candidate whose *plaza cloud* is nearer. Those two are set-to-set measures with no view-level pairing of their own, so "which plaza, ignoring which view" is not a weakened form of their prediction, it **is** their prediction. The adjudication therefore asks exactly the right question: does knowing which view you stand at add anything over knowing which plaza you are in?
- **Two strata, never pooled into one headline.** `agreement` (all three measures name the same candidate) tests the framework against chance; `discriminating` (Chamfer splits from both cloud measures) does the adjudication. A single pooled accuracy would be an estimate of each measure's general accuracy computed on trials selected *because* the measures disagree — biased by construction, in a direction that depends on the mix. Trials where centroid and Gaussian split from **each other** (1,872 of them) are discarded rather than kept as a third stratum: they test the two cloud measures against one another, which is not this phase's question.
- **The bank is frozen, unlike P7's live arithmetic.** P7 recomputes in the browser because its numbers must respond while markers are placed. A survey instrument is the opposite case: every participant must judge the same trials, and a prediction must be the one that was current when it was answered. `scripts/build-matched-view-trials.mjs` writes `matched-view-trials.json` once, with its weights, bounds and marker provenance recorded. Answers carry the predictions that were live when given; if the bank is ever rebuilt, affected sessions are reported as **orphaned** or **stale** on the page rather than silently rescored against predictions nobody saw.
- **A margin floor, added after the first build was wrong.** `strength` is the weakest of a trial's three margins, each normalised by its own measure's mean distance. The first selection pass took the *strongest* trials for the discriminating stratum and, through a sorting bug, the *weakest* for the agreement stratum — 26 of 72 agreement trials came out under 0.02, effectively coin flips. That would have pinned the agreement stratum near chance for a reason with nothing to do with perception, and made the two strata incomparable. Fixed two ways: a floor of `MIN_STRENGTH = 0.05` everywhere, and equal-count strength bins for the agreement stratum so it spans its range by construction. Both strata now span comparable margins (agreement 0.087–0.739, discriminating 0.208–1.094).
- **Balance is enforced, not hoped for.** Every plaza anchors the same number of trials as reference, because the reference is what a trial is *about*. Candidate appearances are levelled by a greedy least-used-first pass inside a quality window; the first build ranged from 6 to 39 appearances per plaza, which would have made the study a description of a handful of squares. Now 11–13. Both are asserted in `test/matchedView.test.js`.
- **Short instrument, deliberately: 12 trials, two to three minutes.** One tap per trial with no confirm step — picking one of two is not a composite action the way picking two of three is, and a confirm button would double the clicks without protecting anything; a Back control handles misclicks instead. All three views fit one screen without scrolling, because a comparison judged by scrolling is a memory test. The three WebGL canvases are never remounted between trials, only re-aimed. Power here comes from **participants**, not trials per person: at 40 participants this collects 240 judgements per stratum, ample for the pooled binomial but leaving per-participant accuracies coarse, so the sign test is the weakest of the three tests reported.
- **No attention check, matching P3** — and the ceiling recovered another way. P3 dropped its check because the earlier static study's discriminated nobody across 50 participants. The cost is that a bare accuracy has nothing to be read against: 65% means something different if attentive people score 95% than if they score 70%. Rather than spend trials on a throwaway screen, accuracy is reported **as a function of prediction margin** across the real agreement trials. A rising curve is the evidence that participants were judging; a flat line is the signature of clicking through. It is a diagnostic on the instrument, not a hypothesis test, and is labelled as such.
- **Three tests reported side by side, because confusing them is how a 2AFC study overstates itself.** The pooled exact binomial treats every judgement as independent — it is not, since one participant answers 12 — so its interval is too narrow and its p-value too small; it is reported because it is what a reader expects, and labelled every time it appears. The participant-level sign test gives each person one vote and is the defensible one. The adjudication between measures is an **exact McNemar** on discordant trials only, because comparing two separate accuracies would ignore that both were scored on the same answers, which is the whole reason the design can adjudicate at all. The exact form is used rather than chi-square since the discordant count can easily be small.
- **The gate, in two parts.** `test/matchedView.test.js` (43 tests) pins the statistics against hand-computable values — 8/8 gives exactly 2/256, an even split gives exactly 1 — plus the bank's own invariants and every rejection `validateTrialBank` must make. `npm run matched-view:selftest` then simulates cohorts through the real bank and the real block assembler: it recovers a planted θ for the true measure and **1−θ for the others** on the discriminating stratum (the mirror is the sharper half — it fails loudly if the scoring treats every measure as agreeing), reruns the whole thing with centroid as the truth to prove no winner is baked in, and checks that all three tests hold their size under a random-responding null (observed 5.0%, 5.5%, 5.0% at α = 0.05).
- **Selection bias in the discriminating stratum, stated.** Those trials were chosen because the measures disagreed there and, among those, the most decisive were taken. The stratum's accuracy is therefore an estimate on *decisive disagreements*, not on all disagreements — a deliberate trade of generality for power. The direction of the result is interpretable; its magnitude must not be read as any measure's accuracy in general.
- **Non-independence, named rather than worked around.** One participant answers 12 trials and one trial is answered by several participants, so neither judgements nor trials are independent. The pooled binomial ignores both; the sign test handles the first and not the second. A correct treatment would be a mixed-effects model with crossed random effects for participant and trial, which this sample size does not support. Recorded as a limitation, in the same spirit as P7's Mantel note.
- **Storage is a separate Sheet and a separate Web App** (`google-apps-script/MatchedView.gs`), never P3's. Different instrument, different row shape; sharing a tab would put the live perceptual study at risk to save one deployment. `MATCHED_VIEW_ENDPOINT_URL` is empty until deployed, and while empty the survey runs end to end and says plainly that nothing was stored rather than discarding answers silently. Locally, `/__save-matched-view` writes `src/data/matched-view-responses.json` with the same upsert-on-participant_id and stale-revision rules as P3.

---

## P9 — Design Diagnostic & Intervention

Konstablerwache, Frankfurt as the developed case. Route `#/diagnose`. Diagnosis operates on **zone types**, not a whole-plaza label: the researcher assigns an intended zone type to an area, and the weighted squared distance to that zone's centroid decomposes per metric to name the driving ones. Tier A is a parametric what-if over the 4 metrics (explicitly a sensitivity analysis, not a design simulation); Tier B edits geometry in a sandbox overlay and recomputes the affected grid region at 360°.

**Gate:** an edit changes the local zone map and composition profile; nothing persists to `sites.json`.

**Built 2026-09-10.** Route `#/diagnose`. Verify with `npm test` (277 tests, of which `test/zones.test.js`, `test/sandbox.test.js`, `test/presets.test.js`, `test/precedent.test.js` and `test/scenarios.test.js` are this phase's) and `npm run validate:presets` (9/9). Decisions taken, and the three places the build departs from the paragraph above:

- **Deviation: the whole plaza is recomputed, not "the affected grid region".** There is no affected region. Sight lines run to 200 m and Konstablerwache is 230 m across, so a mass dropped anywhere in it is visible from very nearly every sampled point, and any radius-of-effect rule would be an approximation that is silently wrong somewhere — wrong in the direction of understating an intervention's reach, which is the direction that flatters it. All 967 points are re-measured at 360°, which takes about 150 ms on the real site. The exact answer is also the fast one, so the approximation buys nothing and risks something. `recomputeField` is a pure function of geometry and points precisely so it cannot acquire state that would make a regional shortcut tempting later.

- **Deviation: height-aware ray casting, added as a flagged mode.** The engine's default treats every footprint as obstructing regardless of height. That is correct for buildings and wrong for the things a designer draws: unflagged, a 300 mm planter rim stops a sightline like a tower and a pergola roof four metres up blocks along its whole footprint, which would make half the intervention library meaningless. P9 casts with `heightAware: true`, which admits an obstacle only where it straddles the 1.6 m eye-height slice. **P1–P8 call the engine unflagged and are byte-identical:** when the flag is off not one of the comparisons it introduces is evaluated, so the old path is not merely equivalent to the previous behaviour, it *is* the previous behaviour. The flag is a module constant in `lib/sandbox.js`, not a per-call option — a before/after comparison run half in one mode and half in the other would attribute the difference between two measurement systems to the intervention, and the numbers would look entirely plausible. Making it impossible to set per call is the cheapest available guarantee. `buildEdgeIndex` records the mode it was built under and `castIsovist` refuses a mismatched index rather than quietly measuring a different set of obstacles.

- **Deviation: two P9-only diagnostic metrics, because compactness breaks.** Compactness (4πA/P²) collapses under sparse slender obstacles: a 250 mm post stops one ray while its neighbours run on a hundred metres, adding two long radial edges to the perimeter, and perimeter enters compactness squared. Measured here, a pergola takes 2.5% off isovist area and **53% off compactness** — an isoperimetric quotient doing what it does when a shape grows fine fringe, and useless for judging whether an intervention of posts or trunks did anything. Two metrics were added for this phase alone:
  - **`solidity`** — isovist area over the area of its convex hull. A hull ignores serration by construction, so this reports how much of the space's reach is occupied rather than how ragged its edge became. Reliable; it is what to read instead of compactness wherever thin elements are in play.
  - **`solid_share`** — the fraction of rays terminating on something built. **Directional only.** The baseline at Konstablerwache is already 0.981, leaving about two points of headroom at the 200 m sight line; it rose for every additive intervention and fell for none, so the sign is the finding and the magnitude is not, and it is never presented beside solidity as an equally reliable number.
  - **`solid_frontage_m`** is computed and excluded from every judgement. It reports how much built surface is *in view*, not how much was added, so a kiosk that hides sixty metres of distant facade and shows eight metres of itself lowers it (kiosk −9.6%, market row −15.9%) while adding real surface. Kept because it costs nothing; it adjudicates nothing.
  - Neither reaches a weight model and neither is written to any corpus data file. Zone assignment uses the four validated metrics alone, exactly as P6 does. `occlusivity_m` and `compactness` are untouched for P1–P8; no corpus value was recomputed for any earlier phase.

- **The unit of diagnosis is an area, and it is measured per point.** `diagnoseRegion` measures every sampled point inside the selection against the intended type's centre and averages those distances. Collapsing the selection to its mean point first and measuring that once is a different number and a flattering one: the mean of a transitional area sits between two types and can land close to either, reporting a tidy fit for a place with no consistent character. The same rule governs Tier A, whose curves report the *share of points* that reclassify rather than whether the mean point crosses a boundary — a shift that carries the mean across a boundary can leave most of the actual points behind it.

- **The typology is never refitted.** Points are assigned to P6's frozen centres as written to disk, not re-clustered with the edit in the pool, which would let an intervention redefine the categories it is being judged by. `test/zones.test.js` checks P9's nearest-centre assignment against P6's own k-means output on every real field point rather than on a fixture — P6 assigns from full-precision centres held in memory and P9 from the five-decimal centres on disk, so a point near a boundary could genuinely fall the other way, and only the real data can settle it.

- **Tier A is a sensitivity analysis and the page says so twice.** It sweeps each metric across ±1 normalised unit and reports the share of selected points that would classify as the intended type, plus four combined sliders. Curves are drawn dashed beyond the range the other seventeen plazas were actually measured in, so a dimension that only reaches its target in the dashed portion is visibly unreachable from any real position in the corpus. The framing block states what it cannot do: the four metrics come from one shared geometry, so no real design move changes one alone.

- **Tier B measures rather than assumes, and the sandbox is not the register.** Interventions are nine parametric presets plus freehand massing plus a subtractive recessed arcade; parameters are stored on the element and geometry is regenerated on every read, so a slider moves a real building rather than a cached approximation. Subtractive presets select their host only through `nearestFacade()` — an edge of at least 8 m on a building of at least 6 m — and a click that finds no qualifying facade places nothing and says why, rather than carving into the nearest scrap of geometry. A recess rewrites its host's eye-height outline as an explicit edge list rather than a ring, because the result has a gap in it; expressed as a ring it would need a polygon boolean, expressed as edges it is an interval subtraction along one segment.

- **Added 2026-09-10: a fourth tool, removing a building.** Every additive preset lowers isovist area, compactness and occlusivity together — measured across all nine, that is the single direction they travel — so whole regions of the corpus typology are unreachable by building alone: nothing you can place will raise area, and several zone types need it to. Demolition is the only move that opens that direction. `makeDemolition(buildingIndex)` stores an INDEX into the site's own building list, never a copy of the footprint — copying the geometry would create a second version of that building able to disagree with `sites.json` after a re-survey, and would put register data into a scenario file forbidden to hold it. **Ordering matters and is enforced:** `composeGeometry` collects demolitions first and applies them LAST, after every index-based edit (a recess addresses its host by index, and removing an earlier building from the array first would shift every later index and carve the recess into the wrong block, with nothing about the result that would look wrong). A cleared footprint is drawn as a hole in the zone map, not new plaza — P6's grid never sampled ground that was inside a building when it was surveyed, and synthesising points there would put the before and after comparisons over two different samples. `test/sandbox.test.js` pins the index-integrity case directly: a recess cut into building 40 produces byte-identical geometry whether or not building 3 has separately been demolished.

- **Added 2026-09-10: the per-metric before/after readout Tier B was missing.** The metric-gap figure above reads P6's stored field and correctly describes the plaza *as surveyed* — it never moves when something is drawn, because a diagnosis is of the thing being diagnosed. That also meant the page had no per-metric number that responded to an edit at all: the only sandbox readout was one aggregate distance and a driving-dimension name, gated behind an intended zone type. `MetricEffect` (`components/TierB.jsx`) reports all four fitted metrics plus solidity and solid share, before and with the intervention, over the *same surviving points* on both sides (a point the intervention has since built over is dropped from both columns, so demolishing the worst positions cannot be credited as improving them), with a baseline re-cast height-aware rather than read from the stored file. It needs no target zone — "did enclosure rise here" has an answer either way.

- **Added 2026-09-10: the zone map on the ground in the 3D model, and preset icons.** The model and the plan showed two different things about the same plaza — the plan carried the measurement, the model carried the design — so judging an intervention meant holding one view in memory while looking at the other. A checkbox, off by default, lays one instanced square per sampled point on the ground under the model, coloured by zone type exactly as the plan draws it; the same `zoneCellsFor()` derivation feeds both, computed once on the page so the two drawings cannot disagree about which points changed type. Colour is set through three.js's per-instance `setColorAt`, not a geometry colour attribute — an `InstancedMesh` shares one geometry across every instance, so a colour attribute would have painted all ~970 squares identically. Each of the nine presets and demolition also gained a glyph (`components/PresetIcon.jsx`) in both the library picker and the placed-element list, so a scenario reads as recognisable shapes rather than a column of near-identical text rows.

- **Added 2026-09-10: articulated rendering for walls, screens, colonnade roofs and freehand masses.** These drew as flat slabs in the same cream as the surveyed buildings, which for the one element whose entire purpose is to be a surface read as a blank card rather than as masonry. They are now piers, a recessed field set back from the measured face, a base course and a coping (walls, screens); an entablature of a set-back architrave under a full-depth cornice (colonnade roofs); a parapet band (freehand masses) — all of it inside the measured envelope except the coping, which oversails by 25 mm, the one place a model needs a shadow line. A new `stone` material, one value deeper than the board, separates an intervention from the buildings behind it without making it a different graphic language.

- **Two findings recorded because they read as bugs and are not.** *Enclosure is not additive across depth.* The engine casts one flat ray per horizontal direction and stops at the first thing it meets; the angle for that direction comes from whatever was hit, never from anything behind it, so a near object does not add to a far facade's enclosure, it *replaces* it — whichever angle is bigger wins. For a near object of height *h* at distance *d* screening a facade of height *H* at distance *D*, enclosure rises only where `d < D·h/H`; beyond that distance the same intervention lowers it. Measured near Konstablerwache's centre, a colonnade raised enclosure 22–36% within 12 m and lowered it slightly past about 20 m — "enclosure rose nearby" and "enclosure rose across the selection" can be opposite findings from one intervention, and the selection radius decides which a reader sees. *Thin, discrete elements cannot reach "Tight, strongly enclosed" at any height or spacing*, because that zone's centre needs both high enclosure and a smooth isovist, and a colonnade trades one for the other: closing the column spacing to its minimum near the plaza centre turned a 1,179 m perimeter into 4,357 m while area fell by two thirds, driving compactness from 0.13 to 0.003. Height moves enclosure alone; it cannot touch compactness, which is pure plan geometry. A solid wall of the same run reaches the enclosed type at lower enclosure than the tallest colonnade manages, because it does not fragment the outline.

- **A structural finding about why "Tight, irregular" dominates most interventions.** Sampling the space the corpus occupies rather than the corpus itself, "Tight, irregular" has the *smallest* basin of the five types (≈6%, against 36% for "Open, regular" and 28% for "Vast, regular") — its dominance in practice is not a large target, it is the only type whose required direction (lower area, lower compactness, lower occlusivity, higher enclosure) matches what every additive preset does to all four metrics at once. Two solid, unbroken sides of enclosure is the threshold that escapes it in a constructed test; one hole in the enclosure returns a point to it immediately. Every other zone type needs compactness to *rise*, which no visible object can do, so reaching them requires the fourth tool — measured directly on a search scenario, adding four building removals alongside two landmarks and two screen walls raised "Open, facade-rich" from 3% (walls alone) to 26% of the selection, where a walls-only version of the same idea could not hold it above 5% at any weighting tried.

- **Added 2026-09-10: four named design scenarios, and the one result that reverses a claim made above.** `src/data/scenarios.json` ships five worked scenarios rather than one. Four are stated design propositions — *Rooms in the Square* (four 12 m pavilions staggered across the centre), *Market Hall* (one 60 × 18 m hall on the market axis with two kiosks), *Colonnaded Edge* (three recessed arcades plus one added colonnade), *Shaded Grove* (two tree rows, a 30 × 12 m canopy on 600 mm piers, a raised step platform) — each saved with the selection and target type it was drawn against so its diagnosis is reproducible rather than remembered. Two things they establish that the earlier single scenario could not:
  - **The recessed arcade strengthens a zone; everything else in the library dilutes one.** Measured alone, the three recesses take "Open, facade-rich" from 68.0% of the plaza to **93.3%**, raising occlusivity 15.0%, isovist area 1.1% and solidity 1.2% together. That is the only intervention of the ten that improves three metrics at once and the only one that makes a zone type *more* itself. The bullet above says every additive preset lowers area, compactness and occlusivity together and that only demolition can reverse it; the recess is the exception, and it works because its piers stand on the original building line, so the new surface extends the occlusivity run instead of fragmenting it. Combined with a 40 m freestanding colonnade on the east rim the finding inverts — zone 0 falls to 29.4% and compactness to −57.6% — because nothing three recesses add can offset serration on that scale. **An edge strategy is not one move.** The change also propagates further than "perimeter work" suggests: occlusivity rises 15.5% at the rim and 14.4% in the centre, essentially uniformly, while reclassification does not — 40% of rim points change type against 10% in the centre, because centre points were already deep inside zone 0 and a strengthened zone 0 is still zone 0.
  - **One large mass and several small ones fail differently, and compactness is where.** Both convert almost all of the open centre; the hall puts more of it into "Tight, strongly enclosed" (235 points against 118) and ends marginally more evenly spread. But one convex rectangular obstacle costs 2.1% of compactness where four separated ones cost 21.9%, and the hall reaches its result partly by **deleting** ground rather than changing it — 218 sampled positions built over against 121, which is the sampling caveat at the end of this section doing real work rather than being recited. Enclosure rises 80.4% within 20 m of the hall and 50.4% within 20 m of a pavilion, against 23.0% and 4.9% beyond: the compartment effect is real and it is local, and the selection radius decides which of those two numbers a reader is shown.
  - **Two of the four briefs asked for something the site does not contain, and the scenarios record that rather than working around it.** Both were written to convert Konstablerwache's "Vast, regular" ground; that type holds **0 of 967** sampled points at baseline, so no share of it can convert. The undifferentiated central plane the briefs describe is real and is classified "Open, facade-rich" at 68.0%. Each scenario's note states the substitution. *Shaded Grove* records the matching negative: its raised steps register **exactly** nothing — zero change on all six metrics, zero points dropped — because at 0.9 m they sit below the 1.6 m measured slice, and its canopies at 2.5 m clearance leave only 400 mm trunks in it, so the scenario measures a grove's trunks and has no way at all to register its shade. Its compactness reading of −84.5% is the spurious thin-element collapse solidity was added to replace, and the note says so beside the −17.5% solidity figure that is the honest one.

- **Nothing persists to `sites.json` — the gate, in three places.** `recomputeField` is pure and composes the sandbox with the site's geometry at read time, throwing the combination away. Current work is autosaved to browser storage only (`lib/sandboxStore.js`). Named scenarios go to `src/data/scenarios.json` through a dev-only endpoint and store **what was drawn** — elements, the selected area, the intended type — and nothing measured. Saving results alongside would be the obvious convenience and the wrong one: a stored zone map keeps asserting itself after the typology, the weights or the geometry have moved under it, and looks exactly as authoritative as a live one. Recomputing costs 150 ms and cannot go stale. `validateScenarioFile` refuses any record carrying a `sites`, `buildings`, `boundary`, `points`, `zones` or `geometry` field before it reaches disk, and the endpoint resolves its path from `SCENARIO_FILE` so there is one string in the codebase naming where a scenario may be written. Every scenario carries a provenance stamp (typology date, k, weights, grid spacing); one saved before a re-clustering says so on the button that opens it rather than being silently rescored — the same rule P8 applies to its trial bank.

- **The P7/P8 bridge: closest precedent view.** A click places a standing point (facing the plaza centroid, P2's convention for an unaimed view) and a second click re-aims it; the panel casts one real 120° isovist through the sandbox geometry and ranks it against P7's 144 corpus views, top five, with the nearest rendered through `ViewRender`. Konstablerwache's own eight views are excluded by default — a view in this square resembling this square is not a precedent — with a toggle, because once Tier B has changed the plaza, "this corner no longer looks like the square it is in" is a real finding and that is the only way to see it.
  - **This is the only `perceptual_120` surface in P9.** It is normalised against the frozen 120° bounds from the eighteen canonical readings, never the 360° field bounds, and never blended into the zone diagnosis. The two layers name the same four metrics and both run 0–1, so a mix-up produces numbers that look entirely right; `test/precedent.test.js` asserts mechanically that the 120° bounds do not coincide with the field bounds.
  - **The mode asymmetry, checked rather than assumed.** The probe is cast height-aware; the 144 corpus views were cast unflagged by P7 and must never be recomputed. Those agree **exactly** across the whole corpus, and the reason is specific rather than general: height-aware mode drops a footprint only where it fails to straddle 1.6 m, and there is exactly one such footprint in the eighteen sites — a 1.2 m structure at Gendarmenmarkt, 840 m from the nearest Gendarmenmarkt vantage and therefore beyond the 200 m sight line of every view in the study. Both halves are asserted, so adding a low structure near a plaza fails loudly instead of quietly turning part of every ranking into a measurement artefact.
  - **A ranking is a lookup, not a validation**, and the panel is headed "closest precedent view" rather than "closest *validated* precedent view" for that reason. What P8 tested is the narrower claim that when this space calls two views similar, people tend to agree. Those numbers are read **live** from the responses on every page load — `precedentEvidence()` — never written into the text: at 15 of an intended ~40 participants a hard-coded "63%" would keep asserting itself after the sample had doubled, which would be the interface making a false claim about its own data in the most credible-looking form available. Both strata are reported separately and never pooled, and the agreement stratum is labelled not significant on the participant-level sign test, which is the defensible one.

- **Figures export, plans included.** `Figure` gained an optional `target` selector so a drawing sharing its panel with a toolbar can be exported: a react-icons icon is an `<svg>` too, and the default "first svg in the holder" rule would serialise a 16-pixel chevron and look like a broken download button. `PlazaPlan` marks its own drawing `data-plan`. The zone map, the Tier B before/after map and the precedent isovist are now exportable at the corpus scale, which is what a thesis figure needs. The 3D model is a `<canvas>` and cannot be serialised to SVG; the export buttons stay live while it is showing and produce the plan, because the plan is the drawing that carries the measurement.

- **A methods disclosure at the foot of the page**, collapsed like P6's, P7's and P8's, carrying every deviation above, the two metric caveats, what each tier cannot tell you, the two counter-intuitive findings and the zone-dominance finding, and the live P8 numbers. A caveat recorded in a commit message is not disclosed.

- **What this phase does not establish.** One case, developed: nothing here is specific to Konstablerwache, and nothing here has been checked against a second site either. Tier B reports that a region moved closer to or further from an intended type in a space fitted from judgements about whole photographs — a claim about measured similarity, not about how the place would feel to stand in. And a mass drawn over standable ground removes those positions from the sample rather than measuring from inside a building, so an apparent improvement can partly be the disappearance of the worst positions rather than the improvement of them; where that happens the page says how many.

---

## Layer separation — a correctness requirement

The platform computes metrics under two field-of-view conventions producing non-interchangeable values.

| Layer | FOV | Purpose |
|---|---|---|
| **Perceptual** | 120°, directional | What a person sees standing at a point facing a direction — survey stimuli, weight fitting, view clouds, intervention |
| **Field** | 360°, omnidirectional | Intrinsic spatial property of a location — grid field mapping, zone typology, gradient maps |

Each layer holds its own normalisation bounds, stored separately; the two never appear in the same distance calculation; every metric record carries an explicit `fov_mode`; and the UI always labels which layer is on screen.

**One deliberate exception, added 2026-09-04.** The P6 field grid is normalised against P5's `perceptual_360` bounds rather than its own pooled range. Both are 360° measurements of the same quantities — the field layer differs from the perceptual layer in *where* points sit, not in how they are measured — and expressing them in shared coordinates is what makes P5's fitted weights meaningful when applied in P6. Re-normalising would leave the weights numerically unchanged while quietly changing what they weigh. Field records carry `normalisation_source: "perceptual_360"` so the exception is explicit in the data, and points falling outside 0–1 are kept rather than clipped. The rule still stands absolutely between 120° and 360°: those are different measurement systems and must never share bounds.

The perceptual weights fitted in P5 are also used for the P6 zone clustering. This is a documented **transfer assumption** — relative metric importance is assumed to hold across viewing conditions. An unweighted clustering is computed as a robustness check and reported inside the P6 methods disclosure only, never as a headline result.

---

## Removed from scope: plaza-level typology clustering

Earlier drafts of this spec ended with re-clustering the 18 sites into k=4 plaza types. That is **cut**, deliberately:

1. The workflow itself demonstrates that a single plaza produces materially different metric readings depending on viewpoint and direction — assigning one typological label to a whole plaza is not defensible on the project's own evidence.
2. No hypothesis depends on it: H1/H2/H3 are all tested via leave-one-out triplet prediction against the weighted distance model.
3. Cross-plaza comparison survives in stronger form as the P6 zone composition profiles, which describe what a plaza is *made of* rather than which box it falls in.

---

## Canonical perceptual fingerprints — capture protocol

Each of the 18 active sites has exactly one canonical 120° reading, stored in `src/data/results.json` and used as that site's perceptual fingerprint throughout P5 onward.

**Protocol as actually executed:** for each site, the vantage point and heading were placed in the 3D viewer to reproduce the Google Street View camera position and bearing of the photograph shown for that site in the P3 survey. This is *not* the site's `default_viewpoint`, and *not* a heading aimed at the plaza centroid — vantages sit 0–363 m from `default_viewpoint` and headings deviate from the centroid bearing by 6–144°, because a Street View camera stands at a street edge looking across the space. Matching the stimulus is the point: the metrics must describe the same view the participant judged.

**Precision note:** headings are stored to 2 decimal places (readings captured before 2026-08-17 carry 1 dp). This matters because at sites with street openings a sub-degree rotation can flip a single ray between a near facade and a 200 m escape — measured at Herderplatz as ~4% of isovist area and ~27% of occlusivity across a 1.2° sweep. The stored metric values are correct as captured; the precision affects only recomputation from the record. See `test/isovist.test.js`.
