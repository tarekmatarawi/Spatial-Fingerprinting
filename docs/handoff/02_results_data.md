# 02 — Results: numerical data

Numerical results for the thesis results chapter. Every number below comes from one of three sources, and each table says which:

- **(stored)** — read from a committed data file, named in the table's source line.
- **(re-run)** — recomputed on 2026-09-13 by calling the repository's own library functions or scripts on the committed data at commit `9cbfacb`. The call is named in the source line. None of these re-runs wrote to `src/data/`. The one later write is `npm run zones -- --diagnostics-only`, which added the k-selection table to `zones.json` without changing the typology (§5.3).
- **(computed now)** — a statistic that no committed file or page stores, computed for this document. It is labelled every time.

The re-run scripts are in the session scratchpad and are not committed:

- `r1_sites_survey.mjs` — site descriptives and correlations (§1), both surveys (§2, §4), the in-sample fit (§3.2);
- `r2_p6_p9.mjs` — zone breakdown per plaza (§5.1), cloud matrices (§6.1), matched-view analysis (§7), Konstablerwache and scenario recompute (§8);
- `r3.mjs` — the n = 30 reproduction check (§3.7).

Full-precision matrices and long tables are exported to `docs/handoff/02_data/` as CSV. Where a table in this file is rounded for width, it says so and names the CSV.

`NOT RUN` means no stored output exists and the result was not produced for this document.

---

## 0. Which dataset is which

The request assumes a **main 120° survey** and a **360° panoramic pilot**. The repository holds three perceptual datasets, and the fitted results come from the 360° one.

| Dataset | Stimulus / layer | Records | Collected (`started_at` range) | Weight fit in stored data? | Source |
|---|---|---|---|---|---|
| **Static-photo triplet survey** (the "120°" survey) | Static photograph; paired with the `perceptual_120` layer | 56 sessions | 2026-08-06T19:09:07.810Z → 2026-08-19T13:16:45.086Z | **No.** `NOT RUN: weight fit on the 120° static-photo survey`. `scripts/analyze.mjs --source=archive` would produce `src/data/analysis-archive.json`; no such file exists in the tree or in git history. | `src/data/survey-responses.json` |
| **360° pilot** | Equirectangular panorama, `survey_version: "pilot_360_area_matched"` | 2 sessions (1 completed with 15 answers, 1 in progress with 2 answers) | 2026-08-19 | No | `git show abc37b8^:src/data/pilot-360-responses.json` (added in `0218a43`, deleted in `abc37b8`) |
| **Panoramic triplet + rating survey** (the live P3 instrument) | Equirectangular panorama, `survey_version: "panoramic_v1"`; paired with the `perceptual_360` layer | 46 sessions | 2026-08-22T21:51:11.351Z → 2026-09-02T06:08:52.678Z | **Yes.** This is the only fitted model. Its weights drive P6–P9. | `src/data/survey-responses-360.json` → `src/data/analysis-panoramic.json` |

The commit that deleted the pilot file (`abc37b8`) is titled "Consolidate to a single panoramic survey with ratings". The 2 pilot participant IDs do not appear among the 46 panoramic sessions (re-run).

§2 reports the 120° static-photo survey, as requested. §3 reports the only fitted weights, which are the 360° panoramic survey's. §4 reports that survey's own descriptives, the 2-session pilot, and how the two instruments differ.

---

## 1. Sites

### 1.1 The 18 plazas and their canonical metrics

Each active site has exactly one canonical reading per layer. Both layers come from a **single hand-placed vantage point per site**, saved in the P2 viewer; there is no grid sampling for these readings.

| Layer | fov | Rays | Range | Vantage point | Saved |
|---|---|---|---|---|---|
| `perceptual_120` | 120° | 120 | 200 m | Placed to reproduce the Street View camera position and heading | 2026-08-29T08:28:26Z → 08:31:37Z |
| `perceptual_360` | 360° | 360 | 200 m | Placed where the panorama was taken; heading stored but has no effect on the metrics | 2026-08-29T09:05:57Z → 09:10:31Z |

The vantage points of the two layers are not the same point. Their separation per site (re-run) ranges from 0 m (Gendarmenmarkt, the only identical pair) through a median of 18.65563547102807 m to a maximum of 69.03284797833565 m (Bebelplatz).

Source: `src/data/results.json` (stored), via `buildFingerprints` and `src/data/sites.json`. CSV: `02_data/sites_canonical_metrics.csv`.

| # | Plaza | City | 120° area m² | 120° compactness | 120° occlusivity m | 120° enclosure | 360° area m² | 360° compactness | 360° occlusivity m | 360° enclosure |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gendarmenmarkt | Berlin | 12524 | 0.1262 | 193.8 | 0.1121 | 30856.12 | 0.1286 | 602.92 | 0.1587 |
| 2 | Hauptwache | Frankfurt am Main | 10180.95 | 0.2077 | 188.82 | 0.1748 | 20936.65 | 0.11 | 622.93 | 0.1631 |
| 3 | Römerberg | Frankfurt am Main | 2939.94 | 0.2491 | 114.26 | 0.1786 | 9663.21 | 0.0806 | 330.77 | 0.1991 |
| 4 | Zeil | Frankfurt am Main | 6625.39 | 0.3085 | 177.65 | 0.2639 | 10150.96 | 0.1083 | 396.51 | 0.3328 |
| 5 | Bebelplatz | Berlin | 8645.75 | 0.3837 | 217.5 | 0.1887 | 25275.48 | 0.2031 | 395.37 | 0.2102 |
| 6 | Alexanderplatz | Berlin | 8815.28 | 0.4379 | 243.64 | 0.1988 | 21775.4 | 0.1728 | 497.91 | 0.2162 |
| 7 | Marienplatz | Munich | 5639.89 | 0.2274 | 192.93 | 0.2913 | 7532.2 | 0.0749 | 364.06 | 0.3818 |
| 8 | Odeonsplatz | Munich | 6903.19 | 0.1758 | 273.46 | 0.2053 | 14224.87 | 0.155 | 407.26 | 0.3402 |
| 9 | Konstablerwache | Frankfurt am Main | 8798.21 | 0.1736 | 192.92 | 0.1319 | 16698.05 | 0.1257 | 503.72 | 0.1886 |
| 10 | Alter Markt | Cologne | 3752.07 | 0.2002 | 140.51 | 0.1829 | 10886.49 | 0.0577 | 411.95 | 0.1965 |
| 11 | Rathausmarkt | Hamburg | 10151.25 | 0.4018 | 197.24 | 0.2895 | 20141.25 | 0.1331 | 566.77 | 0.2256 |
| 12 | Naschmarkt | Leipzig | 1759.02 | 0.1895 | 140.28 | 0.3145 | 4020.21 | 0.1524 | 314.45 | 0.3841 |
| 13 | Burgplatz | Düsseldorf | 9753.23 | 0.1363 | 122.22 | 0.159 | 46656.93 | 0.1481 | 272.07 | 0.1131 |
| 14 | Marktplatz | Heidelberg | 2357.17 | 0.6516 | 110.92 | 0.3036 | 3905.37 | 0.1565 | 267.22 | 0.2651 |
| 15 | Augustusplatz | Leipzig | 7924 | 0.2005 | 198.52 | 0.178 | 33095.58 | 0.1412 | 571.94 | 0.1145 |
| 16 | Hauptmarkt | Trier | 4517.83 | 0.1758 | 114.14 | 0.2421 | 10723.82 | 0.1028 | 283.54 | 0.1893 |
| 17 | Herderplatz | Weimar | 2778.99 | 0.2428 | 147.56 | 0.1957 | 5648.63 | 0.057 | 304.47 | 0.2471 |
| 18 | Theaterplatz | Weimar | 2693.41 | 0.1653 | 171.69 | 0.1701 | 7804.35 | 0.0684 | 414.88 | 0.1583 |

Stored precision: area and occlusivity to 2 dp; compactness and enclosure to 4 dp.

### 1.2 Descriptive statistics per metric (n = 18 per cell)

Source: re-run over the table above. SD uses n − 1. Quartiles use linear interpolation. CV = SD/mean.

**`perceptual_120`**

| Metric | n | Mean | SD | Min | Q1 | Median | Q3 | Max | CV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Area (m²) | 18 | 6486.642777777777 | 3290.5604048118244 | 1759.02 | 3142.9725 | 6764.29 | 8811.0125 | 12524 | 0.5072825061501413 |
| Compactness | 18 | 0.25853888888888893 | 0.13346897034798624 | 0.1262 | 0.1758 | 0.2041 | 0.29365 | 0.6516 | 0.5162433045240888 |
| Occlusivity (m) | 18 | 174.33666666666667 | 45.94769110245975 | 110.92 | 140.3375 | 183.235 | 196.38 | 273.46 | 0.26355724232305167 |
| Enclosure | 18 | 0.21004444444444445 | 0.06000631557175238 | 0.1121 | 0.1756 | 0.1922 | 0.25845 | 0.3145 | 0.2856838976649235 |

**`perceptual_360`**

| Metric | n | Mean | SD | Min | Q1 | Median | Q3 | Max | CV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Area (m²) | 18 | 16666.420555555556 | 11564.488939511677 | 3905.37 | 8269.065 | 12555.68 | 21565.7125 | 46656.93 | 0.6938795826592046 |
| Compactness | 18 | 0.1209 | 0.041610900721127504 | 0.057 | 0.08615 | 0.12715 | 0.151325 | 0.2031 | 0.3441761846247105 |
| Occlusivity (m) | 18 | 418.26333333333343 | 117.10467223310745 | 267.22 | 318.53 | 401.885 | 502.2675 | 622.93 | 0.27997833637447084 |
| Enclosure | 18 | 0.2269055555555555 | 0.08352857540085747 | 0.1131 | 0.169475 | 0.20465 | 0.2606 | 0.3841 | 0.3681204508031816 |

The min and max in these tables are the frozen normalisation bounds for each layer (stored in `analysis-panoramic.json` → `bounds` for 360°, and `matched-view-trials.json` → `source.bounds` for 120°).

### 1.3 Metric–metric correlation matrices (n = 18 sites)

**Computed now.** No committed file stores these. `WeightsPage.jsx` draws a correlation matrix live but does not save it. Pearson was computed with `correlationMatrix` (`src/lib/analysis/projection.js:188-194`) and Spearman with `spearman` (`src/lib/analysis/clouds.js:310-327`, average ranks for ties), on the raw values in §1.1. Pearson is unchanged by min–max normalisation.

**`perceptual_360`** (the layer the fit and P6/P9 use)

| Pearson r | Area | Compactness | Occlusivity | Enclosure |
|---|---:|---:|---:|---:|
| Area | 1 | 0.45450186612088 | 0.39095537073001063 | −0.6443809838543789 |
| Compactness | 0.45450186612088 | 1 | 0.12512879767805749 | 0.007003922837413463 |
| Occlusivity | 0.39095537073001063 | 0.12512879767805749 | 1 | −0.35262040369263536 |
| Enclosure | −0.6443809838543789 | 0.007003922837413463 | −0.35262040369263536 | 1 |

| Spearman ρ | Area | Compactness | Occlusivity | Enclosure |
|---|---:|---:|---:|---:|
| Area | 1 | 0.391124871001032 | 0.5335397316821465 | −0.6408668730650154 |
| Compactness | 0.391124871001032 | 1 | 0.0010319917440660474 | 0.12280701754385964 |
| Occlusivity | 0.5335397316821465 | 0.0010319917440660474 | 1 | −0.36429308565531476 |
| Enclosure | −0.6408668730650154 | 0.12280701754385964 | −0.36429308565531476 | 1 |

**`perceptual_120`**

| Pearson r | Area | Compactness | Occlusivity | Enclosure |
|---|---:|---:|---:|---:|
| Area | 1 | −0.13165145905688597 | 0.5444103707531953 | −0.450494682739414 |
| Compactness | −0.13165145905688597 | 1 | −0.017365883747177166 | 0.510294979768987 |
| Occlusivity | 0.5444103707531953 | −0.017365883747177166 | 1 | −0.18707241555512946 |
| Enclosure | −0.450494682739414 | 0.510294979768987 | −0.18707241555512946 | 1 |

| Spearman ρ | Area | Compactness | Occlusivity | Enclosure |
|---|---:|---:|---:|---:|
| Area | 1 | −0.12596800852672516 | 0.5830753353973168 | −0.4757481940144479 |
| Compactness | −0.12596800852672516 | 1 | 0.09189469474490605 | 0.5885390562314208 |
| Occlusivity | 0.5830753353973168 | 0.09189469474490605 | 1 | −0.12074303405572756 |
| Enclosure | −0.4757481940144479 | 0.5885390562314208 | −0.12074303405572756 | 1 |

**Same metric across the two layers** (computed now, n = 18): how well a site's 120° value tracks its 360° value.

| Metric | Pearson r | Spearman ρ |
|---|---:|---:|
| Area | 0.7905603849622319 | 0.8637770897832817 |
| Compactness | 0.39437672625918585 | 0.23954572113278882 |
| Occlusivity | 0.6012147653578063 | 0.6656346749226006 |
| Enclosure | 0.7322827832314707 | 0.8637770897832817 |

`src/lib/analysis/hypotheses.js:228` hard-codes "area ↔ enclosure r = −0.64". The computed 360° Pearson value above is −0.6443809838543789, which matches. The companion figure "63.9% of area is reconstructable from the other three" is `NOT RUN`: there is no code that computes it and it was not recomputed here.

---

## 2. Survey — 120° static-photo study

