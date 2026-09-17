# 04 — Decision log

Methodological decisions an examiner could reasonably challenge with "why this, and not the obvious alternative?" Companion to [01_methods_implementation.md](01_methods_implementation.md) (what the code does), [02_results_data.md](02_results_data.md) (the numbers) and [03_survey_protocol.md](03_survey_protocol.md) (the instruments).

**What is not here.** Refactors, UI work, performance changes (including the spatial index, which is asserted bit-identical in `test/isovist.test.js`), renames, storage plumbing, and abandoned paths that never reached a reported number.

**Evidence tags**

| Tag | Meaning |
|---|---|
| **EVIDENCED** | The reason is written down in a commit message, code comment or repo document. It is quoted, with its source. |
| **INFERRED** | The reason is deduced from the change itself. It is unconfirmed, and the basis of the inference is stated. |
| **UNKNOWN** | The change is visible but no reason is recorded. No rationale is offered. |

A tag grades the evidence that a reason was *given*. It does not say the reason is *sound*. Where a stated reason has a weakness a reader should know about, it is flagged under **Caveat**.

**Dating.** Several spec passages carry an in-text date earlier than the commit that introduced them. Example: "Corrected 2026-08-27" first appears in `577c944` (2026-09-04). Both dates are given where they differ, and only the commit date is verifiable. Paths are repo-relative, with line numbers as of `ca0c876`.

---

## Summary

| # | Decision | Reason tag | Affects |
|---|---|---|---|
| D1 | Occlusivity = closed perimeter in metres, counting only edges along continuous facade | EVIDENCED | All occlusivity values; H3 |
| D2 | Enclosure = mean of atan(h/d)/(π/2) over **all** rays, open rays = 0 | EVIDENCED (with caveat) | All enclosure values; weights; H2 |
| D3 | Survey stimulus changed from static images to interactive 360° panoramas | **UNKNOWN** | Which dataset is fitted; layer pairing |
| D4 | P5 fits panoramic responses against `perceptual_360` readings at hand-placed panorama points | EVIDENCED | Weights, bounds, everything downstream |
| D5 | Min–max normalisation, bounds frozen per layer; P6 borrows the `perceptual_360` bounds | Mixed: min–max UNKNOWN; freezing and the P6 exception EVIDENCED | All weighted distances |
| D6 | Weight fit on triplets only; rating blend dropped | EVIDENCED (evidence not reproducible) | Reported weights |
| D7 | Fit specification: squared weighted distance, no temperature, no regularisation, per-instrument exclusions | Mixed | Reported weights and accuracy |
| D8 | Hypotheses replaced after results were available | EVIDENCED | How H1–H5/H6 must be presented |
| D9 | P6–P9 consume one frozen P5 point-estimate weight vector | EVIDENCED; point estimate vs uncertainty UNKNOWN | Zones, clouds, P8 bank, P9 |
| D10 | P7 computes centroid, Gaussian and Chamfer; Chamfer is the measure P8 tests | EVIDENCED | P7 matrices, P8 design |
| D11 | Plaza-level typology cut; within-plaza zones at k = 5 | EVIDENCED (with open inconsistency) | P6 zone map, P9 diagnosis |
| D12 | Height-aware ray casting confined to P9 | EVIDENCED | P9 only; P1–P8 unchanged |

---

## D1 — Occlusivity definition

**What changed, in four stages.**

