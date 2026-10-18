# 05 — Closed perimeter

Reference for the metric **closed perimeter** and for its rating scale, **perceived facade continuity**: definition, results, interpretation, and its role in every phase. Companion to [01_methods_implementation.md](01_methods_implementation.md) (what the code does), [02_results_data.md](02_results_data.md) (the numbers), [03_survey_protocol.md](03_survey_protocol.md) (the instruments) and [04_decision_log.md](04_decision_log.md) (why).

---

## 1. At a glance

| Item | Value |
|---|---|
| Metric | **Closed perimeter** |
| Plain-language gloss | Visible continuous facade, in metres |
| Unit | m |
| Code key / stored field | `closedPerimeter` / `closed_perimeter_m` |
| Rating scale | **Perceived facade continuity** |
| Rating anchor, value 1 | Edges broken up, many gaps between buildings |
| Rating anchor, value 7 | Long, unbroken building fronts all around |
| Expected sign (metric vs rating) | +1: more closed perimeter, more perceived continuity |
| Aligned r at n = 46 | +0.2226 |

---

## 2. What closed perimeter is

### 2.1 Definition

From a vantage point, rays are cast over 360° (360 rays, 200 m sight limit, `perceptual_360` layer). Their end points form the isovist polygon. **Closed perimeter is the summed length of the polygon edges that run along continuous building facade.** An edge counts only when both of its end points are wall hits **and** those hits are on the same building, or on two buildings within 1.5 m of each other (a party wall or touching corner).

```
closed perimeter = Σ |pᵢ pᵢ₊₁|   over consecutive ray end points where
                   both are wall hits AND (same building OR |pᵢ pᵢ₊₁| ≤ 1.5 m)
```

Not counted: edges that jump across a street opening from one building to a farther one, and edges along the 200 m range limit where no building was hit.

Implementation: `src/lib/isovist.js`, `computeMetrics` (returned as `closedPerimeter`). Continuity tolerance `TOUCHING_TOLERANCE_M = 1.5`. Definition history, including the 2026-08-27 correction of the continuity rule: 01 §3.3, 04 D1.

In Benedikt's (1979) decomposition, an isovist's perimeter consists of **real-surface boundary** and **occluding radial boundary**. Closed perimeter is the real-surface part.

### 2.2 What it responds to

- **Grows with plaza size.** It is an absolute length, so a large plaza collects more of it simply by being large. Across the 18 plazas, r = 0.39 with isovist area.
- **Falls when the edge is broken.** Every street opening, gap or change of building without a shared wall removes length.
- **Falls when something stands free in the plaza.** A freestanding object hides long runs of continuous facade and contributes only its own short edges. Measured at Konstablerwache: kiosk −8.4%, market row −14.1%, colonnade −9.0% (`src/lib/presets.js`, comment block 1). Designers tend to expect the opposite ("more built surface, more of it"), so this belongs in the P9 methods.

### 2.3 Check against the reference toolchain

At one matched point on Zeil (360°, 200 m), the Decoding Spaces Grasshopper reference reports 376.35 m. This engine's closed perimeter, over the 86 poses that reproduce the reference area and compactness, spans 259.9–425.3 m (median 353.8). Benedikt's raw occluding-radial length spans 636.0–771.9 m, about twice as high (`docs/spec.md`, "Compared against Grasshopper 2026-08-29"). This is agreement at a single point on a single site, not a general validation.

### 2.4 Benedikt's occluding-radial measure as an alternative (exploratory, 2026-09-29)

To check whether Benedikt's occluding-radial length would serve the study better, it was computed at the 18 canonical `perceptual_360` points and swapped into the P5 fit in place of closed perimeter. Everything else was held equal: the same 552 triplets from 46 participants and the same fitting code. **Exploratory and not stored in the repository.** The script was run outside the repo and not committed. Report it as a sensitivity check, not as a result.

The occluding-radial length is the sum of radial depth jumps |dᵢ − dᵢ₊₁| at every edge that is neither continuous facade nor range-limit arc. Variant B counts building-to-building jumps only, excluding jumps onto the 200 m limit.

| | Closed perimeter (stored) | Occluding radials | Occluding radials, variant B |
|---|---:|---:|---:|
| Weight: area | 0.312 | 0.483 | 0.378 |
| Weight: compactness | 0.275 | 0.283 | 0.255 |
| Weight: this metric | **0.207** | **0.000** | 0.199 |
| Weight: enclosure index | 0.206 | 0.233 | 0.167 |
| NLL (lower is better) | **543.94** | 555.01 | 549.14 |
| Leave-one-plaza-out accuracy (chance 33.3%) | **52.6%** | 50.5% | 49.5% |
| Area-only baseline | 52.2% | 52.2% | 52.2% |