Source: `src/data/survey-responses.json` (stored). Exclusions were re-run with `selectTriplets` and `summarise` (`src/lib/analysis/exclusions.js`) against the `perceptual_120` fingerprints. Coverage was re-run with `pooledCoverage` (`src/lib/coverage.js`).

### 2.1 Participants and exclusions

| Quantity | Value |
|---|---:|
| Session records (participants who opened the survey) | 56 |
| `status: completed` | 44 |
| `status: in_progress` (stored; the UI treats these as abandoned once quiet for 30 min) | 12 |
| Attention check administered | yes (1 check per session) |
| Attention check passed | 54 |
| Attention check failed | 0 |
| Never reached the check | 2 |
| **Participants retained** under the stored exclusion rule | **54** |
| Dropped: failed the check | 0 |
| Dropped: never reached the check | 2 |

The check excluded nobody by failure (`attentionCheckDiscriminated: false`).

**Recruitment.** `NOT FOUND` in code or data. The only participant descriptors stored are `background` and `age_group`, counted over n = 56 records:

| Field | Counts |
|---|---|
| `background` | yes 25; no 17; undisclosed 2; missing 12 |
| `age_group` | 18–24: 9; 25–34: 27; 35–44: 5; 45–54: 3; missing 12 |

### 2.2 Judgements

| Quantity | Value |
|---|---:|
| Responses stored, including attention checks | 1387 |
| Attention-check triplets (dropped) | 54 |
| Triplets from the 2 participants who never reached the check (dropped) | 16 |
| Triplets naming an excluded site | 0 |
| Malformed triplets | 0 |
| **Genuine triplets retained** | **1317** |

Answers per record, including the check (n = 56): min 8, median 27, mean 24.767857142857142, max 27. Distribution: 27 answers ×44; 25 ×1; 23 ×2; 20 ×1; 19 ×1; 17 ×1; 15 ×1; 14 ×2; 13 ×1; 8 ×2.

Genuine triplets per retained participant (n = 54): min 12, median 26, mean 24.38888888888889, max 26.

Session duration, `finished_at − started_at`, for completed sessions (n = 44): min 1.1705833333333333 min, median 3.7683416666666667 min, mean 51.954189393939394 min, max 1441.78435 min.

Per-triplet response time: `NOT RUN`. The records carry no `duration_ms` field.

### 2.3 Site and pair coverage

Pooled over all 56 sessions, attention checks excluded. That is 1333 genuine triplets, including the 16 from the two non-retained participants.

| Quantity | Value |
|---|---:|
| Possible pairs | 153 |
| Pairs seen ≥ 1 time | 153 |
| Pairs seen ≥ 2 times | 153 |
| Pairs never seen | 0 |
| Co-occurrences per pair: min | 13 |
| median | 26 |
| mean | 26.137254901960784 |
| SD | 4.676451116652415 |
| max | 41 |

Distribution of pair counts ("count: number of pairs"): 13:1, 16:1, 17:3, 18:5, 19:4, 20:3, 21:7, 22:7, 23:15, 24:10, 25:12, 26:13, 27:11, 28:10, 29:14, 30:8, 31:11, 32:8, 33:4, 34:1, 35:3, 37:1, 41:1.

Site appearances (n = 18 sites): Gendarmenmarkt 196, Odeonsplatz 204, Zeil 205, Alter Markt 209, Naschmarkt 215, Marktplatz 216, Konstablerwache 217, Theaterplatz 219, Augustusplatz 224, Römerberg 224, Rathausmarkt 226, Herderplatz 227, Burgplatz 230, Hauptmarkt 231, Marienplatz 232, Alexanderplatz 239, Bebelplatz 242, Hauptwache 243.

### 2.4 Consistency checks

| Check | Result |
|---|---|
| Attention check | 54 passed, 0 failed, 2 not reached (n = 56) |
| Identical site trio repeated within one participant (genuine triplets, re-run) | 6 occurrences across all sessions |
| Distinct site trios shown | 659. Shown once: 260; twice: 209; three times: 126; four: 45; five: 17; six: 2 |
| Repeat-trial agreement (same person, same triplet) | `NOT RUN` |
| Between-participant agreement on identical triplets | `NOT RUN` |
| Noise ceiling for the triplet task | `NOT RUN` |

---

## 3. Fitted weights — 360° panoramic survey × `perceptual_360`

This is the only fitted model in the repository. Source: `src/data/analysis-panoramic.json` (stored; `generated_at` 2026-09-02T06:39:49.858Z; seeds fit, bootstrap and permutation all 20260817), unless a row says otherwise. There are n = 552 triplets from 46 participants; exclusions are in §4.1.

### 3.1 Weights

| Metric | Raw weight | Normalised weight (sum = 1) |
|---|---:|---:|
| Area | 1.8161977055725425 | 0.3121969818048535 |
| Compactness | 1.5991418304029197 | 0.27488596169781887 |
| Occlusivity | 1.2014139828422046 | 0.2065181660513352 |
| Enclosure | 1.2007201001547354 | 0.20639889044599233 |

Fit settings: `restarts` 5, `converged: true`.

**Reproduction (re-run).** `fitWeights(triplets)` on the current data gives identical weights: maximum absolute difference in normalised weights 0, and NLL 543.9406041028135. The best restart converged after 134 iterations.

### 3.2 In-sample fit (n = 552)

| Quantity | Value | Source |
|---|---:|---|
| Negative log-likelihood | 543.9406041028135 | stored |
| Log-likelihood | −543.9406041028135 | stored (sign flipped) |
| Chance NLL, 552 · ln 3 | 606.4339833447965 | computed now |
| In-sample accuracy (argmax pair = chosen pair) | 0.5416666666666666 (299 of 552) | re-run: `accuracy(triplets, fit.weights)` |
| Chance accuracy | 0.3333333333333333 | `CHANCE` in `crossval.js` |

### 3.3 Bootstrap confidence intervals

Participant-level resampling, 1000 resamples, 0 failures. Each resample was warm-started from the full-data fit. Intervals are 2.5–97.5 percentiles of the normalised weights, n = 1000 draws per metric.

| Metric | Mean | Median | 95% CI low | 95% CI high |
|---|---:|---:|---:|---:|
| Area | 0.3138697307028622 | 0.31075927896169114 | 0.19727276586799666 | 0.454548393305739 |
| Compactness | 0.2728809968778426 | 0.27321302815611137 | 0.17934339769857233 | 0.36436362556455826 |
| Occlusivity | 0.2051339093459107 | 0.205926022489423 | 0.11238918239195585 | 0.289325405629569 |
| Enclosure | 0.20811536307338463 | 0.2085692340882898 | 0.11565086927227057 | 0.2918858326775322 |

### 3.4 Held-out accuracy

| Scheme | Result |
|---|---|
| **Leave-one-plaza-out**, 18 folds, macro-average over folds | **0.526011945768111** (per-fold table below) |
| Leave-one-participant-out | `NOT RUN` (no stored output; the script cited in `analyze.mjs` is not in the repository) |
| Random k-fold over triplets | `NOT RUN` |

Per fold. `n` is the number of held-out triplets naming that plaza; a triplet is held out in 3 folds, so the n column sums to 1656 = 3 × 552.

| Held-out plaza | n | Full model accuracy | Area-only accuracy | Δ (full − area) |
|---|---:|---:|---:|---:|
| Gendarmenmarkt | 98 | 0.5 | 0.5102040816326531 | −0.010204081632653073 |
| Hauptwache | 83 | 0.5301204819277109 | 0.5301204819277109 | 0 |
| Römerberg | 86 | 0.5581395348837209 | 0.5 | 0.05813953488372092 |
| Zeil | 104 | 0.6153846153846154 | 0.5480769230769231 | 0.06730769230769229 |
| Bebelplatz | 82 | 0.5487804878048781 | 0.6341463414634146 | −0.08536585365853655 |
| Alexanderplatz | 98 | 0.5306122448979592 | 0.5816326530612245 | −0.05102040816326525 |
| Marienplatz | 90 | 0.43333333333333335 | 0.5111111111111111 | −0.07777777777777772 |
| Odeonsplatz | 78 | 0.5128205128205128 | 0.4230769230769231 | 0.0897435897435897 |
| Konstablerwache | 91 | 0.4835164835164835 | 0.4835164835164835 | 0 |
| Alter Markt | 103 | 0.47572815533980584 | 0.6019417475728155 | −0.12621359223300965 |
| Rathausmarkt | 89 | 0.5056179775280899 | 0.5056179775280899 | 0 |
| Naschmarkt | 91 | 0.6043956043956044 | 0.5714285714285714 | 0.03296703296703296 |
| Burgplatz | 85 | 0.49411764705882355 | 0.4823529411764706 | 0.011764705882352955 |
| Marktplatz | 99 | 0.5555555555555556 | 0.48484848484848486 | 0.07070707070707072 |
| Augustusplatz | 93 | 0.5268817204301075 | 0.5161290322580645 | 0.010752688172043001 |
| Hauptmarkt | 82 | 0.6341463414634146 | 0.5853658536585366 | 0.04878048780487809 |
| Herderplatz | 90 | 0.5555555555555556 | 0.4777777777777778 | 0.07777777777777778 |
| Theaterplatz | 114 | 0.40350877192982454 | 0.4473684210526316 | −0.04385964912280704 |
| **Mean** | 18 folds | **0.526011945768111** | **0.5219286558982159** | **0.004083289869894952** |

### 3.5 Baseline comparisons

All held-out figures are leave-one-plaza-out, 18 folds.

| Baseline | Run? | Result |
|---|---|---|
| **Chance** (1/3) | yes (stored) | Full-model LOPO 0.526011945768111 vs 0.3333333333333333. Permutation test with 1000 label shuffles: p = 0.000999000999000999 (add-one form, the floor for 1000 shuffles). Null distribution: mean 0.33346732988299366, min 0.2769371007328533, 95th percentile 0.3683675627926581, max 0.39369123945454415. |
| **Area only** vs full model | yes (stored) | Area-only LOPO 0.5219286558982159; full 0.526011945768111; mean fold Δ +0.004083289869894952. Paired over 18 folds: 9 wins, 6 losses, 3 ties. Exact two-sided sign test on the 15 non-tied folds: p = 0.6072387695312507. |
| **Leave-one-metric-out** (the full model minus one metric) | yes (stored) | See the table below |
| Equal weights (w = ¼ each) | `NOT RUN` | — |
| Single-metric models other than area (compactness only, occlusivity only, enclosure only) | `NOT RUN` | — |

Leave-one-metric-out, against the full-model LOPO accuracy of 0.526011945768111:

| Metric removed | LOPO accuracy without it | Drop | Rank (largest drop = 1) |
|---|---:|---:|---:|
| Enclosure | 0.5026533111210827 | 0.023358634647028254 | 1 |
| Occlusivity | 0.5057686389085434 | 0.020243306859567545 | 2 |
| Area | 0.5073027197290659 | 0.018709226039045013 | 3 |
| Compactness | 0.5206325489446082 | 0.005379396823502747 | 4 |

The stored legacy H3 block also holds one bootstrap-derived figure (n = 1000). Enclosure had the largest weight in a share of 0.045 of draws. Its lead over the next-largest weight had mean −0.1281390701990168 and 95% interval [−0.31294925685280944, 0.017315593933345023]. The block's verdict string is `"disagreement"`. Methods doc §1.4 records that this block is superseded.

### 3.6 Robustness runs

| Variant | Result |
|---|---|
| Regularisation (L2, ridge, any penalty) | `NOT RUN`. No such code exists (methods doc §5.4). |
| L1 or Minkowski distance | `NOT RUN`. Searched `src/`, `scripts/`, `test/` and `git log --all -S"minkowski"`: no implementation. |
| Rank normalisation | `NOT RUN`. No implementation. `docs/spec.md` states a weight ordering under rank normalisation, but no committed code or data produces it. |
| Unweighted (equal-weight) *clustering* of the field layer | Run. Reported in §5, not here, because it does not refit the choice model. |
| Sample-size sensitivity (`--limit=30`) | Run and stored (§3.7), but it does not reproduce from the current data. |

### 3.7 Stored subset fit: first 30 participants

Source: `src/data/analysis-panoramic-n30.json` (stored; `generated_at` 2026-08-29T15:55:17.667Z), n = 360 triplets from 30 participants.

**This result does not reproduce from the committed response file (re-run).**

- The stored weights, evaluated on the first 30 participants by `started_at` in the current `survey-responses-360.json`, give NLL 358.3846502823471. The stored value is 367.8407155139225.
- The per-fold triplet counts differ from the stored ones at 16 of 18 folds, and ordering by `finished_at` gives the same mismatch.
- The subset used on 2026-08-29 therefore differs from any first-30 prefix of the current file.

It is reported here for completeness and is not used anywhere else in this document.

**Weights:**

| Metric | Raw | Normalised | Bootstrap 95% CI (n = 1000) |
|---|---:|---:|---|
| Area | 1.6543410372802672 | 0.3872079635726146 | 0.19012633931811215 – 0.6674660779384601 |
| Compactness | 0.8361419051876968 | 0.19570378602087773 | 0.011318119164369532 – 0.3275896951225935 |
| Occlusivity | 1.0224502015111123 | 0.2393103063153093 | 0.07758422229298287 – 0.3864238931301149 |
| Enclosure | 0.7595539764208169 | 0.17777794409119826 | 0.01754588578946072 – 0.3383747462876008 |

**Held-out accuracy and baselines:**