1. **Spec, before implementation** (`9ae7233`, 2026-07-15). Occlusivity was written as Benedikt's ratio `1 − (ClosedPerimeter / Perimeter)`, with an open question. The spec noted the Grasshopper dataset "has Occlusivity values in the hundreds (e.g. 354.10, 598.13), which cannot be Benedikt's 0–1 ratio — likely an absolute closed-edge length in meters" (`9ae7233:docs/spec.md:101-103`).
2. **First implementation** (`006db1a`, 2026-07-12; the spec caught up in `4a4b10d`, 2026-07-15). Closed perimeter in metres: "the sum of edges whose both endpoints are wall hits" (`006db1a:src/lib/isovist.js:97-101, 118`). Reason, **EVIDENCED**: "Do **not** implement `1 − Uv/Perimeter` (Benedikt's normalized ratio) — confirmed via reverse calculation that this does not match the existing 18-site dataset" (`4a4b10d:docs/spec.md:108`). The reverse calculation itself is not in the repo.
3. **Correction** (spec in-text date 2026-08-27; committed `1dc4858` and `577c944`, 2026-09-04). An edge now counts only if both ends are wall hits **and** they lie on the same building **or** the edge between the two hit points is ≤ 1.5 m (`src/lib/isovist.js:16, 377-410`). Reason, **EVIDENCED**: "Occlusivity previously counted phantom facade across street gaps (inflating it ~50%)" (`1dc4858`). In more detail: "Where one ray stops on the building in front and the next slips past its corner into a side street to land on a different building 90 m away, the edge between those two hits crosses open street … Counting those inflated this metric by ~50% against Grasshopper on a matched point at Zeil (559 m vs 376 m; the same-building rule gives 355 m)". The comment also records instability: "the old rule swung 199→273 m across ray counts at one fixed point, and ~27% across a 1.2° rotation" (`isovist.js:381-395`). The 1.5 m tolerance: "narrower than any real gap a person could see through or walk down, and wider than the offset between two abutting footprints traced separately in OSM" (`isovist.js:11-15`).
4. **Definition check against Grasshopper** (spec in-text date 2026-08-29; committed `577c944`). At one Zeil point, closed perimeter reproduces the reference 376.35 m, and Benedikt's raw occluding-radials length is ~2× too high (`docs/spec.md:110-118`).

**What the live version computes.** Sum of isovist-polygon edge lengths where both vertices are wall hits and the hits are continuous (same building, or ≤ 1.5 m apart). Raw metres, not normalised by perimeter. **Live:** yes. Every stored reading was re-derived in place (`npm run recompute:readings`, `docs/spec.md:122`). Area, perimeter and compactness drift was 0.000%.

**Affects.** Every occlusivity value, the bounds, the weights, P6 zones, P7/P8 and H3. The effect is visible in history: Gendarmenmarkt's `perceptual_360` occlusivity is 1128.93 m at `abc37b8:src/data/results.json` and 602.92 m now.

**Caveats (EVIDENCED as limitations in the source).**
- "This is agreement at a single point on a single site, not verification. … Two or three further Grasshopper runs … are needed before the engine can be described as validated rather than consistent" (`docs/spec.md:118`; softened in `577c944`).
- The Gendarmenmarkt reference "must NOT be used to test metric definitions" (`docs/spec.md:120`).
- The 1.5 m test is on **edge length**, not on the distance between buildings. Any two wall hits closer than 1.5 m count as continuous.

---

## D2 — Enclosure definition

**What changed.**

| Stage | Definition | Source |
|---|---|---|
| Original spec (`9ae7233`) | **Separate** 8-ray horizontal cast; mean h/d; "specify whether over all 8 rays or only hitting rays" left open | `9ae7233:docs/spec.md:105-111` |
| First implementation (`006db1a`) / spec `4a4b10d` | Shared with the 120-ray isovist pass; mean h/d over **wall-hit rays only** | `006db1a:src/lib/isovist.js:124-127` |
| Current (in-text 2026-08-27; committed `1dc4858`/`577c944`, 2026-09-04) | mean of atan(hᵢ/dᵢ)/(π/2) over **every** ray, no-hit ray = 0 | `docs/spec.md:123` |

**Reason for sharing the isovist pass: EVIDENCED, but thin.** `4a4b10d` lists it among "resolved decisions: single shared 120-ray pass for both isovist and enclosure ratio … enclosure ratio validated at the 120 deg cone". No comparison with the 8-ray method is recorded.

