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

---

## P8 — Matched-View Validation Survey

Two-alternative forced choice testing whether the view pairs Chamfer matches are the ones people agree with. Participant route `?matched-view-survey` (chrome-free, like P3); researcher review lives in the Analysis group. Binomial test against 50%; the same responses are re-scored against centroid- and Gaussian-derived predictions so the three measures can be adjudicated.

**Gate:** instrument runs end to end; analysis correct on synthetic data.

---

## P9 — Design Diagnostic & Intervention

Konstablerwache, Frankfurt as the developed case. Route `#/diagnose`. Diagnosis operates on **zone types**, not a whole-plaza label: the researcher assigns an intended zone type to an area, and the weighted squared distance to that zone's centroid decomposes per metric to name the driving ones. Tier A is a parametric what-if over the 4 metrics (explicitly a sensitivity analysis, not a design simulation); Tier B edits geometry in a sandbox overlay and recomputes the affected grid region at 360°.

**Gate:** an edit changes the local zone map and composition profile; nothing persists to `sites.json`.

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