| Quantity | Value |
|---|---|
| NLL | 367.8407155139225 |
| LOPO accuracy | 0.4800266087514669 |
| Area-only LOPO accuracy | 0.48626839993097604 |
| Paired over folds | 8 wins, 9 losses, 1 tie; sign-test p = 1 |
| Permutation p | 0.000999000999000999 (null mean 0.33235547103022234, 95th percentile 0.3763526301229505) |

**Leave-one-metric-out drops:**

| Metric removed | Drop |
|---|---:|
| Area | 0.025305430459774347 |
| Occlusivity | 0.01832403618893269 |
| Compactness | 0.011733430616387042 |
| Enclosure | 0.011410675215505706 |

### 3.8 Rating validation — same 46 participants, not part of the fit

Source: `src/data/rating-validation.json` (stored; `generated_at` 2026-09-02T06:24:57.202Z).

- 46 participants gave 2972 ratings.
- Each scale correlates, across n = 18 plazas, the mean 1–7 rating per plaza (41.27777777777778 ratings per plaza on average) against the raw computed `perceptual_360` metric.
- Pearson p is a permutation p with 20,000 shuffles, then Holm-adjusted across the four scales.
- The participant bootstrap uses 2000 resamples. Split-half reliability uses 2000 splits, Spearman–Brown corrected.
- "Aligned" multiplies by the expected sign. Occlusivity's is −1 because its high rating anchor is "Clear sightlines, nothing hidden".

**Correlations and significance:**

| Scale | Pearson r (raw) | Pearson r (aligned) | Fisher 95% CI (aligned) | Pearson p | Holm p | Spearman ρ (aligned) | Spearman p |
|---|---:|---:|---|---:|---:|---:|---:|
| Area | 0.7492826496021695 | 0.7492826496021695 | 0.4343514841216132 – 0.9009773208045824 | 0.00014999250037498125 | 0.00044997750112494374 | 0.8183694530443757 | 0.00004999750012499375 |
| Compactness | 0.582058158603626 | 0.582058158603626 | 0.15816103821710903 – 0.824797087189609 | 0.012899355032248387 | 0.025798710064496775 | 0.5108359133126935 | 0.03134843257837108 |
| Occlusivity | −0.22261509224597228 | 0.22261509224597228 | −0.272594025657234 – 0.6245776228026187 | 0.37258137093145344 | 0.37258137093145344 | 0.04643962848297214 | 0.8576571171441428 |
| Enclosure | 0.8262998777106189 | 0.8262998777106189 | 0.5851697076504866 – 0.9331759558830152 | 0.00004999750012499375 | 0.000199990000499975 | 0.8679050567595459 | 0.00004999750012499375 |

**Participant bootstrap and noise ceiling:**

| Scale | Bootstrap 95% CI (aligned r) | P(r > 0) in bootstrap | Split-half reliability (noise ceiling) | Disattenuated r |
|---|---|---:|---:|---:|
| Area | 0.7097642606575824 – 0.7807557537932263 | 1 | 0.9894447963120552 | 0.7532686477652891 |
| Compactness | 0.35673459698096827 – 0.7413819289597513 | 1 | 0.9488464976430857 | 0.597541952174636 |
| Occlusivity | −0.20728056553663962 – 0.62126641961782 | 0.797 | 0.7734349476475476 | 0.2531294690702544 |
| Enclosure | 0.7739222257168984 – 0.8496062277988611 | 1 | 0.9742150281362173 | 0.8371634829177902 |

**Stability trajectory** (stored). Aligned r recomputed on the first n participants; the script orders them by `submitted_at`, falling back to `started_at`.

| Scale | n = 10 | n = 20 | n = 30 | n = 46 |
|---|---:|---:|---:|---:|
| Area | 0.7199470043350147 | 0.7463274589148384 | 0.74105614773407 | 0.7492826496021695 |
| Compactness | 0.2319832770160432 | 0.12899745786386024 | 0.15268958458608922 | 0.582058158603626 |
| Occlusivity | −0.5733073706190658 | −0.5373225040255463 | −0.46230156676582784 | 0.22261509224597228 |
| Enclosure | 0.7268863950209866 | 0.7574837886218081 | 0.7751977372770688 | 0.8262998777106189 |

---

## 4. 360° panoramic survey (the prompt's "pilot")

### 4.1 Participants, judgements, sites

Source: `src/data/survey-responses-360.json` (stored), re-run through `selectTriplets`, `summarise` and `pooledCoverage`.

| Quantity | Value |
|---|---:|
| Session records | 46 |
| `status: completed` | 46 |
| `survey_version` | `panoramic_v1` for all 46 |
| Attention check administered | no |
| Participants retained | 46 (0 dropped) |
| Triplet responses | 552 (all retained; 0 dropped for any reason) |
| Triplets per participant | exactly 12 for all 46 |
| Rating responses (semantic differential) | 2972 |
| Sites used | 18, all active (see appearances below) |

**Participant descriptors** (n = 46):

| Field | Counts |
|---|---|
| `background` | yes 29; no 17 |
| `age_group` | 18–24: 8; 25–34: 26; 35–44: 12 |

**Timing:**

| Quantity | n | Min | Median | Mean | Max |
|---|---:|---:|---:|---:|---:|
| Session duration (min) | 46 | 1.9308833333333333 | 19.293458333333334 | 39.40345471014492 | 248.53018333333333 |
| Per-triplet `duration_ms` | 552 | 1751 | 15073.5 | 54277.59601449275 | 8385447 |

**Pair coverage** (552 triplets):

| Quantity | Value |
|---|---:|
| Pairs seen ≥ 1 time | 153 of 153 |
| Pairs seen ≥ 2 times | 153 |
| Co-occurrences per pair: min | 5 |
| median | 11 |
| mean | 10.823529411764707 |
| SD | 2.96940018544155 |
| max | 18 |

Distribution of pair counts ("count: number of pairs"): 5:5, 6:5, 7:14, 8:11, 9:16, 10:18, 11:23, 12:18, 13:17, 14:7, 15:8, 16:7, 17:1, 18:3.

Site appearances: Odeonsplatz 78, Bebelplatz 82, Hauptmarkt 82, Hauptwache 83, Burgplatz 85, Römerberg 86, Rathausmarkt 89, Herderplatz 90, Marienplatz 90, Konstablerwache 91, Naschmarkt 91, Augustusplatz 93, Alexanderplatz 98, Gendarmenmarkt 98, Marktplatz 99, Alter Markt 103, Zeil 104, Theaterplatz 114.

**Consistency (re-run):** an identical site trio was repeated within one participant 3 times in total. There are 408 distinct trios: shown once 292, twice 91, three times 22, four times 3. Repeat-trial agreement is `NOT RUN`. The noise ceiling that exists is the split-half reliability of the rating block (§3.8), not of the triplet task.

**Weights, confidence intervals, accuracy and baselines:** §3.

### 4.2 The 2-session 360° pilot

Source: `git show abc37b8^:src/data/pilot-360-responses.json`, where abc37b8^ is the last commit before the file's deletion.

| Participant | `survey_version` | Status | Answers | Background | Age | Stimulus |
|---|---|---|---:|---|---|---|
| 3b13e946… | `pilot_360_area_matched` | completed | 15 | no | 18–24 | equirectangular panorama, hfov 75°, pitch limit 12°, no zoom, no autorotate |
| 5427808f… | `pilot_360_area_matched` | in_progress | 2 | — | — | same |

17 distinct sites appear across the 17 responses. Pilot weights, accuracy and baselines: `NOT RUN`; there is no stored analysis of the pilot.

### 4.3 How the 120° static-photo survey and the 360° panoramic survey differ

| Respect | 120° static-photo survey | 360° panoramic survey | Source |
|---|---|---|---|
| Stimulus | Static image. The session record has no `stimulus` field; each site's `street_view_image` in `sites.json` is the photograph. | Equirectangular panorama. Stored per session: hfov 75°, pitch limit +12° / −9°, zoom disabled, autorotate off. | `survey-responses.json` (no field); `survey-responses-360.json` → `stimulus`; `src/lib/survey360.js:39-50` |
| Geometry layer paired with it | `perceptual_120` at the Street View camera position and heading | `perceptual_360` at a hand-placed panorama point, 0–69.03 m from the 120° vantage (§1.1) | `scripts/analyze.mjs:84-95`; `scripts/compute-360.mjs:8-18` |
| Task | Triplet choice only | Triplet choice, then 4 bipolar 1–7 ratings for each plaza the participant saw | data; `survey360.js:1-19, 149-177` |
| Items per participant | 27 = 26 genuine + 1 attention check (44 of 56 sessions answered all 27) | 12 triplets, no check | data |
| Triplet sampling | Pool from `buildBalancedPool`, seeded `hashString(participant_id)`; the check is spliced in near item 13. The 27-item sampler is still in the tree as `src/lib/triplets.js:111-149` but is no longer called. | Pool from `buildBalancedPool`, seeded `hashString("panoramic:" + participant_id)`; first 12 of the shuffled pool | `src/lib/survey360.js:117-136` |
| Attention check | Administered; 54 passed / 0 failed / 2 not reached | Not administered | data; `exclusions.js:50-56` |
| Site set | The same 18 active sites | The same 18 active sites | coverage re-runs §2.3, §4.1 |
| Collection window | 2026-08-06 → 2026-08-19 | 2026-08-22 → 2026-09-02 | data |
| Recruitment | `NOT FOUND` in code or data | `NOT FOUND` in code or data | — |
| Demographic options | `background` includes "undisclosed"; 12 records with no demographics | `background` yes/no only; all 46 filled | data |
| Storage | Separate archive Sheet; the file is read only by `--source=archive` and the tests | Live Sheet, synced by `npm run sync:survey` | `src/lib/surveyEndpoint.js:7-12` |
| Weight fit | `NOT RUN` | §3 | — |

### 4.4 "Independent replication referred to in project notes"

`NOT FOUND`. Searched `docs/*.md`, `README.md`, `PRODUCT.md`, `prompt.md`, `src/`, `scripts/`, `test/`, `google-apps-script/`, and the auto-memory directory for `replicat`, `independent check`, `independent test` and `independent validation` (case-insensitive).

The only hit that fits is `docs/spec.md:208`, which calls the rating block "an independent validation". Its results are in §3.8: same participants, a different task, and it never enters the weights. No committed data describes a replication on a second sample. Two things exist that a reader might confuse with one:

- the n = 30 subset fit (§3.7), which is the same sample at an earlier point and does not reproduce;
- the P8 matched-view survey (§7), which is a different participant cohort and a different task.

---

## 5. Zone typology (P6, `field_360`)

Source: `src/data/zones.json` and `src/data/fields/*.json` (stored; zones `generated_at` 2026-09-06T00:30:27.887Z).

- k = 5, seed 20260904, 20 restarts, total points n = 11719.
- Weighted by the normalised P5 weights (§3.1).
- Inertia 366.5841. Unweighted agreement 0.9605.

The breakdown per plaza was re-run from each field file's `zones` array. Re-assigning every stored point to its nearest frozen centre reproduces the stored zone for all 11719 points (0 mismatches at every site).

### 5.1 Global zone centres

Normalised values use `perceptual_360` bounds and are stored to 5 dp. Raw values are denormalised (re-run) with `fields/index.json` → `bounds`.

| Zone | Name (from `describeZone`) | Points | Share of 11719 | n area | n compactness | n occlusivity | n enclosure | Area m² | Compactness | Occlusivity m | Enclosure |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | Open, facade-rich | 4879 | 0.4163 | 0.49851 | 0.43447 | 0.81716 | 0.30783 | 25217.4501756 | 0.120476067 | 557.8919836 | 0.19652193 |
| 1 | Open, regular | 1671 | 0.1426 | 0.45388 | 1.02019 | 0.43921 | 0.53569 | 23309.4480528 | 0.206049759 | 423.4513891 | 0.25827199 |
| 2 | Tight, strongly enclosed | 2158 | 0.1841 | 0.15241 | 0.5632 | 0.25173 | 0.95204 | 10421.1352596 | 0.13928352 | 356.7628783 | 0.37110284 |
| 3 | Tight, irregular | 2146 | 0.1831 | 0.15653 | 0.21098 | 0.26252 | 0.49857 | 10597.2716868 | 0.087824178 | 360.6009892 | 0.24821247 |
| 4 | Vast, regular | 865 | 0.0738 | 1.16056 | 1.07255 | 0.17479 | 0.11272 | 53521.1204736 | 0.213699555 | 329.3945509 | 0.14364712 |

Shares are rounded to 4 dp. The exact value is points ÷ 11719.

### 5.2 Per plaza: number of zones and zone sizes (points)

"Zones present" counts zones with ≥ 1 point. "≥ 5%" counts zones holding at least 5% of that plaza's points, which is the presence threshold used by k selection (`ZONE_PRESENCE_SHARE` in `compute-zones.mjs`).