**Reason for the current form: EVIDENCED** (`docs/spec.md:125-129`):
1. "**Openings were invisible.** Rays meeting no building were *excluded from the average* rather than counted as 0 … Openness is not missing data about enclosure; it is the absence of enclosure."
2. "**`h/d` is unbounded, but a view is not.** You cannot look up past 90° … an unbounded term also let a single tall building near the vantage point dominate it."
3. "Chosen on those grounds plus a better match to the P3 ratings (partial *r* controlling for isovist area: 0.51 → 0.63), **before** refitting — deliberately not chosen by which formulation maximises enclosure's fitted weight, since H3 is a claim *about* that weight. For the record, the change raises it ~58–61%, and leaves held-out accuracy unmoved (±0.5 pp)."

**Live:** yes (readings recomputed in place). Gendarmenmarkt `perceptual_360` enclosure is 0.2868 at `abc37b8` and 0.1587 now.

**Affects.** Enclosure values and bounds, the fitted weights (+58–61% for enclosure by the spec's own figure), zones, and H2 (enclosure's rating convergence r = 0.83, `02_results_data.md` §3.8).

**Caveat.** Ground 3 uses the P3 semantic-differential ratings to prefer one definition. The same ratings then serve as the "independent validation" of H2 for that same metric (`docs/spec.md:208`; `scripts/validate-ratings.mjs`). Enclosure's H2 result is therefore not fully independent of the choice of definition. The "H3" named in ground 3 is the old H3 ("Enclosure carries the largest perceptual weight"), which was replaced the same day (D8). The partial-r figures (0.51, 0.63) are **not stored** and were not re-run for this log.

---

## D3 — Static images → interactive 360° panoramas

**What changed.**
- `0218a43` (2026-08-19) added a 360° pilot "purely additive" at `?pilot-360`.
- `abc37b8` (2026-08-22) says: "Replace the static-photo triplet survey with the panoramic one: one instrument at ?survey, 12 triplets then a semantic-differential rating block". The 56-record static dataset was archived and left unread by the app.

**Reason for the switch: UNKNOWN.** Neither commit message, the spec, the code comments nor the README states why panoramas replaced photographs, or why the static data is not the fitted dataset. What *is* recorded:

- The pilot's own purpose, **EVIDENCED**, was feasibility rather than comparison: "This pilot exists to answer two practical questions before any powered run: how long does a panoramic comparison actually take, and where do people give up" (`0218a43:src/pages/Pilot360Review.jsx:8-14`). The pilot collected 2 sessions (1 completed) before the switch (`02_results_data.md` §4.2). So the feasibility questions it was built to answer were not answered from its data before the switch.
- The two instruments are declared non-comparable, **EVIDENCED**: "the two instruments are not comparable and mixing them would spoil the archive" (`src/lib/surveyEndpoint.js:11-12`).

**Related sub-decisions with recorded reasons** (EVIDENCED):
- **12 triplets instead of 26.** "Panning a panorama takes noticeably longer than glancing at a photo, so this is well short of the main survey's 26" (`0218a43:src/lib/pilot360.js`, comment on `PILOT_SURVEY_LENGTH`). The live value is 12 (`src/lib/survey360.js:24`); the step from 15 to 12 has no stated reason (**UNKNOWN**).
- **No attention check.** "the earlier static survey's check discriminated nobody across 50 participants" (`src/pages/SurveyPage.jsx:32-34`).
- **Ratings after triplets.** "Showing explicit scales first would tell people which dimensions to attend to, and the triplet judgements would stop being spontaneous" (`src/lib/survey360.js:17-19`).

**Affects.** Which responses the weights are fitted on (46 panoramic, not 54 retained static). The geometry layer has to change with it (D4). The static dataset has no reported fit (`02_results_data.md` §3.6, §4.3).

---

## D4 — Pairing panoramic responses with `perceptual_360` readings

**What changed.** P5 was first built against the static survey × `perceptual_120` fingerprints (`0218a43`; `src/lib/analysis/fingerprints.js:1-14` still describes that). The reported fit is now `--source=panoramic`: `survey-responses-360.json` × `perceptual_360` (`scripts/analyze.mjs:84-97`). The 360° readings were first auto-derived at the 120° vantage points (`0218a43`: "a perceptual_360 layer computed at the same 18 vantage points"). They were later re-placed by hand.