- With the occluding-radial measure, the fit gives the metric **zero weight**: bootstrap interval 0.000004–0.00005 over 500 participant resamples. It correlates +0.70 with area and −0.71 with enclosure index across the 18 plazas, so it adds nothing the other three do not already carry. Burgplatz (open to the Rhine) gets the highest value, 1,335 m.
- It correlates only r = 0.27 with closed perimeter. The two rank the plazas differently.
- Neither variant relates to the participants' ratings (|r| ≤ 0.11).
- Closed perimeter is the only one of the three that keeps a weight and edges past area alone. The margin is small and not significant (full model beats area-only in 9 of 15 decided folds, sign test p = 0.61).

---

## 3. The rating scale: perceived facade continuity

### 3.1 Wording

| Scale | 1 | 7 |
|---|---|---|
| Perceived facade continuity | Edges broken up, many gaps between buildings | Long, unbroken building fronts all around |

The wording asks about continuity only. It avoids *open* and *spacious* (the area scale) and *tall* and *enclosed* (the enclosure scale).

### 3.2 Administered wording and how participants read it

The 46 participants of the panoramic survey (`panoramic_v1`) rated the item between **"Views blocked, hidden corners"** and **"Clear sightlines, nothing hidden"**. This wording is recorded in `src/lib/survey360.js` (`RATING_SCALES`), in the stored survey records and in 03 §3.2. Participants reported judging the item by whether the building edges of the square were broken or continuous. On that basis, and with the thesis supervisor's agreement, the item is reported as perceived facade continuity.

*[Before the thesis is written, record here how those participant accounts were collected (for example in debriefing or in conversation) and from roughly how many participants.]*

Suggested methods sentence:

> *"The item was administered with the poles 'views blocked, hidden corners' and 'clear sightlines, nothing hidden'. Participants reported judging it by whether the building edges of the square were broken or continuous, and it is reported here as perceived facade continuity: 1 = 'edges broken up, many gaps between buildings', 7 = 'long, unbroken building fronts all around'."*

### 3.3 Direction mapping

Keep this exact, because the sign of the result depends on it.

| Administered anchor | Facade-continuity anchor | Stored value v → reported value |
|---|---|---|
| Views blocked, hidden corners (1) | Long, unbroken building fronts all around (**7**) | v' = 8 − v |
| Clear sightlines, nothing hidden (7) | Edges broken up, many gaps between buildings (**1**) | v' = 8 − v |