| Plaza | n points | Z0 | Z1 | Z2 | Z3 | Z4 | Zones present | Zones ≥ 5% | Dominant zone (share) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Gendarmenmarkt | 862 | 862 | 0 | 0 | 0 | 0 | 1 | 1 | Z0 (1) |
| Hauptwache | 1224 | 987 | 22 | 75 | 140 | 0 | 4 | 3 | Z0 (0.8063725490196079) |
| Römerberg | 560 | 0 | 72 | 227 | 261 | 0 | 3 | 3 | Z3 (0.4660714285714286) |
| Zeil | 307 | 0 | 0 | 282 | 25 | 0 | 2 | 2 | Z2 (0.9185667752442996) |
| Bebelplatz | 940 | 38 | 577 | 0 | 0 | 325 | 3 | 2 | Z1 (0.6138297872340426) |
| Alexanderplatz | 1032 | 197 | 761 | 74 | 0 | 0 | 3 | 3 | Z1 (0.7374031007751938) |
| Marienplatz | 562 | 0 | 0 | 497 | 65 | 0 | 2 | 2 | Z2 (0.8843416370106761) |
| Odeonsplatz | 418 | 141 | 12 | 202 | 63 | 0 | 4 | 3 | Z2 (0.48325358851674644) |
| Konstablerwache | 967 | 658 | 3 | 98 | 208 | 0 | 4 | 3 | Z0 (0.6804550155118925) |
| Alter Markt | 660 | 0 | 0 | 136 | 524 | 0 | 2 | 2 | Z3 (0.793939393939394) |
| Rathausmarkt | 1006 | 853 | 61 | 92 | 0 | 0 | 3 | 3 | Z0 (0.8479125248508946) |
| Naschmarkt | 190 | 0 | 0 | 189 | 1 | 0 | 2 | 1 | Z2 (0.9947368421052631) |
| Burgplatz | 817 | 147 | 103 | 9 | 18 | 540 | 5 | 3 | Z4 (0.6609547123623011) |
| Marktplatz | 256 | 0 | 38 | 167 | 51 | 0 | 3 | 3 | Z2 (0.65234375) |
| Augustusplatz | 1026 | 996 | 22 | 7 | 1 | 0 | 4 | 1 | Z0 (0.9707602339181286) |
| Hauptmarkt | 340 | 0 | 0 | 58 | 282 | 0 | 2 | 2 | Z3 (0.8294117647058824) |
| Herderplatz | 204 | 0 | 0 | 17 | 187 | 0 | 2 | 2 | Z3 (0.9166666666666666) |
| Theaterplatz | 348 | 0 | 0 | 28 | 320 | 0 | 2 | 2 | Z3 (0.9195402298850575) |

The mean number of zones ≥ 5% per plaza is 2.2777777777777777 (41/18). Plazas where one zone holds more than 90% of points: Gendarmenmarkt, Zeil, Naschmarkt, Augustusplatz, Herderplatz, Theaterplatz, i.e. 6 of 18.

**Centroids per plaza.** For every plaza × zone cell with at least one point, the mean normalised vector and mean raw metrics are in `02_data/p6_zone_means_per_plaza.csv` (re-run). The global centres in §5.1 are the cluster centroids the typology is defined by.

### 5.3 Diagnostics used to choose k

**Stored.** `zones.json` → `k_selection`, written 2026-09-13T11:41:19.022Z by `npm run zones -- --diagnostics-only`. That mode recomputes the table on the current field files and weights and adds it to the existing `zones.json` **without refitting**: the typology's `generated_at` (2026-09-06T00:30:27.887Z), centres, counts and assignments are unchanged.

- Grid: 11719 points.
- Seed 20260904; 10 restarts per k.
- Silhouette is the mean over a seeded 2500-point sample.
- Inertia is the sum of weighted squared distances.
- A plaza counts as single-zone when one zone holds > 90% of its points. A zone counts towards zones per plaza when it holds ≥ 5% of the plaza's points.

The same table is shown on the P6 page under "Methods & robustness" (`KSelection` in `src/pages/FieldPage.jsx`).

| k | Inertia | Mean silhouette | Single-zone plazas (of 18) | Zones per plaza |
|---:|---:|---:|---:|---:|
| 2 | 820.8729549795393 | 0.30155324909537123 | 13 | 1.2777777777777777 |
| 3 | 547.842655492808 | **0.372453435077524** (peak) | 12 | 1.5555555555555556 |
| 4 | 437.717115237389 | 0.3714579591822845 | 8 | 1.7222222222222223 |
| **5** (in use) | 366.5841428223902 | 0.3456763149341283 | 6 | 2.2777777777777777 |
| 6 | 314.80283031036737 | 0.305481146756159 | 5 | 2.3333333333333335 |
| 7 | 280.92394296312136 | 0.3265128358602686 | 5 | 2.2222222222222223 |
| 8 | 258.36403379391516 | 0.3110305557777339 | 2 | 2.2777777777777777 |
| 9 | 235.57021953918556 | 0.30110351793250295 | 2 | 2.6666666666666665 |
| 10 | 219.31050942833275 | 0.3056930293323444 | 2 | 2.8333333333333335 |
| 11 | 203.8834266075286 | 0.3008098982827805 | 2 | 2.7777777777777777 |
| 12 | 191.77916750292175 | 0.28894029298431967 | 1 | 2.7777777777777777 |

These values equal the earlier `--dry` re-run at its printed precision. The k = 5 inertia, 366.5841428223902, rounds to the stored typology inertia of 366.5841.

**Applying the coded rule to these values** (`ruleChoice`, `compute-zones.mjs:285-295`):

- The rule keeps the smallest k with silhouette ≥ peak − 0.04 (≥ 0.332453435077524), ≥ 2 zones per plaza, and ≤ 5 single-zone plazas.
- Silhouette passes at k = 3, 4 and 5. Zones per plaza passes only at k = 5 among those. Single-zone plazas pass only at k ≥ 6. **No k satisfies all three.**
- Stored outcome: `rule_fell_back: true`, `rule_choice: 3`, `peak_k: 3`, `chosen_k: 5`, `chosen_by: "existing zones.json"`.
- In a separate `--dry` re-run with automatic selection, the fallback k = 3 fit gave 4317 / 5628 / 1774 points and unweighted agreement 98.0%.

**Among the three k inside the silhouette tolerance** (from the table above):

| k | Zones per plaza | Single-zone plazas |
|---:|---:|---:|
| 3 | 1.5555555555555556 | 12 |
| 4 | 1.7222222222222223 | 8 |
| 5 | 2.2777777777777777 (highest) | 6 (fewest) |

At k = 5 the plazas over the 90% line are Gendarmenmarkt (1), Naschmarkt (0.9947368421052631), Augustusplatz (0.9707602339181286), Theaterplatz (0.9195402298850575), Zeil (0.9185667752442996) and Herderplatz (0.9166666666666666). See §5.2.

**Re-run at k = 5** (`node scripts/compute-zones.mjs --k=5 --dry`, 20 restarts) reproduces the stored typology:

- zone counts 4879 / 1671 / 2158 / 2146 / 865, identical to stored;
- centres match stored values to the 3 dp printed;
- unweighted agreement 96.0%.

So the k = 5 in use is not the k the coded selection rule produces on the current data.

---

## 6. Plaza-level comparison (P7, `perceptual_120`)

Source: re-run. The P7 page computes these live and does not store them. The calls were `buildClouds` on `src/data/results.json` plus `src/data/view-clouds.json` (126 placed markers, `updated_at` 2026-09-06T09:34:40.022Z), then `cloudDistanceMatrix` from `src/lib/analysis/clouds.js`.

- **Clouds:** 18 clouds of 8 views each = 144 views. Each cloud is the canonical 120° reading plus 7 placed markers.
- **Out of range:** 86 of the 144 views have at least one normalised component outside [0, 1].
- **Weights:** normalised P5 weights (§3.1).

### 6.1 Distance matrices

Each matrix is 18 × 18, symmetric, with a zero diagonal, giving n = 153 off-diagonal pairs. Tables are rounded to 4 dp for width; full precision is in the CSVs.

| Matrix | Full precision |
|---|---|
| Centroid | `02_data/p7_centroid_weighted.csv` |
| Gaussian 2-Wasserstein | `02_data/p7_gaussian_weighted.csv` |
| Chamfer | `02_data/p7_chamfer_weighted.csv` |
| Canonical single point | `02_data/p7_canonical_single_point_weighted.csv` |
| Equal-weight versions | `02_data/p7_*_unweighted.csv` |

Column key: Gen Gendarmenmarkt, Hwa Hauptwache, Röm Römerberg, Zei Zeil, Beb Bebelplatz, Ale Alexanderplatz, Mar Marienplatz, Ode Odeonsplatz, Kon Konstablerwache, AlM Alter Markt, Rat Rathausmarkt, Nas Naschmarkt, Bur Burgplatz, MaH Marktplatz (Heidelberg), Aug Augustusplatz, Hau Hauptmarkt, Her Herderplatz, The Theaterplatz.

#### Centroid (weighted)

| | Gen | Hwa | Röm | Zei | Beb | Ale | Mar | Ode | Kon | AlM | Rat | Nas | Bur | MaH | Aug | Hau | Her | The |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Gen** | — | 0.1993 | 0.5717 | 0.4100 | 0.2954 | 0.3595 | 0.5069 | 0.2445 | 0.3539 | 0.4859 | 0.1727 | 0.6344 | 0.3024 | 0.6923 | 0.1314 | 0.4645 | 0.4982 | 0.4903 |
| **Hwa** | 0.1993 | — | 0.4358 | 0.3135 | 0.3664 | 0.2790 | 0.3941 | 0.1617 | 0.1867 | 0.3325 | 0.0651 | 0.5167 | 0.2657 | 0.5664 | 0.1138 | 0.3499 | 0.3280 | 0.3154 |
| **Röm** | 0.5717 | 0.4358 | — | 0.2240 | 0.5745 | 0.3187 | 0.2255 | 0.3640 | 0.2707 | 0.1430 | 0.4314 | 0.2252 | 0.3874 | 0.1709 | 0.5007 | 0.1301 | 0.1980 | 0.2316 |
| **Zei** | 0.4100 | 0.3135 | 0.2240 | — | 0.4903 | 0.2218 | 0.1131 | 0.1850 | 0.2038 | 0.1928 | 0.2949 | 0.2276 | 0.3442 | 0.2979 | 0.3795 | 0.1892 | 0.2565 | 0.2817 |
| **Beb** | 0.2954 | 0.3664 | 0.5745 | 0.4903 | — | 0.3491 | 0.5974 | 0.4124 | 0.4613 | 0.5480 | 0.3214 | 0.6974 | 0.2334 | 0.6941 | 0.2723 | 0.4603 | 0.5695 | 0.5664 |
| **Ale** | 0.3595 | 0.2790 | 0.3187 | 0.2218 | 0.3491 | — | 0.2949 | 0.2507 | 0.2697 | 0.3147 | 0.2330 | 0.3867 | 0.2858 | 0.3973 | 0.3019 | 0.2623 | 0.3547 | 0.3673 |
| **Mar** | 0.5069 | 0.3941 | 0.2255 | 0.1131 | 0.5974 | 0.2949 | — | 0.2719 | 0.2657 | 0.2144 | 0.3833 | 0.1313 | 0.4498 | 0.2431 | 0.4746 | 0.2529 | 0.2745 | 0.3049 |
| **Ode** | 0.2445 | 0.1617 | 0.3640 | 0.1850 | 0.4124 | 0.2507 | 0.2719 | — | 0.1627 | 0.2704 | 0.1513 | 0.4000 | 0.2870 | 0.4740 | 0.2284 | 0.2829 | 0.2972 | 0.3009 |
| **Kon** | 0.3539 | 0.1867 | 0.2707 | 0.2038 | 0.4613 | 0.2697 | 0.2657 | 0.1627 | — | 0.1485 | 0.2095 | 0.3694 | 0.2770 | 0.4109 | 0.2774 | 0.2078 | 0.1472 | 0.1438 |
| **AlM** | 0.4859 | 0.3325 | 0.1430 | 0.1928 | 0.5480 | 0.3147 | 0.2144 | 0.2704 | 0.1485 | — | 0.3447 | 0.2718 | 0.3439 | 0.2882 | 0.4137 | 0.1396 | 0.0748 | 0.1086 |
| **Rat** | 0.1727 | 0.0651 | 0.4314 | 0.2949 | 0.3214 | 0.2330 | 0.3833 | 0.1513 | 0.2095 | 0.3447 | — | 0.5069 | 0.2461 | 0.5541 | 0.0983 | 0.3410 | 0.3528 | 0.3457 |
| **Nas** | 0.6344 | 0.5167 | 0.2252 | 0.2276 | 0.6974 | 0.3867 | 0.1313 | 0.4000 | 0.3694 | 0.2718 | 0.5069 | — | 0.5426 | 0.1546 | 0.5965 | 0.3055 | 0.3303 | 0.3655 |
| **Bur** | 0.3024 | 0.2657 | 0.3874 | 0.3442 | 0.2334 | 0.2858 | 0.4498 | 0.2870 | 0.2770 | 0.3439 | 0.2461 | 0.5426 | — | 0.5357 | 0.2313 | 0.2630 | 0.3603 | 0.3567 |
| **MaH** | 0.6923 | 0.5664 | 0.1709 | 0.2979 | 0.6941 | 0.3973 | 0.2431 | 0.4740 | 0.4109 | 0.2882 | 0.5541 | 0.1546 | 0.5357 | — | 0.6345 | 0.2840 | 0.3428 | 0.3783 |
| **Aug** | 0.1314 | 0.1138 | 0.5007 | 0.3795 | 0.2723 | 0.3019 | 0.4746 | 0.2284 | 0.2774 | 0.4137 | 0.0983 | 0.5965 | 0.2313 | 0.6345 | — | 0.3974 | 0.4148 | 0.4025 |
| **Hau** | 0.4645 | 0.3499 | 0.1301 | 0.1892 | 0.4603 | 0.2623 | 0.2529 | 0.2829 | 0.2078 | 0.1396 | 0.3410 | 0.3055 | 0.2630 | 0.2840 | 0.3974 | — | 0.1952 | 0.2187 |
| **Her** | 0.4982 | 0.3280 | 0.1980 | 0.2565 | 0.5695 | 0.3547 | 0.2745 | 0.2972 | 0.1472 | 0.0748 | 0.3528 | 0.3303 | 0.3603 | 0.3428 | 0.4148 | 0.1952 | — | 0.0370 |
| **The** | 0.4903 | 0.3154 | 0.2316 | 0.2817 | 0.5664 | 0.3673 | 0.3049 | 0.3009 | 0.1438 | 0.1086 | 0.3457 | 0.3655 | 0.3567 | 0.3783 | 0.4025 | 0.2187 | 0.0370 | — |