**Reason: EVIDENCED.**
- Pairing (spec in-text "added 2026-08-29", committed `577c944`): "The stimulus a participant judged and the geometry the fit reads must be the same measurement of the same thing. Panoramic responses are judgements of the full surround and pair with `perceptual_360`" (`docs/spec.md:199`).
- Re-placement: "the survey's panoramas are shot from points central to each plaza, not from the Street View camera position at the plaza edge, so each reading has to sit where its panorama was taken" (`scripts/compute-360.mjs:13-18`).

**Affects.** Every fingerprint, the bounds and the weights, and so everything downstream. The re-placed vantages are 0–69 m from the 120° ones (`03_survey_protocol.md` §1.3).

**Caveat.** How each panorama's position was located in the model is not recorded (`03_survey_protocol.md` §1.2). The "same measurement" premise also has documented gaps: the 75° viewing window, the pitch limit, and obstacles that are not buildings (`03_survey_protocol.md` §1.2).

---

## D5 — Normalisation and layer separation

**D5a — Min–max normalisation across the 18 sites. Reason: UNKNOWN.** Implemented in `src/lib/analysis/fingerprints.js` (`computeBounds`). No comment, commit or spec passage gives a reason for min–max over z-scores, ranks or raw units. The spec states that under rank normalisation "compactness and enclosure swap" in weight order (`docs/spec.md:233`). No committed code or data produces a rank-normalised fit (`02_results_data.md` §3.6), so that statement cannot be checked from the repo.

**D5b — Bounds frozen and reused by later phases. EVIDENCED.** "The bounds are FROZEN into analysis.json and reused by every later phase, so a P7 view cloud or a P9 intervention is measured on the same axes as the weights were fitted on. Each bound records the site that sets it" (`fingerprints.js:7-11`).

**D5c — Separate bounds per `fov_mode`; 120° and 360° never share a distance. EVIDENCED** (`docs/spec.md:406-415`). The two layers "produc[e] non-interchangeable values". P7, P8 and the P9 precedent panel use `perceptual_120` bounds (`docs/spec.md:300`; `src/lib/analysis/clouds.js:33-35`; `docs/spec.md:388`, asserted in `test/precedent.test.js`).