"Views blocked" corresponds to unbroken fronts, and "clear sightlines" to gaps. Reported ratings are reflected (v' = 8 − v), which keeps them on the same 1–7 scale, and the expected sign is +1. Mapping 1 → 1 instead would flip the reported correlation to r = −0.22, a contradiction rather than weak agreement. That mapping is **not** the one adopted.

### 3.4 Statistics

Source: `src/data/rating-validation.json`, scale `closedPerimeter`. Reflection is linear, so strengths, p-values and reliability are as stored. The raw sign under the facade-continuity reading is positive.

| Quantity | Value |
|---|---:|
| Pearson r (facade continuity) | +0.2226 |
| Aligned Pearson r | +0.2226 |
| Fisher 95% CI (aligned) | −0.27 to 0.62 |
| Permutation p (20,000 shuffles); Holm | 0.373; 0.373 |
| Aligned Spearman ρ; p | 0.046; 0.858 |
| Participant bootstrap (aligned); P(r > 0) | −0.21 to 0.62; 0.797 |
| Split-half reliability | 0.773 |
| Stability, aligned r at n = 10 / 20 / 30 / 46 | −0.57 / −0.54 / −0.46 / +0.22 |
| Anchor-side bias Δ (03 §3.3) | 0.07 |

The correlation moved from negative at 10–30 participants to weakly positive at 46, and is **not settled**: the last step exceeds the validation script's own 0.15 "still moving" threshold. Report it as unsettled.

### 3.5 Per-plaza values

Closed perimeter (stored `perceptual_360`), mean facade-continuity rating (reflected), and residual from the least-squares line of rating on closed perimeter. A positive residual means rated more continuous than the metric predicts.

| Plaza | Closed perimeter (m) | Mean rating (1–7) | Residual | Raters |
|---|---:|---:|---:|---:|
| Marktplatz, Heidelberg | 267.2 | 4.47 | +0.59 | 45 |
| Burgplatz, Düsseldorf | 272.1 | 3.17 | −0.71 | 40 |
| Hauptmarkt, Trier | 283.5 | 4.42 | +0.53 | 40 |
| Herderplatz, Weimar | 304.5 | 4.07 | +0.16 | 42 |
| Naschmarkt, Leipzig | 314.4 | 3.30 | −0.62 | 40 |
| Römerberg, Frankfurt | 330.8 | 3.88 | −0.06 | 40 |
| Marienplatz, Munich | 364.1 | 4.43 | +0.47 | 42 |
| Bebelplatz, Berlin | 395.4 | 3.56 | −0.42 | 39 |
| Zeil, Frankfurt | 396.5 | 3.98 | −0.01 | 43 |
| Odeonsplatz, Munich | 407.3 | 4.03 | +0.03 | 40 |
| Alter Markt, Cologne | 411.9 | 4.33 | +0.33 | 42 |
| Theaterplatz, Weimar | 414.9 | 4.02 | +0.02 | 44 |
| Alexanderplatz, Berlin | 497.9 | 3.55 | −0.53 | 42 |
| Konstablerwache, Frankfurt | 503.7 | 4.10 | +0.02 | 40 |
| Rathausmarkt, Hamburg | 566.8 | 3.88 | −0.26 | 41 |
| Augustusplatz, Leipzig | 571.9 | 4.05 | −0.09 | 42 |
| Gendarmenmarkt, Berlin | 602.9 | 3.80 | −0.37 | 40 |
| Hauptwache, Frankfurt | 622.9 | 5.10 | +0.91 | 41 |

Reproduce: per-site `computed` and `8 − mean_rating` from the `closedPerimeter` scale in `rating-validation.json`.

---

## 4. Results

All values stored. Sources: `src/data/analysis-panoramic.json`, `src/data/rating-validation.json`.

| Result | Value |
|---|---|
| Normalisation bounds (`perceptual_360`, frozen) | 267.22 m (Marktplatz, Heidelberg) to 622.93 m (Hauptwache, Frankfurt) |
| P5 normalised weight | 0.207 (third of four; enclosure index 0.206 is effectively tied) |
| Bootstrap 95% interval (1,000 participant resamples) | 0.112–0.289, excludes zero |
| Leave-one-metric-out cost | 2.02 pp of held-out accuracy, second largest after enclosure index (2.34 pp); area 1.87, compactness 0.54 |
| Rating convergence | aligned r = +0.22, p (Holm) = 0.37, not significant; reliability 0.77 |

**Reading.** Closed perimeter carries a stable, non-zero weight in how people judge plaza similarity, and removing it costs the model more accuracy than removing area. Its agreement with the facade-continuity rating is weak and not significant. It is the only one of the four metrics that does not converge with its own scale (area 0.75, compactness 0.58, enclosure index 0.83).

---

## 5. Interpretation: why the continuity percept and closed perimeter agree only weakly

Participants agreed with each other on this scale (split-half reliability 0.77), so there is a shared percept. The metric does not capture it well. Three reasons are specific to closed perimeter. Arguments that apply equally to all four metrics (panorama field of view, spill-over between adjacent scales, n = 18 plazas) are deliberately left out of this section.

### 5.1 An absolute length, judged as a proportion

Closed perimeter adds up metres, so it rises with plaza size (r = 0.39 with area). A person judging continuity asks what share of the surrounding edge is unbroken, not how many metres of wall there are.

Evidence from §3.5:
- **Small plazas are rated more continuous than the metric predicts.** Marktplatz Heidelberg has the lowest closed perimeter of all 18 (267 m). Every one of its 360 rays hits a building, so its edge is closed all round, and it is rated 4.47 (residual +0.59). Hauptmarkt Trier (284 m, +0.53) and Marienplatz Munich (364 m, +0.47) behave the same way.
- **Large plazas with openings are rated less continuous than predicted.** Alexanderplatz (498 m, −0.53) and Gendarmenmarkt (603 m, −0.37) collect long closed runs because they are large, but their edges are interrupted by wide openings.
- **Counter-example to state honestly.** Naschmarkt Leipzig is small and fully walled (every ray hits a building) yet rated less continuous than predicted (3.30, residual −0.62). Size alone does not explain every case, and §5.3 offers a candidate reason.

### 5.2 Metres ignore distance; the eye does not

Closed perimeter weights every metre of facade equally, whether it is 10 m or 150 m away. In the visual field, a distant 50 m facade fills a narrow angle, while a nearby 10 m gap fills a wide one. Near interruptions therefore count for less in the metric than in perception, and distant walls count for more. The engine's own documentation records this bias (`src/lib/isovist.js`, comment above `closedShare`). This argument is reasoning from the definition, not a separately tested result.

### 5.3 A plan measurement against an eye-level percept

Closed perimeter is computed from 2D building footprints. The panorama shows what footprints omit: trees, market stalls, kiosks, monuments, arcades and ground-floor openings, and height steps where a low building between tall ones reads as a gap. All of these can break the edge a person sees without breaking any footprint, and a continuous footprint can still present a visually fragmented front. This is reasoning, not a tested result. It is a candidate explanation for cases like Naschmarkt (§5.1), not a demonstrated one.

**Summary sentence for the thesis.** *Closed perimeter measures how much continuous wall there is; people perceive how continuous the edge is. The two diverge most where plaza size and edge continuity pull apart: small, fully framed squares and large, open-edged ones.*

**What would test this.** A proportional variant of the metric and a newly collected rating on the facade-continuity wording, administered as worded. Both are future work.

---

## 6. Closed perimeter in every phase

| Phase | Role of closed perimeter | Where it lives |
|---|---|---|
| P1 Site register | Not used. Building footprints and heights are the input it is computed from. | `src/data/sites.json` |
| P2 Viewer + ray-casting engine | Computed live at any clicked point alongside area, compactness and enclosure index. Stored for canonical readings in each layer. | `src/lib/isovist.js`; `src/data/results.json` field `closed_perimeter_m` |
| P3 Perceptual survey | One of four rating scales (§3). | `src/lib/survey360.js`; `survey-responses-360.json`, scale `closedPerimeter` |
| P4 Results dashboard | Shown as one of the four fingerprint dimensions and in the rating-validation figures. | dashboard / `FingerprintCharts.jsx` |
| P5 Weight fitting | One of four dimensions of the weighted distance. Weight 0.207; frozen bounds 267.22–622.93 m. | `src/data/analysis-panoramic.json` |
| P6 Isovist field mapping | Computed at every grid point (11,719 points); one of the four coordinates of each zone centre (k = 5). | `src/data/fields/*.json`, `src/data/zones.json` |
| P7 View-cloud comparison | One of the four coordinates of every view in a plaza's cloud (`perceptual_120` layer). | `src/data/view-clouds.json` |
| P8 Matched-view validation | Part of the geometry snapshotted into each trial. **The bank must not be rebuilt.** | `src/data/matched-view-trials.json` |
| P9 Design diagnostic | Reported before and after each intervention; freestanding objects lower it (§2.2). | `src/lib/presets.js`, `sandbox.js`, `DiagnosePage.jsx` |

In every phase the meaning is the same: **metres of continuous facade visible from the point**, in the `perceptual_360`, `field_360` or `perceptual_120` layer as stated. Each layer keeps its own bounds, and values from different layers are never compared.

---

## 7. Hypothesis H3

> *H3 — Where a metric does not match its rating scale, the mismatch is systematic and not due to inconsistent ratings.*

- **Rule** (`src/lib/analysis/hypotheses.js`): every metric that fails H2 sits on a scale with split-half reliability ≥ .40.
- **Result.** Closed perimeter is the only metric that fails H2: aligned r = +0.22 against perceived facade continuity, Holm p = 0.37. Its scale's split-half reliability is 0.77, so raters agreed with each other and the shortfall belongs to the metric. **Supported.**
- **The H3 figure** (`FacadeContinuityComparison`, computed by `facadeContinuityCorrelations`) correlates all four metrics against perceived facade continuity, with signs following §3.3: |r| compactness 0.46, area 0.38, closed perimeter 0.22, enclosure index 0.01. Two other metrics track the percept more closely than the one built to measure it.
- **Why it fails** (absolute length where people judge the continuous proportion of the edge, §5.1) is exploratory and must be labelled so.

---

## 8. What stays frozen

- `src/data/analysis-panoramic.json`: weights, bounds and all stored statistics.
- `src/data/zones.json`: zone centres.
- `src/data/matched-view-trials.json`: not rebuilt.
- `src/data/survey-responses-360.json`: rating values stay as administered (1 = views blocked). Reflection (§3.3) is applied when reporting, never written back into the records.

---

## 9. Wording shown to later participants

From `survey_version` `panoramic_v2` on, the survey shows the facade-continuity wording. It keeps the stored polarity: "Long, unbroken building fronts all around" is value 1, where "Views blocked, hidden corners" was, and "Edges broken up, many gaps between buildings" is value 7. The same end of the scale therefore stores the same number for every participant, new rows join the same Sheet column, and the reflection in §3.3 (v' = 8 − v) applies to all of them. `test/survey360.test.js` pins this. The 46 `panoramic_v1` sessions saw the wording in §3.2, and the methods should say that the item text changed between the two groups.

`npm run validate:ratings` writes the CURRENT anchors into `rating-validation.json`. Once `panoramic_v2` sessions exist, that record should list both wordings rather than only the new one.

Everything else uses the facade-continuity reading already: the Weights page, the H3 figure, the "Measured against perceived" scatter (which plots this scale as 8 − mean rating) and the `validate-ratings.mjs` comments.