#### Gaussian 2-Wasserstein (weighted)

| | Gen | Hwa | Röm | Zei | Beb | Ale | Mar | Ode | Kon | AlM | Rat | Nas | Bur | MaH | Aug | Hau | Her | The |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Gen** | — | 0.2539 | 0.5936 | 0.4308 | 0.5010 | 0.4414 | 0.5476 | 0.3367 | 0.4175 | 0.5299 | 0.2710 | 0.6837 | 0.4137 | 0.7542 | 0.2627 | 0.5168 | 0.5601 | 0.5353 |
| **Hwa** | 0.2539 | — | 0.4487 | 0.3283 | 0.6161 | 0.3850 | 0.4082 | 0.3098 | 0.2419 | 0.3533 | 0.1489 | 0.5422 | 0.4213 | 0.6021 | 0.2412 | 0.3734 | 0.3581 | 0.3398 |
| **Röm** | 0.5936 | 0.4487 | — | 0.2372 | 0.7459 | 0.4208 | 0.2636 | 0.4316 | 0.3251 | 0.1954 | 0.4524 | 0.2852 | 0.4774 | 0.2652 | 0.5542 | 0.1841 | 0.2586 | 0.2816 |
| **Zei** | 0.4308 | 0.3283 | 0.2372 | — | 0.6730 | 0.3264 | 0.1730 | 0.2851 | 0.2545 | 0.2416 | 0.3299 | 0.2934 | 0.4487 | 0.3678 | 0.4347 | 0.2414 | 0.3174 | 0.3229 |
| **Beb** | 0.5010 | 0.6161 | 0.7459 | 0.6730 | — | 0.5751 | 0.8246 | 0.6549 | 0.7006 | 0.7977 | 0.6217 | 0.9215 | 0.3340 | 0.9199 | 0.5212 | 0.7134 | 0.8250 | 0.8202 |
| **Ale** | 0.4414 | 0.3850 | 0.4208 | 0.3264 | 0.5751 | — | 0.3861 | 0.3344 | 0.3280 | 0.4215 | 0.3325 | 0.4853 | 0.4606 | 0.5026 | 0.3230 | 0.4159 | 0.4806 | 0.4641 |
| **Mar** | 0.5476 | 0.4082 | 0.2636 | 0.1730 | 0.8246 | 0.3861 | — | 0.3583 | 0.2990 | 0.2240 | 0.3986 | 0.1628 | 0.5963 | 0.2946 | 0.5219 | 0.2828 | 0.2942 | 0.3094 |
| **Ode** | 0.3367 | 0.3098 | 0.4316 | 0.2851 | 0.6549 | 0.3344 | 0.3583 | — | 0.2707 | 0.3707 | 0.2740 | 0.4796 | 0.4777 | 0.5937 | 0.3057 | 0.4277 | 0.4199 | 0.3828 |
| **Kon** | 0.4175 | 0.2419 | 0.3251 | 0.2545 | 0.7006 | 0.3280 | 0.2990 | 0.2707 | — | 0.2274 | 0.2353 | 0.4162 | 0.4640 | 0.4794 | 0.3112 | 0.3033 | 0.2763 | 0.2182 |
| **AlM** | 0.5299 | 0.3533 | 0.1954 | 0.2416 | 0.7977 | 0.4215 | 0.2240 | 0.3707 | 0.2274 | — | 0.3762 | 0.3016 | 0.5306 | 0.3284 | 0.4862 | 0.1817 | 0.1306 | 0.1324 |
| **Rat** | 0.2710 | 0.1489 | 0.4524 | 0.3299 | 0.6217 | 0.3325 | 0.3986 | 0.2740 | 0.2353 | 0.3762 | — | 0.5222 | 0.4233 | 0.5979 | 0.2062 | 0.3882 | 0.3974 | 0.3682 |
| **Nas** | 0.6837 | 0.5422 | 0.2852 | 0.2934 | 0.9215 | 0.4853 | 0.1628 | 0.4796 | 0.4162 | 0.3016 | 0.5222 | — | 0.6809 | 0.2233 | 0.6516 | 0.3486 | 0.3457 | 0.3822 |
| **Bur** | 0.4137 | 0.4213 | 0.4774 | 0.4487 | 0.3340 | 0.4606 | 0.5963 | 0.4777 | 0.4640 | 0.5306 | 0.4233 | 0.6809 | — | 0.6739 | 0.4045 | 0.4361 | 0.5467 | 0.5498 |
| **MaH** | 0.7542 | 0.6021 | 0.2652 | 0.3678 | 0.9199 | 0.5026 | 0.2946 | 0.5937 | 0.4794 | 0.3284 | 0.5979 | 0.2233 | 0.6739 | — | 0.7086 | 0.3208 | 0.3694 | 0.4282 |
| **Aug** | 0.2627 | 0.2412 | 0.5542 | 0.4347 | 0.5212 | 0.3230 | 0.5219 | 0.3057 | 0.3112 | 0.4862 | 0.2062 | 0.6516 | 0.4045 | 0.7086 | — | 0.4978 | 0.5063 | 0.4700 |
| **Hau** | 0.5168 | 0.3734 | 0.1841 | 0.2414 | 0.7134 | 0.4159 | 0.2828 | 0.4277 | 0.3033 | 0.1817 | 0.3882 | 0.3486 | 0.4361 | 0.3208 | 0.4978 | — | 0.2287 | 0.2583 |
| **Her** | 0.5601 | 0.3581 | 0.2586 | 0.3174 | 0.8250 | 0.4806 | 0.2942 | 0.4199 | 0.2763 | 0.1306 | 0.3974 | 0.3457 | 0.5467 | 0.3694 | 0.5063 | 0.2287 | — | 0.1164 |
| **The** | 0.5353 | 0.3398 | 0.2816 | 0.3229 | 0.8202 | 0.4641 | 0.3094 | 0.3828 | 0.2182 | 0.1324 | 0.3682 | 0.3822 | 0.5498 | 0.4282 | 0.4700 | 0.2583 | 0.1164 | — |

#### Chamfer (weighted)

| | Gen | Hwa | Röm | Zei | Beb | Ale | Mar | Ode | Kon | AlM | Rat | Nas | Bur | MaH | Aug | Hau | Her | The |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Gen** | — | 0.1867 | 0.4482 | 0.2716 | 0.3172 | 0.2915 | 0.3071 | 0.2263 | 0.2792 | 0.3849 | 0.2239 | 0.4507 | 0.2933 | 0.5414 | 0.2152 | 0.3937 | 0.4140 | 0.4006 |
| **Hwa** | 0.1867 | — | 0.2943 | 0.2230 | 0.3042 | 0.2883 | 0.2349 | 0.2018 | 0.1667 | 0.2134 | 0.1401 | 0.3353 | 0.2645 | 0.4087 | 0.1722 | 0.2735 | 0.2347 | 0.2239 |
| **Röm** | 0.4482 | 0.2943 | — | 0.2552 | 0.3872 | 0.3411 | 0.2510 | 0.3565 | 0.1642 | 0.1291 | 0.2846 | 0.2230 | 0.1975 | 0.1743 | 0.3302 | 0.1795 | 0.1681 | 0.1343 |
| **Zei** | 0.2716 | 0.2230 | 0.2552 | — | 0.3714 | 0.2819 | 0.1521 | 0.2243 | 0.2573 | 0.2265 | 0.2077 | 0.2135 | 0.3202 | 0.2343 | 0.2794 | 0.2331 | 0.2724 | 0.2811 |
| **Beb** | 0.3172 | 0.3042 | 0.3872 | 0.3714 | — | 0.3489 | 0.4264 | 0.4170 | 0.3783 | 0.3834 | 0.3192 | 0.5161 | 0.2751 | 0.5312 | 0.3244 | 0.3748 | 0.3943 | 0.4089 |
| **Ale** | 0.2915 | 0.2883 | 0.3411 | 0.2819 | 0.3489 | — | 0.2995 | 0.2742 | 0.2885 | 0.3127 | 0.2792 | 0.3169 | 0.3301 | 0.3171 | 0.2266 | 0.3320 | 0.3978 | 0.3870 |
| **Mar** | 0.3071 | 0.2349 | 0.2510 | 0.1521 | 0.4264 | 0.2995 | — | 0.2125 | 0.2381 | 0.1816 | 0.2452 | 0.1286 | 0.3512 | 0.2162 | 0.2831 | 0.2432 | 0.2458 | 0.2415 |
| **Ode** | 0.2263 | 0.2018 | 0.3565 | 0.2243 | 0.4170 | 0.2742 | 0.2125 | — | 0.2184 | 0.2790 | 0.2211 | 0.2920 | 0.3271 | 0.3809 | 0.2123 | 0.3448 | 0.3355 | 0.3339 |
| **Kon** | 0.2792 | 0.1667 | 0.1642 | 0.2573 | 0.3783 | 0.2885 | 0.2381 | 0.2184 | — | 0.1240 | 0.1696 | 0.2598 | 0.2337 | 0.2505 | 0.2070 | 0.2173 | 0.1828 | 0.1531 |
| **AlM** | 0.3849 | 0.2134 | 0.1291 | 0.2265 | 0.3834 | 0.3127 | 0.1816 | 0.2790 | 0.1240 | — | 0.2213 | 0.1841 | 0.2333 | 0.1813 | 0.2775 | 0.1505 | 0.1203 | 0.1194 |
| **Rat** | 0.2239 | 0.1401 | 0.2846 | 0.2077 | 0.3192 | 0.2792 | 0.2452 | 0.2211 | 0.1696 | 0.2213 | — | 0.3305 | 0.3011 | 0.3850 | 0.1802 | 0.2516 | 0.2549 | 0.2488 |
| **Nas** | 0.4507 | 0.3353 | 0.2230 | 0.2135 | 0.5161 | 0.3169 | 0.1286 | 0.2920 | 0.2598 | 0.1841 | 0.3305 | — | 0.3850 | 0.1832 | 0.3505 | 0.2977 | 0.2606 | 0.2635 |
| **Bur** | 0.2933 | 0.2645 | 0.1975 | 0.3202 | 0.2751 | 0.3301 | 0.3512 | 0.3271 | 0.2337 | 0.2333 | 0.3011 | 0.3850 | — | 0.3555 | 0.3034 | 0.2756 | 0.2662 | 0.2484 |
| **MaH** | 0.5414 | 0.4087 | 0.1743 | 0.2343 | 0.5312 | 0.3171 | 0.2162 | 0.3809 | 0.2505 | 0.1813 | 0.3850 | 0.1832 | 0.3555 | — | 0.4177 | 0.2512 | 0.2408 | 0.2452 |
| **Aug** | 0.2152 | 0.1722 | 0.3302 | 0.2794 | 0.3244 | 0.2266 | 0.2831 | 0.2123 | 0.2070 | 0.2775 | 0.1802 | 0.3505 | 0.3034 | 0.4177 | — | 0.3138 | 0.2932 | 0.3045 |
| **Hau** | 0.3937 | 0.2735 | 0.1795 | 0.2331 | 0.3748 | 0.3320 | 0.2432 | 0.3448 | 0.2173 | 0.1505 | 0.2516 | 0.2977 | 0.2756 | 0.2512 | 0.3138 | — | 0.1829 | 0.1993 |
| **Her** | 0.4140 | 0.2347 | 0.1681 | 0.2724 | 0.3943 | 0.3978 | 0.2458 | 0.3355 | 0.1828 | 0.1203 | 0.2549 | 0.2606 | 0.2662 | 0.2408 | 0.2932 | 0.1829 | — | 0.1135 |
| **The** | 0.4006 | 0.2239 | 0.1343 | 0.2811 | 0.4089 | 0.3870 | 0.2415 | 0.3339 | 0.1531 | 0.1194 | 0.2488 | 0.2635 | 0.2484 | 0.2452 | 0.3045 | 0.1993 | 0.1135 | — |

#### Canonical single point (one 120° reading per plaza, weighted Euclidean)