**D5d — Exception: P6 field points are normalised on the `perceptual_360` bounds, not their own pooled range. EVIDENCED** (`58cbd46`; `docs/spec.md:268-272, 417`). "The weights … were fitted against P5's normalisation; grid points include positions tight against walls with very small isovists, so a pooled field range is much wider, and reusing the weights on a rescaled axis would silently change what each weight means." Points outside 0–1 are kept unclipped, because "clipping would collapse genuinely distinct positions onto the boundary value". Out-of-range shares on the current 11,719-point grid: area 6.5%, compactness 13.9%, occlusivity 11.1%, enclosure 11.4% (`src/data/fields/index.json` → `out_of_range`; the spec's earlier 6.6 / 13.7 / 11.2 / 11.5% were from the pre-`dac2380` grid and were corrected 2026-09-13). Recorded in the data as `normalisation_source: "perceptual_360"`.

**Affects.** Every weighted distance in P5–P9. Under D5d, P6 zones partly **extrapolate** beyond the surveyed range.

---

## D6 — Weight fit on triplets only; the rating blend dropped

**What changed** (`70055ed`, 2026-09-04). An earlier fit placed each plaza "midway between what the engine measured and what participants reported" (a 50/50 blend of geometry and mean ratings). It was replaced by geometry-only coordinates. The ratings were moved to a separate validation (`scripts/validate-ratings.mjs`).

**Reason: EVIDENCED** (`70055ed`; `docs/spec.md:203-208`):
1. "**The mixture fraction was unjustifiable.** 50/50 is a stated preference, not a quantity the study can derive."
2. "**It was circular.** Locating plazas by participants' ratings and then predicting those same participants' choices uses one sample twice. A leave-one-participant-out test … showed the apparent gain vanishing entirely (47.5% against 49.7% for pure geometry, sign-test p = 0.84)."

**Affects.** The reported weights and accuracy (`src/data/analysis-panoramic.json`). It is also what allows the ratings to serve as a validation.

**Caveat — the evidence is not in the repository.** `git log -S"blend"` finds no commit containing the blended fit. The phrase first appears in `70055ed`, the commit that removes it. The leave-one-participant-out script cited for reason 2 (`scripts/perceived-holdout.mjs`) was **never committed** (`01_methods_implementation.md` §1.4). The 47.5% / 49.7% / p = 0.84 figures therefore cannot be reproduced from history.

---

## D7 — Fit specification

| Choice | Tag | Evidence / note |
|---|---|---|
| Softmax over the three pairs of **squared** weighted Euclidean distance: `P ∝ exp(−Σ wₖ Δₖ)` | Specified, reason not argued | `docs/spec.md:218-222`; `src/lib/analysis/model.js:83-112`. The spec fixes the form; no alternative (L1, unsquared, other link) is discussed. Reason for this form over others: **UNKNOWN**. |
| **No temperature parameter**; weights normalised to sum 1 only **after** fitting | EVIDENCED | "never as a constraint during it, since overall weight scale is the model's only sharpness parameter (softmax temperature is not separately identifiable and is deliberately not a model parameter)" (`docs/spec.md:223`) |
| **No regularisation** | **UNKNOWN** | The objective is the unpenalised NLL (`01_methods_implementation.md` §5.4). No statement explains the absence. |
| Cross-validation folds never warm-started; observed and permutation statistics use the identical `FOLD_FIT` | EVIDENCED | Warm starting "leaks the answer into the prediction"; unequal fitting "would bias the null downward and make every p-value look better than it is" (`docs/spec.md:250-253`) |
| Accuracy macro-averaged over 18 plaza folds | EVIDENCED | A triplet names three sites, so a pooled count "would weight each triplet three times" (`docs/spec.md:257`) |
| **Attention-check exclusion applies only if the instrument administered one** | EVIDENCED | "Without that test the 'never reached the check' rule dropped *every* panoramic participant, silently" (`docs/spec.md:231`; `1dc4858`; `src/lib/analysis/exclusions.js:50-68`). Result: 46 of 46 participants retained. |

---

## D8 — Hypotheses replaced with results in hand

**What changed** (in-text "reformulated 2026-09-04", committed `577c944`/`70055ed`). The original H1–H3 are still written into `analysis-panoramic.json`:
- H1: "The weighted four-metric model predicts perceived similarity better than chance."
- H2: "A four-metric framework predicts perceptual similarity more accurately than isovist area alone."
- H3: "Enclosure carries the largest perceptual weight of the four metrics."

They were replaced by a construct-validation set (`docs/spec.md:235-246`; `src/lib/analysis/hypotheses.js`).

**Reason: EVIDENCED** (`docs/spec.md:233`):
- Old H2 "is a model-selection question the design is far too underpowered to resolve — the interval on the difference spans ±3 pp".
- Old H3 "is **not scale-invariant** … A hypothesis whose answer changes with a preprocessing choice is not a hypothesis about the world".

**Disclosure obligation, stated in the source.** "These were formulated with results in hand … That is legitimate and must be **stated plainly in the methods**; the exploratory analyses behind H3 in particular are to be labelled as such" (`docs/spec.md:248`).

**The last hypothesis was also re-framed as a limitation. EVIDENCED.** The spec's H6 reads "The fingerprint predicts similarity better than its single strongest dimension" (`docs/spec.md:244`). The code's H5 states the reverse: "In this corpus the four dimensions covary too closely for the ensemble to out-predict its strongest single dimension." It is marked SUPPORTED when the paired sign test is *not* significant (`hypotheses.js:203-215`). Code comment: "The old framing ('the fingerprint beats area alone') made a property of eighteen particular squares read as a verdict on the framework." **Caveat:** that verdict treats a non-significant difference as support for a claim of no difference. See also the numbering mismatch in §U3.

---

## D9 — Which weight vector P6–P9 consume

**What.** One vector: `fit.weights_normalised` from `src/data/analysis-panoramic.json` (generated 2026-09-02) = [0.3122, 0.2749, 0.2065, 0.2064] for area, compactness, occlusivity and enclosure. Verified identical in:

| Phase | Where | Reason tag |
|---|---|---|
| P6 zones | `src/data/zones.json` → `weighted_by` | EVIDENCED: normalised on P5 bounds "so the P5 weights keep their fitted meaning when reused here" (`58cbd46`) |
| P7 clouds | read live, `CloudComparisonPage.jsx:72` | EVIDENCED as an **assumption**: "Distances use the P5 weights, which were fitted on the panoramic 360° survey. Applying them to 120° readings assumes relative metric importance carries across viewing conditions" (`docs/spec.md:301`, `12f9508`) |
| P8 bank | frozen in `matched-view-trials.json` → `source.weights` | EVIDENCED: frozen "so a prediction must be the one that was current when it was answered" (`docs/spec.md:324`) |
| P9 | via P6's frozen zone centres | EVIDENCED: "The typology is never refitted … which would let an intervention redefine the categories it is being judged by" (`docs/spec.md:358`) |

**Deliberate, not a default.** The reuse is argued in each phase. The **transfer across layers** is labelled an assumption (`docs/spec.md:419`). Robustness checks are recorded: equal-weight clustering keeps 96.05% of points in a corresponding zone on the current grid (`zones.json` → `unweighted_agreement`; 95.9% before `dac2380`), and P7 reports an equal-weight rank correlation (`docs/spec.md:301`).

**Not argued: UNKNOWN.** Why the point estimate is used, with no propagation of the bootstrap intervals, which overlap heavily (`docs/spec.md:233`).

---

## D10 — P7 set distances; Chamfer as the view-level measure

**What.** P7 computes **three** set-to-set distances (centroid, Gaussian 2-Wasserstein, Chamfer) and does not pick one for its matrices. Chamfer is the measure P8 puts to participants. No clustering or MDS is applied.

**Reason: EVIDENCED.**
- Why three: "the answer is not obvious — which is the point. Three measures are computed, they disagree, and where they disagree is the finding" (`src/lib/analysis/clouds.js:12-16`).
- The case for Chamfer is a **constructed** one. Two clouds with identical mean and covariance, "so centroid and Gaussian both report exactly zero by mathematical necessity while Chamfer still separates them. The second is the real argument for Chamfer" (`docs/spec.md:303`; `test/clouds.test.js`).
- No clustering or MDS: "Chamfer can violate the triangle inequality, so it is not a metric, and both k-means and classical MDS assume one" (`docs/spec.md:310`).
- Eight views per plaza, equal everywhere: Chamfer "averages over each cloud, so a more densely sampled plaza would give its neighbours more chances to find a close match without being charged for it". Eight is also "the least that leaves a 4x4 covariance with more observations than dimensions" (`docs/spec.md:299`).
- Gaussian in Bures form: the sample covariance "is near-singular by construction, and the inverse form produces large numbers out of rounding error" (`docs/spec.md:302`).

**Affects.** P7 distance matrices, the P8 trial design and its adjudication (`docs/spec.md:322`).

**Caveat.** The argument for Chamfer is analytic, from a constructed case. The empirical test is P8, currently n = 15. Chamfer's advantage over centroid/Gaussian in the discriminating stratum has McNemar p = 0.045 and participant-level sign-test p = 0.30 (`02_results_data.md` §7.2). Placing views is a manual judgement ("are these positions spread across the plaza the way a person moving through it would stand", `docs/spec.md:298`). No sampling rule is recorded beyond the 1 m clearance.

---

## D11 — No plaza-level typology; within-plaza zones at k = 5

**Why this entry.** An earlier spec ended with clustering the 18 plazas into k = 4 types, and a reader of P6 would look for those types.

**What.** Plaza-level clustering was cut (`0218a43`, 2026-08-19). P6 clusters the ~11,700 pooled grid points into zone types, with k = 5.

**Reason for cutting plaza types: EVIDENCED** (`docs/spec.md:423-429`):
1. "a single plaza produces materially different metric readings depending on viewpoint and direction — assigning one typological label to a whole plaza is not defensible on the project's own evidence";
2. "No hypothesis depends on it";
3. "Cross-plaza comparison survives in stronger form as the P6 zone composition profiles".

**Reason for k = 5: EVIDENCED** (`58cbd46`; `docs/spec.md:283`). "silhouette peaks at k=3, but there 13 of 18 plazas come out as a single zone, which is plaza-level typology (out of scope) and would leave P9's zone-level diagnostic with nothing to operate on." The rule: the smallest k within 0.04 of the silhouette peak, with ≥ 2 zones per plaza and ≤ 5 single-zone plazas (`src/data/zones.json` → `k_selection.criterion`).

**Caveat — the stored rule no longer selects k = 5. EVIDENCED.**
- `dac2380` (2026-09-06) tightened the Theaterplatz boundary (209 → 348 points). After that, "automatic k-selection can no longer find any k satisfying its own rules and falls back to the degenerate raw silhouette peak … Re-fit pinned to k=5 (npm run zones -- --k=5) to keep the existing typology rather than silently accept the fallback."
- `ca0c876` records that the rule "applied strictly to the current grid, does not select k=5 (it fails only the single-zone-plaza criterion, 6 against a limit of 5)".
- Stored diagnostics at k = 5: silhouette 0.346, 6 single-zone plazas, 2.28 zones per plaza, 11,719 points (`zones.json` → `k_selection`, `rule_fell_back: true`, `chosen_by: "existing zones.json"`).
- `docs/spec.md:279-283` reported the pre-`dac2380` figures (11,580 points, silhouette 0.353, 4 single-zone plazas). **Corrected 2026-09-13:** the spec now gives both the original and the current figures and states that the rule falls back.
- The criterion ties k to P9's needs. That is stated openly, but an examiner may read it as choosing k for downstream convenience.

---

## D12 — Height-aware ray casting confined to P9

**What.** P9 casts with `heightAware: true`: an obstacle blocks only where it straddles the 1.6 m eye-height slice. P1–P8 call the engine unflagged (`docs/spec.md:347`; `4a1321f`, 2026-09-10).

**Reason: EVIDENCED.**
- Why P9 needs it: unflagged, "a 300 mm planter rim stops a sightline like a tower and a pergola roof four metres up blocks along its whole footprint, which would make half the intervention library meaningless."
- Why not back-applied: "**P1–P8 call the engine unflagged and are byte-identical:** when the flag is off not one of the comparisons it introduces is evaluated."
- Why it is a module constant: "a before/after comparison run half in one mode and half in the other would attribute the difference between two measurement systems to the intervention" (`docs/spec.md:347`).

**Consequence for P1–P8, checked. EVIDENCED.** Height-aware and unflagged casts "agree **exactly** across the whole corpus". The reason given: "there is exactly one such footprint in the eighteen sites — a 1.2 m structure at Gendarmenmarkt, 840 m from the nearest Gendarmenmarkt vantage and therefore beyond the 200 m sight line of every view in the study" (`docs/spec.md:389`; asserted in `test/precedent.test.js`).

**Affects.** P9 only. No reported P1–P8 number would change under the flag.

**Related, EVIDENCED.** P9 adds diagnostic metrics (`solidity`, `solid_share`, `closed_share`; `solid_frontage_m` removed in `7fb666f`). None of them "reaches a weight model nor is written to any corpus data file" (`docs/spec.md:349-354`). The four-metric set used for weights and zones is unchanged.

---

## Documented intentional limitations

Recorded in the codebase as known properties, not bugs.

| Limitation | Source |
|---|---|
| Engine agrees with Grasshopper at **one point on one site**; not validated | `docs/spec.md:118`; `577c944` |
| Sight-line range fixed at 200 m. A 100 m variant "was built and tested … and is not carried", to stay comparable with the Grasshopper toolchain. The 100 m results are not in the repo. | `docs/spec.md:201` |
| Stored headings are sensitive: "a sub-degree rotation can flip a single ray between a near facade and a 200 m escape" (~4% area, ~27% occlusivity at Herderplatz over 1.2°) | `docs/spec.md:439` |
| Two canonical 120° vantages sit outside their plaza boundary (Marktplatz Heidelberg, Hauptmarkt Trier) | `docs/spec.md:298` |
| Field points outside the surveyed range are kept unclipped (extrapolation) | `docs/spec.md:270, 285` |
| Per-site zone percentages are imprecise for small plazas; point counts are shown beside every figure | `docs/spec.md:275` |
| P7 pairwise distances are not independent; r / R² / ρ are descriptive only (a Mantel test is named as needed) | `docs/spec.md:308` |
| P8 discriminating-stratum accuracy is an estimate on "*decisive disagreements*, not on all disagreements" | `docs/spec.md:331` |
| P8 pooled binomial treats judgements as independent; a crossed random-effects model "which this sample size does not support" would be correct | `docs/spec.md:329, 332` |
| P8 has no attention check; accuracy-by-margin substitutes, "a diagnostic on the instrument, not a hypothesis test" | `docs/spec.md:328` |
| Compactness collapses under slender obstacles (a pergola: −2.5% area, −53% compactness) | `docs/spec.md:349` |
| Enclosure "is not additive across depth": a near object replaces a far facade's angle rather than adding to it | `docs/spec.md:372` |
| `solid_share` is saturated at Konstablerwache (baseline 0.981): "the sign is the finding and the magnitude is not" | `docs/spec.md:351` |
| Tier A is "a sensitivity analysis, not a design simulation" | `docs/spec.md:339, 360` |
| P9 is one developed case with no second site. Built-over positions leave the sample, "so an apparent improvement can partly be the disappearance of the worst positions" | `docs/spec.md:402` |

---

## Unresolved inconsistencies bearing on reported results

No `TODO`/`FIXME`/`XXX`/`HACK` markers exist in the source (`git grep`; the only matches are inside JPEG binaries). The following are inconsistencies found in the committed files.

| # | Inconsistency | Bears on | Source |
|---|---|---|---|
| U1 | The stored rule does not select the k = 5 in use. (The spec's pre-`dac2380` diagnostics were corrected on 2026-09-13; the rule mismatch itself remains, and is disclosed.) | P6 zones, P9 | D11 |
| U2 | The rating-blend fit and its holdout script were never committed | The stated justification for the reported weights | D6 |
| U3 | Hypothesis sets disagree, in three different numberings. `analysis-panoramic.json` stores the **old** H1–H3, including "Enclosure carries the largest perceptual weight". `docs/spec.md:237-244` lists a **replacement H1–H6**. `hypotheses.js` implements **H1–H5**, and its ids do not match the spec's: spec-H1 (reliability) becomes a separate, unnumbered `reliabilityPrecondition`; spec-H2 and spec-H3 keep their numbers; spec-H4 ("predicted by distance") becomes code-H1; spec-H5 ("all four dimensions non-zero") becomes code-H4; spec-H6 becomes code-H5, inverted (D8). A citation of "H1" (or "H1–H3") needs to say which of the three numberings it means — see the fix applied to `03_survey_protocol.md` §3.3, which originally conflated them. | Which hypotheses the thesis reports, and under what numbers | `analyze.mjs:527-551`; `docs/spec.md:237-244`; `hypotheses.js:58-215` |
| U4 | The stored n = 30 subset fit does not reproduce from the committed response file | Any "has the result settled" claim based on it | `02_results_data.md` §3.7 |
| U5 | `fingerprints.js:1-14` still describes the fingerprint as the 120° reading; the live fit uses 360° | A reader verifying D4 from the code | `01_methods_implementation.md` §5.1 |
| U6 | The partial-r figures used partly to choose the enclosure definition (0.51 → 0.63) are not stored | D2 | `docs/spec.md:129` |
| U7 | The rank-normalisation weight ordering quoted in the spec has no committed code or output | D5a, the argument against old H3 | `docs/spec.md:233`; `02_results_data.md` §3.6 |