| | Gen | Hwa | Röm | Zei | Beb | Ale | Mar | Ode | Kon | AlM | Rat | Nas | Bur | MaH | Aug | Hau | Her | The |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Gen** | — | 0.2035 | 0.5781 | 0.4949 | 0.3748 | 0.4371 | 0.5474 | 0.4254 | 0.2040 | 0.5101 | 0.4995 | 0.7382 | 0.2682 | 0.8898 | 0.2908 | 0.5567 | 0.5668 | 0.5316 |
| **Hwa** | 0.2035 | — | 0.4318 | 0.2918 | 0.2112 | 0.2902 | 0.3528 | 0.3011 | 0.1254 | 0.3605 | 0.3230 | 0.5551 | 0.2037 | 0.7015 | 0.1207 | 0.3922 | 0.4054 | 0.3940 |
| **Röm** | 0.5781 | 0.4318 | — | 0.3289 | 0.4354 | 0.5113 | 0.3640 | 0.4994 | 0.3968 | 0.0982 | 0.5283 | 0.3250 | 0.3744 | 0.4910 | 0.3532 | 0.1799 | 0.1012 | 0.1825 |
| **Zei** | 0.4949 | 0.2918 | 0.3289 | — | 0.2399 | 0.2915 | 0.1215 | 0.3268 | 0.3471 | 0.2789 | 0.2201 | 0.3189 | 0.3679 | 0.4572 | 0.2382 | 0.2518 | 0.2733 | 0.3266 |
| **Beb** | 0.3748 | 0.2112 | 0.4354 | 0.2399 | — | 0.0941 | 0.3262 | 0.2776 | 0.2549 | 0.3802 | 0.2466 | 0.5401 | 0.3737 | 0.5773 | 0.1955 | 0.4322 | 0.3886 | 0.4014 |
| **Ale** | 0.4371 | 0.2902 | 0.5113 | 0.2915 | 0.0941 | — | 0.3667 | 0.2923 | 0.3350 | 0.4580 | 0.2537 | 0.5887 | 0.4649 | 0.5923 | 0.2763 | 0.5086 | 0.4564 | 0.4686 |
| **Mar** | 0.5474 | 0.3528 | 0.3640 | 0.1215 | 0.3262 | 0.3667 | — | 0.3081 | 0.3972 | 0.3017 | 0.2920 | 0.2577 | 0.4256 | 0.5114 | 0.2823 | 0.2584 | 0.2906 | 0.3237 |
| **Ode** | 0.4254 | 0.3011 | 0.4994 | 0.3268 | 0.2776 | 0.2923 | 0.3081 | — | 0.2959 | 0.4099 | 0.4005 | 0.5198 | 0.4616 | 0.7323 | 0.2260 | 0.4696 | 0.4179 | 0.3675 |
| **Kon** | 0.2040 | 0.1254 | 0.3968 | 0.3471 | 0.2549 | 0.3350 | 0.3972 | 0.2959 | — | 0.3223 | 0.4267 | 0.5687 | 0.2159 | 0.7351 | 0.1172 | 0.3988 | 0.3728 | 0.3337 |
| **AlM** | 0.5101 | 0.3605 | 0.0982 | 0.2789 | 0.3802 | 0.4580 | 0.3017 | 0.4099 | 0.3223 | — | 0.4829 | 0.3132 | 0.3265 | 0.5370 | 0.2708 | 0.1590 | 0.0746 | 0.1125 |
| **Rat** | 0.4995 | 0.3230 | 0.5283 | 0.2201 | 0.2466 | 0.2537 | 0.2920 | 0.4005 | 0.4267 | 0.4829 | — | 0.5130 | 0.4477 | 0.5339 | 0.3411 | 0.4491 | 0.4850 | 0.5315 |
| **Nas** | 0.7382 | 0.5551 | 0.3250 | 0.3189 | 0.5401 | 0.5887 | 0.2577 | 0.5198 | 0.5687 | 0.3132 | 0.5130 | — | 0.5471 | 0.4700 | 0.4721 | 0.2290 | 0.2778 | 0.3402 |
| **Bur** | 0.2682 | 0.2037 | 0.3744 | 0.3679 | 0.3737 | 0.4649 | 0.4256 | 0.4616 | 0.2159 | 0.3265 | 0.4477 | 0.5471 | — | 0.7198 | 0.2459 | 0.3327 | 0.3926 | 0.3935 |
| **MaH** | 0.8898 | 0.7015 | 0.4910 | 0.4572 | 0.5773 | 0.5923 | 0.5114 | 0.7323 | 0.7351 | 0.5370 | 0.5339 | 0.4700 | 0.7198 | — | 0.6524 | 0.5071 | 0.4858 | 0.5954 |
| **Aug** | 0.2908 | 0.1207 | 0.3532 | 0.2382 | 0.1955 | 0.2763 | 0.2823 | 0.2260 | 0.1172 | 0.2708 | 0.3411 | 0.4721 | 0.2459 | 0.6524 | — | 0.3290 | 0.3082 | 0.2844 |
| **Hau** | 0.5567 | 0.3922 | 0.1799 | 0.2518 | 0.4322 | 0.5086 | 0.2584 | 0.4696 | 0.3988 | 0.1590 | 0.4491 | 0.2290 | 0.3327 | 0.5071 | 0.3290 | — | 0.1794 | 0.2472 |
| **Her** | 0.5668 | 0.4054 | 0.1012 | 0.2733 | 0.3886 | 0.4564 | 0.2906 | 0.4179 | 0.3728 | 0.0746 | 0.4850 | 0.2778 | 0.3926 | 0.4858 | 0.3082 | 0.1794 | — | 0.1177 |
| **The** | 0.5316 | 0.3940 | 0.1825 | 0.3266 | 0.4014 | 0.4686 | 0.3237 | 0.3675 | 0.3337 | 0.1125 | 0.5315 | 0.3402 | 0.3935 | 0.5954 | 0.2844 | 0.2472 | 0.1177 | — |

**Summary of off-diagonal distances** (n = 153 per row):

| Measure | Min | Median | Mean | Max |
|---|---:|---:|---:|---:|
| Centroid | 0.03704047550618724 | 0.3023815320995524 | 0.3259475976907425 | 0.6974149531314675 |
| Gaussian | 0.11638553152312599 | 0.38823049780477614 | 0.41578665850904034 | 0.9214913458978049 |
| Chamfer | 0.11353855931217077 | 0.2716205384014776 | 0.27540553398370937 | 0.5413718621892155 |
| Canonical single point | 0.07464633785931218 | 0.366740872155876 | 0.3758340652739143 | 0.8898398331627569 |

**Nearest plaza under Chamfer** (re-run):

| Plaza | Nearest (distance) |
|---|---|
| Gendarmenmarkt | Hauptwache (0.18668116991957087) |
| Hauptwache | Rathausmarkt (0.1400948939699414) |
| Römerberg | Alter Markt (0.12907964529450347) |
| Zeil | Marienplatz (0.15214979447748372) |
| Bebelplatz | Burgplatz (0.27511442384125) |
| Alexanderplatz | Augustusplatz (0.22662594137776057) |
| Marienplatz | Naschmarkt (0.1286314127377018) |
| Odeonsplatz | Hauptwache (0.20175109516431894) |
| Konstablerwache | Alter Markt (0.12395241052772013) |
| Alter Markt | Theaterplatz (0.1193580139627285) |
| Rathausmarkt | Hauptwache (0.1400948939699414) |
| Naschmarkt | Marienplatz (0.1286314127377018) |
| Burgplatz | Römerberg (0.19748947780016995) |
| Marktplatz | Römerberg (0.1742507101247651) |
| Augustusplatz | Hauptwache (0.17218978896729453) |
| Hauptmarkt | Alter Markt (0.15052575920895322) |
| Herderplatz | Theaterplatz (0.11353855931217077) |
| Theaterplatz | Herderplatz (0.11353855931217077) |

### 6.2 Agreement between methods

Source: re-run over the 153 off-diagonal pairs of each matrix. These pairs share plazas, so they are not independent observations (see methods doc §7); r and ρ are reported as descriptive effect sizes with no p-value.

**Between measures (weighted):**

| Pair of measures | Spearman ρ (`rankAgreement`) | Pearson r |
|---|---:|---:|
| Centroid – Gaussian | 0.9173736480238028 | 0.918386229783361 |
| Centroid – Chamfer | 0.7994618900191656 | 0.8524958530410938 |
| Gaussian – Chamfer | 0.874606301850884 | 0.8832010563989566 |

**Weighted vs equal weights (0.25 each), same measure** (the transfer-assumption robustness check):

| Measure | Spearman ρ |
|---|---:|
| Centroid | 0.991811078498385 |
| Gaussian | 0.9941866698832643 |
| Chamfer | 0.9947931325640303 |

**Cloud measure vs canonical single-point distance:**

| Measure | Pearson r | R² | Spearman ρ | n pairs |
|---|---:|---:|---:|---:|
| Centroid | 0.6060221830760725 | 0.3672628863802887 | 0.5456287778269202 | 153 |
| Gaussian | 0.48830764807262167 | 0.23844435916621534 | 0.479229490839398 | 153 |
| Chamfer | 0.5651814285588369 | 0.31943004718780765 | 0.4891238792167585 | 153 |

**Largest rank moves between centroid and Chamfer.** Ranks run 1–153, where 1 is the most similar pair.

| Pair | Centroid d | Centroid rank | Chamfer d | Chamfer rank | Gaussian rank |
|---|---:|---:|---:|---:|---:|
| Römerberg – Burgplatz | 0.3873673954257226 | 111 | 0.19748947780016995 | 27 | 105 |
| Alexanderplatz – Hauptmarkt | 0.26230323894665797 | 50 | 0.3319829615753629 | 118 | 83 |
| Burgplatz – Augustusplatz | 0.23129092109468957 | 40 | 0.30335546330348784 | 102 | 80 |
| Odeonsplatz – Hauptmarkt | 0.2828945620615046 | 65 | 0.34480758951687995 | 123 | 91 |
| Hauptwache – Marienplatz | 0.39414035043643114 | 112 | 0.23490209037845133 | 55 | 81 |
| Zeil – Alexanderplatz | 0.221797892366041 | 34 | 0.28191564878505626 | 89 | 52 |
| Rathausmarkt – Burgplatz | 0.24610812606507118 | 46 | 0.3011080816244284 | 101 | 90 |
| Bebelplatz – Augustusplatz | 0.2722604837410076 | 59 | 0.32444497701163555 | 113 | 117 |
| Hauptwache – Alter Markt | 0.33247056309224604 | 87 | 0.21341100837476779 | 34 | 64 |
| Konstablerwache – Marktplatz | 0.4108621529350851 | 118 | 0.25051552981592917 | 65 | 107 |

**Closest individual views across plazas** (`globalNearestViews`, top 10). View index 0 is the canonical reading; indices 1–7 are placed markers.

| # | View A | View B | Whitened distance |
|---:|---|---|---:|
| 1 | Bebelplatz view 3 | Burgplatz view 2 | 0.017693470060934136 |
| 2 | Konstablerwache view 6 | Alter Markt view 1 | 0.031087736251865436 |
| 3 | Römerberg view 4 | Konstablerwache view 6 | 0.038766063073359044 |
| 4 | Naschmarkt view 1 | Marktplatz view 7 | 0.04081484095350806 |
| 5 | Gendarmenmarkt view 2 | Marienplatz view 0 | 0.043397060503170735 |
| 6 | Alter Markt view 2 | Naschmarkt view 2 | 0.04414153124280206 |
| 7 | Bebelplatz view 3 | Alter Markt view 0 | 0.04468955236413697 |
| 8 | Römerberg view 1 | Marktplatz view 1 | 0.04577480725979229 |
| 9 | Konstablerwache view 0 | Rathausmarkt view 5 | 0.04721217344365223 |
| 10 | Römerberg view 5 | Marktplatz view 1 | 0.04785070732915167 |

### 6.3 Synthetic disagreement test

Setup is taken from `test/clouds.test.js:66-130`. Every point is `[x, 0.5, 0.5, 0.5]`, so the clouds differ only along the first (area) axis. The test file uses weights FITTED = [0.3122, 0.2749, 0.2065, 0.2064]. Distances were re-run with those weights and also with the full-precision live weights. `npm test` passes all assertions (292/292, methods doc).

| Case | Cloud A (first coordinate) | Cloud B (first coordinate) | Construction | Centroid | Gaussian W₂ | Chamfer |
|---|---|---|---|---:|---:|---:|
| 1. Centroid failure (the P7 gate) | 0.0, 0.02, 0.98, 1.0 (two separated groups) | 0.49, 0.5, 0.5, 0.51 (one group in the middle) | Same mean, different spread | 0 | 0.3116454478953472 | 0.26680245735375074 |
| 2. Gaussian failure | 0.4, 0.4, 0.6, 0.6 | 0.5 − 0.1√2, 0.5, 0.5, 0.5 + 0.1√2 | Same mean **and** same covariance | 0 | 0 | 0.03132680870601727 |

With the live full-precision weights:

- Case 1: centroid 0, Gaussian 0.3116439414747008, Chamfer 0.266801167693552.
- Case 2: centroid 0, Gaussian 0, Chamfer 0.031326657279607095.

**Assertions in the test file:**

| Case | Assertion |
|---|---|
| 1 | centroid < 0.01; Chamfer > 0.2 and > 20 × centroid; Gaussian > 0.2 |
| 2 | means and covariances equal within 1e−12; centroid < 1e−12; Gaussian < 1e−9; Chamfer > 0.01 |

---

## 7. P8 matched-view validation

**Status: run, interim.**

- 15 participants completed the instrument against a frozen bank.
- The stated recruitment target is 30–50 participants (the bank-sizing comment at `scripts/build-matched-view-trials.mjs:89-101`).
- The deployed endpoint is not configured (`MATCHED_VIEW_ENDPOINT_URL = ''`, `src/lib/surveyEndpoint.js:28`). All 15 responses are in the local dev file.

Source: `src/data/matched-view-trials.json` and `src/data/matched-view-responses.json` (stored). The analysis was re-run with `analyseMatchedView` (`src/lib/analysis/matchedView.js:355-399`), the same function the researcher page uses.

### 7.1 Bank and participants

**Bank:**

| Quantity | Value |
|---|---:|
| Generated | 2026-09-08T03:24:57.792Z |
| Trials | 108 (54 agreement + 54 discriminating) |
| Reference trials per plaza | 6 for every plaza (18 plazas) |
| Candidate appearances per plaza | min 11, max 13 |
| Agreement strength | min 0.0873300752743305, median 0.27942500179030205, max 0.7394496761231089 |
| Discriminating strength | min 0.20773982634882623, median 0.4305999031095254, max 1.0938407970744932 |

**Candidate pools before selection:**

| Pool | Trials |
|---|---:|
| Agreement | 11994 (1424 below the 0.05 floor) |
| Discriminating | 5718 (1369 below floor) |
| Cloud measures split from each other (discarded) | 1872 |

**Participants:**

| Quantity | Value |
|---|---:|
| Session records | 15, all `completed` |
| Answers per participant | 12 for all 15 |
| Scored rows | 180 (90 agreement + 90 discriminating) |
| Orphaned answers | 0 |
| Stale answers | 0 |
| Bank version answered against | 2026-09-08T03:24:57.792Z (all 15) |
| Collection | 2026-09-09T00:42:53.941Z → 2026-09-09T12:36:48.061Z |
| `background` | yes 11; no 4 |
| Distinct bank trials answered | 93 of 108 |
| Answers per answered trial | 1 answer: 42 trials; 2: 23; 3: 21; 4: 6; 5: 1 |

### 7.2 Accuracy and tests against 50%

- **Pooled** is an exact two-sided binomial over all judgements (n = 90 per stratum), with a Wilson 95% CI. It treats judgements as independent, which they are not.
- **Participant-level** is a sign test over participants above vs below 50%, with ties dropped.

**Agreement stratum.** All three measures predict the same candidate on every trial, so their rows are identical.

| Measure | k / n | Accuracy | Wilson 95% CI | Pooled binomial p | Participants above / below / tied | Sign-test p | Mean per-participant accuracy |
|---|---:|---:|---|---:|---|---:|---:|
| Centroid = Gaussian = Chamfer | 57 / 90 | 0.6333333333333333 | 0.5302230476398118 – 0.725527452209701 | 0.014866752945626307 | 9 / 3 / 3 (n = 12 decided) | 0.1459960937500002 | 0.6333333333333333 |

**Discriminating stratum** (Chamfer predicts one candidate; centroid and Gaussian predict the other):

| Measure | k / n | Accuracy | Wilson 95% CI | Pooled binomial p | Participants above / below / tied | Sign-test p | Mean per-participant accuracy |
|---|---:|---:|---|---:|---|---:|---:|
| Chamfer | 55 / 90 | 0.6111111111111112 | 0.5078245886506263 – 0.7053008278906345 | 0.04459752462791593 | 10 / 5 / 0 (n = 15) | 0.30175781250000033 | 0.611111111111111 |
| Centroid | 35 / 90 | 0.3888888888888889 | 0.2946991721093655 – 0.49217541134937376 | 0.04459752462791593 | 5 / 10 / 0 (n = 15) | 0.30175781250000033 | 0.3888888888888888 |
| Gaussian | 35 / 90 | 0.3888888888888889 | 0.2946991721093655 – 0.49217541134937376 | 0.04459752462791593 | 5 / 10 / 0 (n = 15) | 0.30175781250000033 | 0.3888888888888888 |

**Adjudication, exact McNemar, discriminating stratum:**

| Comparison | Chamfer right only | Other right only | Both | Neither | Discordant n | p | Odds (Chamfer-only / other-only) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chamfer vs centroid | 55 | 35 | 0 | 0 | 90 | 0.04459752462791598 | 1.5714285714285714 |
| Chamfer vs Gaussian | 55 | 35 | 0 | 0 | 90 | 0.04459752462791598 | 1.5714285714285714 |

In the agreement stratum the same comparisons have 0 discordant pairs (57 both right, 33 neither), so p = 1.

**Position bias** (share of choices on the left, exact binomial):

| Scope | k / n | Left share | p |
|---|---:|---:|---:|
| All rows | 90 / 180 | 0.5 | 1 |
| Agreement | 43 / 90 | 0.4777777777777778 | 0.7520332015985995 |
| Discriminating | 47 / 90 | 0.5222222222222223 | 0.7520332015985995 |

**Accuracy by prediction margin** (4 equal-count strength bins; this is the check that substitutes for an attention check):

| Stratum / measure | Bin 1 (n, accuracy) | Bin 2 | Bin 3 | Bin 4 |
|---|---|---|---|---|
| Agreement / all measures | 22, 0.45454545454545453 (strength 0.0917–0.1444) | 23, 0.5652173913043478 (0.1444–0.2994) | 22, 0.8181818181818182 (0.2994–0.5136) | 23, 0.6956521739130435 (0.5150–0.7394) |
| Discriminating / Chamfer | 22, 0.6363636363636364 (0.2077–0.3462) | 23, 0.5217391304347826 (0.3532–0.4445) | 22, 0.4090909090909091 (0.4445–0.4923) | 23, 0.8695652173913043 (0.5011–1.0938) |
| Discriminating / centroid and Gaussian | 22, 0.36363636363636365 | 23, 0.4782608695652174 | 22, 0.5909090909090909 | 23, 0.13043478260869565 |

Strength ranges are rounded to 4 dp. Full values are in `analyseMatchedView(...).strata[*].margin_curve`.

### 7.3 Instrument self-test

Re-run: `npm run matched-view:selftest`, exit 0, 25 of 25 checks passed. It simulates cohorts through the real bank.

| Scenario | Result |
|---|---|
| Participants follow Chamfer at θ = 0.78 | Discriminating stratum recovers Chamfer 0.796, centroid and Gaussian 0.204. McNemar: Chamfer-only 191, centroid-only 49, p = 5.48e-21. |
| Participants follow centroid at θ = 0.78 | Recovers centroid 0.813, Chamfer 0.188. McNemar: Chamfer-only 45, centroid-only 195, p = 1.92e-23. |
| Random responding (θ = 0.5) | Rejection rates at α = 0.05: pooled binomial 5.0%, sign test 5.5%, McNemar 5.0%. Median null p = 0.602. |
| Margin curve, simulated | 0.667 → 0.833 from the weakest to the strongest bin |

---

## 8. Konstablerwache

### 8.1 Current metrics

**Canonical readings.** Source: `src/data/results.json` (stored).

| Layer | Vantage (x, y) m | Heading ° | Area m² | Compactness | Occlusivity m | Enclosure |
|---|---|---:|---:|---:|---:|---:|
| `perceptual_120` | (−48.7, 13.08) | 120.1 | 8798.21 | 0.1736 | 192.92 | 0.1319 |
| `perceptual_360` | (−23.68, 0.96) | 346.2 (no effect at 360°) | 16698.05 | 0.1257 | 503.72 | 0.1886 |

**Field layer.** Source: `src/data/fields/konstablerwache-frankfurt-am-main.json` (stored; 2.5 m grid, 360°/360 rays/200 m, unflagged cast). There are n = 967 points: 988 fell inside the boundary and 21 were rejected. The projected site has 170 buildings.

| Metric | n | Mean | SD | Min | Median | Max |
|---|---:|---:|---:|---:|---:|---:|
| Area (m²) | 967 | 17535.56359875906 | 2808.49028851427 | 6045.07 | 16988.44 | 28635.2 |
| Compactness | 967 | 0.10710810754912094 | 0.024324142873678945 | 0.05494 | 0.10829 | 0.21565 |
| Occlusivity (m) | 967 | 493.21182006204737 | 52.79577235408616 | 233.74 | 490.92 | 710.78 |
| Enclosure | 967 | 0.23127335056876946 | 0.04793267849004452 | 0.16162 | 0.21604 | 0.46024 |

**P9-only diagnostics, height-aware baseline** (re-run: `recomputeField` with no elements, n = 967, 0 points dropped):

| Metric | Mean | SD | Min | Median | Max |
|---|---:|---:|---:|---:|---:|
| Closed share | 0.8969896070320539 | 0.032646037382525056 | 0.78889 | 0.90278 | 0.96389 |
| Solidity | 0.39273221302998984 | 0.08336923692892914 | 0.23555 | 0.39868 | 0.58042 |
| Solid share | 0.9698782936918339 | 0.024103049086015082 | 0.87778 | 0.97222 | 1 |

The height-aware baseline reproduces the stored field exactly: 0 zone mismatches in 967 points, and maximum absolute difference 0 for all four raw metrics (re-run).

**Zones** (stored, n = 967):

| Zone | Points | Share |
|---|---:|---:|
| Z0 Open, facade-rich | 658 | 0.6804550155118925 |
| Z1 Open, regular | 3 | 0.0031023784901758012 |
| Z2 Tight, strongly enclosed | 98 | 0.10134436401240951 |
| Z3 Tight, irregular | 208 | 0.21509824198552224 |
| Z4 Vast, regular | 0 | 0 |

### 8.2 Scenarios

Source: `src/data/scenarios.json` (stored; `version` 1; `updated_at` 2026-09-10T20:53:58.505Z; `validateScenarioFile` passes on re-run).

The file holds **7** scenarios. The note on "Four Types, Two Halves" (`scenarios.json:8`) calls it "a reachability demonstration … The other six each argue a design idea", which identifies the six drafted design scenarios. All 7 are reported.

**Specification check (re-run).** For each scenario:

- every element passes `elementParts` (and `validateMass` for freehand masses);
- recesses requested = recesses applied by `composeGeometry`;
- `scenarioDrift` against the current `zones.json`/`fields/index.json` provenance is empty.

| Scenario | Design scenario? | Elements (kinds) | All elements valid | Recesses requested / applied | Demolitions applied | Provenance drift | Selection centre, radius | Target zone |
|---|---|---|---|---|---|---|---|---|
| Four Types, Two Halves | No (reachability demo) | 8 (4 demolish, 2 landmark, 2 screenWall) | yes | 0 / 0 | 4 (buildings 144, 102, 60, 89) | none | (−23.69, 1.03), 20 m | null |
| Rooms in the Square | Yes | 4 (4 landmark) | yes | 0 / 0 | 0 | none | (−25, 8), 35 m | 2 Tight, strongly enclosed |
| Market Hall | Yes | 3 (1 freehand, 2 landmark) | yes | 0 / 0 | 0 | none | (−25, 8), 35 m | 2 |
| Colonnaded Edge | Yes | 4 (3 recess, 1 colonnade) | yes | 3 / 3 | 0 | none | (−25, 8), 45 m | 0 Open, facade-rich |
| Shaded Grove | Yes | 5 (2 treeRow, 2 colonnade, 1 plinth) | yes | 0 / 0 | 0 | none | (−34, 4), 35 m | 2 |
| Bridging the Level Break | Yes | 7 (3 freehand, 3 plinth, 1 screenWall) | yes | 0 / 0 | 0 | none | (7, 9), 35 m | 2 |
| Zeil Terminus | Yes | 3 (1 landmark, 2 colonnade) | yes | 0 / 0 | 0 | none | (−10, 2), 45 m | 2 |

**Element parameters** (stored, m unless stated):

| Scenario | Parameters |
|---|---|
| Four Types, Two Halves | landmark size 8 h 8.406 at (−38.845, 6.028) rot 36.134° and at (−38.845, −3.972) rot −36.134°; screenWall length 41.41439051017761 h 7.585078339571693 perf 0 at (−47.929, 20.575) rot −45.852° and at (−47.929, −18.519) rot 45.852° |
| Rooms in the Square | landmark 12×12: h 8 at (−56, 14), h 9 at (−30, 5), h 7.5 at (−4, 15), h 8.5 at (16, 0); rot 0 |
| Market Hall | freehand 4-corner mass h 8; landmark 6×6 h 4 at (−63, 4) and (13, 4) |
| Colonnaded Edge | recessedArcade length 28 depth 4 pier_spacing 5 on buildings 63, 89, 164; colonnade length 40 depth 4 spacing 4 h 6 at (19, 8) rot 90° |
| Shaded Grove | treeRow length 42 spacing 6 clearance 2.5 canopy_diameter 7 canopy_height 5 at (−34, 22) and (−34, −14); colonnade length 30 depth 4 spacing 5 h 6 at (−34, 10) and (−34, −2); plinth size 20 h 0.9 sides_open 2 at (10, 4) |
| Bridging the Level Break | freehand 4-corner masses h 6.5, 7, 6; plinth size 10 h 0.9 sides_open 2 at (−2, −20), (−4, 19), (−18.5, 11); screenWall length 20 h 2.6 perf 0 at (9, 0) rot 90° |
| Zeil Terminus | landmark 20×20 h 15 at (10, 2); colonnade length 35 depth 4 spacing 4 h 6 at (−45, 9) and (−45, −5) |

#### 8.2.1 How the before/after deltas were computed

Re-run on 2026-09-13 with the current code and data. No before/after results are stored anywhere, by design (`src/lib/scenarios.js:10-22`). The free-text `note` fields in `scenarios.json` contain hand-written figures; they are **not** used as a source here.

**After:**

- `recomputeField` with the scenario's elements: 360°, 360 rays, 200 m, height-aware, `perceptual_360` bounds, frozen k = 5 centres, normalised P5 weights.

**Before:**

- **Zone shares:** the stored P6 zones over all 967 points.
- **Metric means:** the height-aware empty-sandbox recompute, averaged over **only the points that survive the intervention**, so both columns cover the same points. This matches the P9 page's `MetricEffect`.
- **Selection diagnosis:** `diagnoseRegion` on the stored `n` of every selected point ("before") vs on the recomputed `n` of surviving selected points ("after"), against the scenario's target zone. This matches the page's `SandboxDiagnosisCompare`.

Percentage change is `(after − before) / before × 100`.

#### 8.2.2 Whole plaza (967 sampled points)

**Points and zone composition:**

| Scenario | Kept | Built over (dropped) | Changed zone | Z0 before → after | Z1 | Z2 | Z3 | Z4 |
|---|---:|---:|---:|---|---|---|---|---|
| Four Types, Two Halves | 919 | 48 | 490 | 0.6804550155118925 → 0.25571273122959737 | 0.0031023784901758012 → 0.05331882480957562 | 0.10134436401240951 → 0.24047878128400435 | 0.21509824198552224 → 0.4504896626768226 | 0 → 0 |
| Rooms in the Square | 846 | 121 | 592 | 0.6804550155118925 → 0.02009456264775414 | 0.0031023784901758012 → 0 | 0.10134436401240951 → 0.1867612293144208 | 0.21509824198552224 → 0.793144208037825 | 0 → 0 |
| Market Hall | 749 | 218 | 486 | 0.6804550155118925 → 0.04539385847797063 | 0.0031023784901758012 → 0 | 0.10134436401240951 → 0.45660881174899864 | 0.21509824198552224 → 0.4979973297730307 | 0 → 0 |
| Colonnaded Edge | 957 | 10 | 493 | 0.6804550155118925 → 0.2936259143155695 | 0.0031023784901758012 → 0.0010449320794148381 | 0.10134436401240951 → 0.009404388714733543 | 0.21509824198552224 → 0.6959247648902821 | 0 → 0 |
| Shaded Grove | 940 | 27 | 715 | 0.6804550155118925 → 0.02127659574468085 | 0.0031023784901758012 → 0 | 0.10134436401240951 → 0.0010638297872340426 | 0.21509824198552224 → 0.9776595744680852 | 0 → 0 |
| Bridging the Level Break | 880 | 87 | 566 | 0.6804550155118925 → 0.10227272727272728 | 0.0031023784901758012 → 0.09318181818181819 | 0.10134436401240951 → 0.23068181818181818 | 0.21509824198552224 → 0.5738636363636364 | 0 → 0 |
| Zeil Terminus | 868 | 99 | 643 | 0.6804550155118925 → 0.02304147465437788 | 0.0031023784901758012 → 0 | 0.10134436401240951 → 0.044930875576036866 | 0.21509824198552224 → 0.9320276497695853 | 0 → 0 |

"Before" shares are over all 967 stored points; "after" shares are over the kept points.

**Metric % change over surviving points.** The P9-only metrics are closed share, solidity and solid share. Solid share is sign-only at this site.

| Scenario | Area | Compactness | Occlusivity | Enclosure | Closed share | Solidity | Solid share |
|---|---:|---:|---:|---:|---:|---:|---:|
| Four Types, Two Halves | −36.08029022420033 | 15.736244090413521 | −18.859423269004417 | 6.47247065507754 | 3.0325122996064895 | 4.454369270086488 | 1.4921970018275288 |
| Rooms in the Square | −43.28478543204067 | −21.88697156272789 | −28.980945851921234 | 27.951041440117148 | 2.7358970571274286 | −18.177768646906866 | 1.0826779441397616 |
| Market Hall | −43.17525981999671 | −2.13337541740346 | −27.74576568330729 | 28.17738012629877 | 3.238463403406084 | −4.717347971561454 | 0.7020422716632095 |
| Colonnaded Edge | −5.157318791157468 | −57.637719023051005 | 7.258202367117683 | −0.190754763581713 | −3.5166283316214595 | −4.288589987017537 | 0.1671829173899401 |
| Shaded Grove | −19.28112158830149 | −84.54072973382465 | −20.02494251583503 | 2.6678999033591486 | −10.059783201719478 | −17.481682781448065 | 0.32148594025710553 |
| Bridging the Level Break | −33.70295366570045 | 9.65843449435893 | −21.5440920920205 | 13.4940700180277 | 2.5067937675804357 | −3.768456123554336 | 0.794765409698848 |
| Zeil Terminus | −32.125593347967 | −75.6608723176942 | −26.39863687201636 | 21.587071681706966 | −5.984834279381563 | −17.094927790761403 | 0.5233573424780052 |

**Absolute means over surviving points** (before → after):

| Scenario | Area m² | Compactness | Occlusivity m | Enclosure |
|---|---|---|---|---|
| Four Types, Two Halves | 17573.83319912951 → 11233.143177366712 | 0.10719658324265496 → 0.12406529923830246 | 492.75626768226334 → 399.8252774755169 | 0.2321224700761697 → 0.24714652883569094 |
| Rooms in the Square | 17340.201241134768 → 9834.53234042553 | 0.10815684397163104 → 0.08448458628841618 | 489.7117494089836 → 347.78865248226987 | 0.23685491725768312 → 0.3030583333333333 |
| Market Hall | 17650.894712950612 → 10030.075060080122 | 0.1079493057409879 → 0.10564634178905197 | 488.6870360480641 → 353.0970761014688 | 0.24306484646194945 → 0.3115541522029374 |
| Colonnaded Edge | 17478.73684430513 → 16577.30266457682 | 0.10701733542319744 → 0.04533498432601887 | 492.7101776384536 → 528.4720794148376 | 0.23171988505747115 → 0.23127786833855796 |
| Shaded Grove | 17544.053446808528 → 14161.363170212777 | 0.10714661702127651 → 0.016564085106382978 | 492.9803510638299 → 394.26131914893625 | 0.2318410531914893 → 0.23802634042553186 |
| Bridging the Level Break | 17558.76796590911 → 11640.944534090911 | 0.10679137499999995 → 0.11710575000000015 | 494.73144318181835 → 388.14604545454534 | 0.2313024431818182 → 0.2625145568181815 |
| Zeil Terminus | 17480.05563364057 → 11864.484043778806 | 0.10747865207373265 → 0.026159366359446996 | 490.56322580645144 → 361.06122119815666 | 0.2367930875576037 → 0.28790978110599075 |

**P9-only absolute means** (before → after):

| Scenario | Closed share | Solidity | Solid share |
|---|---|---|---|
| Four Types, Two Halves | 0.8965603373231763 → 0.9237486398258951 | 0.3923924156692053 → 0.4098710228509244 | 0.9694566050054427 → 0.9839228073993529 |
| Rooms in the Square | 0.898525851063829 → 0.9231085933806135 | 0.3953830732860515 → 0.3235112529550828 | 0.9710271631205692 → 0.9815402600472817 |
| Market Hall | 0.8941589185580767 → 0.9231159279038716 | 0.3908002403204271 → 0.37236483311081414 | 0.9672676101468632 → 0.9740582376502007 |
| Colonnaded Edge | 0.8973703134796222 → 0.8658131347962374 | 0.3932658307210029 → 0.37640027168234064 | 0.9703298223615493 → 0.971952048066878 |
| Shaded Grove | 0.8968558617021265 → 0.8066341063829795 | 0.3920302765957443 → 0.32349678723404285 | 0.9697489042553218 → 0.9728665106383 |
| Bridging the Level Break | 0.8965436363636353 → 0.9190181363636379 | 0.39178299999999955 → 0.3770188295454547 | 0.9699274318181849 → 0.9776360795454562 |
| Zeil Terminus | 0.896777465437787 → 0.8431068202764972 | 0.3976570967741931 → 0.3296779032258066 | 0.969764573732721 → 0.9748399078341017 |

#### 8.2.3 Within each scenario's saved selection

**Points and diagnosis against the target zone:**

| Scenario | Selected | Surviving | Swallowed | Target | Weighted distance before → after | On-target points before → after | On-target share before → after | Driving metric before → after |
|---|---:|---:|---:|---|---|---|---|---|
| Four Types, Two Halves | 208 | 179 | 29 | none | — | — | — | — |
| Rooms in the Square | 558 | 479 | 79 | Z2 | 0.35517245127664365 → 0.2712115517873171 | 34 → 111 | 0.06093189964157706 → 0.23173277661795408 | enclosure → compactness |
| Market Hall | 558 | 358 | 200 | Z2 | 0.35517245127664365 → 0.2090554460360981 | 34 → 261 | 0.06093189964157706 → 0.729050279329609 | enclosure → compactness |
| Colonnaded Edge | 826 | 826 | 0 | Z0 | 0.1952787075441362 → 0.3258795732567089 | 599 → 238 | 0.725181598062954 → 0.288135593220339 | area → compactness |
| Shaded Grove | 591 | 564 | 27 | Z2 | 0.3568374808065688 → 0.5110211919403356 | 43 → 0 | 0.0727580372250423 → 0 | enclosure → compactness |
| Bridging the Level Break | 422 | 336 | 86 | Z2 | 0.36784463042386495 → 0.3210837702901939 | 19 → 104 | 0.045023696682464455 → 0.30952380952380953 | enclosure → enclosure |
| Zeil Terminus | 751 | 657 | 94 | Z2 | 0.3466137847547759 → 0.4458304739781748 | 84 → 39 | 0.1118508655126498 → 0.0593607305936073 | enclosure → compactness |

"Before" distances and shares are over all selected points; "after" figures are over surviving points. "Four Types, Two Halves" has no target zone, so the diagnosis does not apply.

**Zone shares in the selection** (before over all selected stored points → after over surviving points):

| Scenario | Z0 | Z1 | Z2 | Z3 | Z4 |
|---|---|---|---|---|---|
| Four Types, Two Halves | 0.9711538461538461 → 0.3463687150837989 | 0 → 0.027932960893854747 | 0 → 0.16201117318435754 | 0.028846153846153848 → 0.46368715083798884 | 0 → 0 |
| Rooms in the Square | 0.8512544802867383 → 0 | 0 → 0 | 0.06093189964157706 → 0.23173277661795408 | 0.08781362007168458 → 0.7682672233820459 | 0 → 0 |
| Market Hall | 0.8512544802867383 → 0 | 0 → 0 | 0.06093189964157706 → 0.729050279329609 | 0.08781362007168458 → 0.2709497206703911 | 0 → 0 |
| Colonnaded Edge | 0.725181598062954 → 0.288135593220339 | 0 → 0 | 0.08958837772397095 → 0.002421307506053269 | 0.18523002421307505 → 0.7094430992736077 | 0 → 0 |
| Shaded Grove | 0.7648054145516074 → 0 | 0 → 0 | 0.0727580372250423 → 0 | 0.16243654822335024 → 1 | 0 → 0 |
| Bridging the Level Break | 0.8033175355450237 → 0.03869047619047619 | 0.0071090047393364926 → 0.19345238095238096 | 0.045023696682464455 → 0.30952380952380953 | 0.14454976303317535 → 0.4583333333333333 | 0 → 0 |
| Zeil Terminus | 0.7283621837549934 → 0.0228310502283105 | 0.0039946737683089215 → 0 | 0.1118508655126498 → 0.0593607305936073 | 0.15579227696404793 → 0.9178082191780822 | 0 → 0 |

**Metric % change in the selection** (same surviving points on both sides):

| Scenario | Area | Compactness | Occlusivity | Enclosure | Closed share | Solidity | Solid share |
|---|---:|---:|---:|---:|---:|---:|---:|
| Four Types, Two Halves | −29.14127118699558 | 7.283669417432756 | −13.798177053092905 | 13.033712266955758 | 0.8647721914003564 | 0.17582063129000278 | 0.7966100897597553 |
| Rooms in the Square | −48.191444964275604 | −23.37785145878852 | −34.015711548396574 | 37.69142334727118 | 2.7742432276885385 | −20.61861020744343 | 1.004422503781333 |
| Market Hall | −46.559362992464386 | 4.135795077449212 | −34.819964404812616 | 44.21799324725531 | 3.0282670103216756 | 5.017606235531388 | 0.27856261689676903 |
| Colonnaded Edge | −5.046524848227424 | −60.369761259684296 | 7.105015213584691 | −0.8126127518512877 | −3.738670257343499 | −4.459326563354318 | 0.14679554621246324 |
| Shaded Grove | −21.523408640240802 | −86.24660831658758 | −22.509803161998608 | 5.058273830798781 | −11.049085088744052 | −18.52780134070617 | 0.31237600976276075 |
| Bridging the Level Break | −43.14581825406682 | 26.042328483751675 | −35.78368974856237 | 32.050520999206654 | 3.4708407444704714 | 3.7753759407374687 | 0.9308988717540715 |
| Zeil Terminus | −34.114831180882696 | −74.74224831142918 | −28.980408554065836 | 26.392603974003897 | −5.7110281529250875 | −16.11441170078915 | 0.44124256710372856 |

The absolute before/after means for the selection level are in the re-run output (`r2.json` → `p9.scenarios[*].selection.metrics`). They are not reproduced here.

---

## 9. What is `NOT RUN`, in one place

| Item | Section |
|---|---|
| Weight fit, CIs, accuracy and baselines on the 120° static-photo survey | §0, §2 |
| Per-triplet response times for the 120° survey (field absent) | §2.2 |
| Repeat-trial agreement, between-participant agreement on identical triplets, and a noise ceiling for the triplet task (both surveys) | §2.4, §4.1 |
| Leave-one-participant-out and random k-fold cross-validation | §3.4 |
| Equal-weight baseline; single-metric baselines other than area | §3.5 |
| Regularisation, L1/Minkowski and rank-normalisation robustness fits | §3.6 |
| "63.9% of area reconstructable" figure | §1.3 |
| Pilot (2-session) analysis | §4.2 |
| Recruitment information (`NOT FOUND`) | §2.1, §4.3 |
| Independent replication (`NOT FOUND`) | §4.4 |
