# 01 — Methods: implementation reference

Source-derived reference for the thesis methods chapter. Every claim cites the file that implements it. Line ranges refer to the tree at commit `9cbfacb` (branch `main`, clean). All paths are relative to the repository root.

Conventions used below:

- **LIVE**: the code path that produced the stored data or that the app runs.
- **DEAD / SUPERSEDED**: still in the tree (or only in git history) but not on the path that produced any current result.
- **NOT FOUND**: searched for and absent. The search is stated.
- **(data)**: a value read from a committed data file, not from code. The file is named.
- **DISCREPANCY**: the code and a comment or `docs/spec.md` disagree. The code is what runs.

`npm test` at this commit: 292 tests, 67 suites, 292 pass, 0 fail.

---

## 0. Coordinate system and shared constants

| Item | Value | Where |
|---|---|---|
| Projection | Equirectangular about the site centre. `x = (lon − lon₀)·111320·cos(lat₀)`, `y = (lat − lat₀)·110574`, in metres. X = east, Y = north, Z = up. | `src/lib/geo.js:7-20` |
| Bearing convention | Radians, 0 = north (+Y), clockwise. Ray direction vector `(sin θ, cos θ)`. | `src/lib/isovist.js:5-7, 20-22, 86-87` |
| Eye height | 1.6 m. Defined twice with the same value: once for the renderer/presets, once for the engine. | `src/lib/viewGeometry.js:13`; `src/lib/isovist.js:126` |
| Metric order (everywhere) | `['area', 'compactness', 'occlusivity', 'enclosure']` | `src/lib/analysis/fingerprints.js:16` |
| Stored field names | `area_m2`, `compactness`, `occlusivity_m`, `enclosure_ratio` | `src/lib/analysis/fingerprints.js:20-25` |
| Seeded PRNG | mulberry32, seeded through FNV-1a `hashString` | `src/lib/triplets.js:30-48` (copied at `src/lib/matchedView.js:182-200`) |

---

## 1. Architecture

### 1.1 Phase pipeline

Routes are hash routes. Phase ids and codes are in `src/lib/phases.jsx:44-154`, and routing is in `src/App.jsx:141-171`. The participant instruments are chrome-free query routes: `?survey` (`src/App.jsx:162`) and `?matched-view-survey` (`src/App.jsx:171`).

| Phase | Entry points | Inputs | Outputs |
|---|---|---|---|
| **P1 Site register** | `#/sites` → `src/pages/AdminPage.jsx`; dev endpoint `/__save-sites` (`vite.config.js:17-49`) | Pasted OSM GeoJSON (`src/lib/geojson.js:9-33`), manual heights, boundary polygon, images (`/__upload-image`, `vite.config.js:376-423`) | `src/data/sites.json` |
| **P2 Spatial analysis** | `#/viewer` → `src/components/SiteViewer.jsx`; engine `src/lib/isovist.js`; `npm run recompute:readings` (`scripts/recompute-readings.mjs`); `npm run compute:360` (`scripts/compute-360.mjs`) | `sites.json` | `src/data/results.json`: one canonical reading per site per layer (`SiteViewer.jsx:475-511`, saved via `/__save-results`, `vite.config.js:55-82`) |
| **P3 Perceptual survey** | `?survey` → `src/pages/SurveyPage.jsx`, with sampling and scales in `src/lib/survey360.js`; launch page `#/survey` → `src/pages/SurveyLaunch.jsx`; storage in `google-apps-script/Code.gs`, `/__save-survey-360` (`vite.config.js:127-188`), `npm run sync:survey` (`scripts/sync-survey-360.js`) | `sites.json`, `public/panoramas/*.jpg` | `src/data/survey-responses-360.json` |
| **P4 Results dashboard** | `#/results` → `src/pages/ResultsPage.jsx`, `src/lib/coverage.js`, `src/components/CoveragePanel.jsx` | `survey-responses-360.json` | Nothing written (display only) |
| **P5 Weight fitting** | `npm run analyze` → `scripts/analyze.mjs` (+ `scripts/permutation-worker.mjs`); `npm run validate:ratings` → `scripts/validate-ratings.mjs`; `#/weights` → `src/pages/WeightsPage.jsx`; library `src/lib/analysis/{fingerprints,model,fit,resample,crossval,exclusions,ablation,hypotheses,projection}.js` | `results.json` (layer `perceptual_360`), `survey-responses-360.json`, `sites.json` | `src/data/analysis-panoramic.json`, `src/data/rating-validation.json` (plus `-n30` variants from `--limit=30`) |
| **P6 Field + zones** | `npm run fields` → `scripts/compute-fields.mjs`; `npm run zones` → `scripts/compute-zones.mjs`; `#/field` → `src/pages/FieldPage.jsx`; vocabulary `src/lib/zones.js` | `sites.json`, `results.json` (for `perceptual_360` bounds), `analysis-panoramic.json` (weights) | `src/data/fields/<slug>.json` ×18, `src/data/fields/index.json`, `src/data/zones.json` |
| **P7 View clouds** | `#/cloud-comparison` → `src/pages/CloudComparisonPage.jsx`, `src/components/ViewCloudEditor.jsx`; library `src/lib/viewClouds.js`, `src/lib/analysis/clouds.js`; `/__save-view-clouds` (`vite.config.js:200-229`) | `results.json` (layer `perceptual_120`), `analysis-panoramic.json` (weights), `sites.json` | `src/data/view-clouds.json` (placed markers only). Distances are computed in the browser and not stored. |
| **P8 Matched-view survey** | `npm run trials:matched-view` → `scripts/build-matched-view-trials.mjs`; `npm run matched-view:selftest` → `scripts/matched-view-selftest.mjs`; `?matched-view-survey` → `src/pages/MatchedViewSurvey.jsx`; `#/matched-view` → `src/pages/MatchedViewPage.jsx`; library `src/lib/matchedView.js`, `src/lib/analysis/matchedView.js`; storage `google-apps-script/MatchedView.gs`, `/__save-matched-view` (`vite.config.js:239-300`) | `results.json`, `view-clouds.json`, `analysis-panoramic.json`, `sites.json` | `src/data/matched-view-trials.json` (frozen bank), `src/data/matched-view-responses.json` |
| **P9 Diagnose** | `#/diagnose` → `src/pages/DiagnosePage.jsx`, `src/components/TierB.jsx`, `CellProbe.jsx`, `PrecedentPanel.jsx`, `ScenarioPanel.jsx`, `SandboxScene.jsx`; library `src/lib/{sandbox,presets,probe,precedent,scenarios,sandboxStore}.js`; `npm run validate:presets` → `scripts/validate-presets.mjs`; `/__save-scenarios`, `/__scenarios` (`vite.config.js:312-362`) | `sites.json`, `fields/konstablerwache-frankfurt-am-main.json`, `fields/index.json`, `zones.json`, `results.json`, `view-clouds.json`, `matched-view-trials.json`, `matched-view-responses.json` | `src/data/scenarios.json` (drawn elements only); browser `localStorage` key `sf-p9-sandbox-v1` (`src/lib/sandboxStore.js:19`) |

All dev endpoints exist only under `npm run dev` (Vite `configureServer`). The deployed GitHub Pages build has no write path except the two Google Apps Script Web Apps (`src/lib/surveyEndpoint.js:13-14`). `MATCHED_VIEW_ENDPOINT_URL` is `''` (`src/lib/surveyEndpoint.js:28`), so a deployed P8 does not store responses.

### 1.2 Shared code

- **One ray-casting engine.** `castIsovist` (`src/lib/isovist.js:39-120`) is used by P2 (`SiteViewer.jsx:427,430,448`), P2 recompute (`scripts/recompute-readings.mjs:60`), P6 (`scripts/compute-fields.mjs:184`), P7 (`ViewCloudEditor.jsx:136,154`), P9 field recompute (`src/lib/sandbox.js:284`), P9 cell probe (`src/lib/probe.js:71`), P9 precedent probe (`src/lib/precedent.js:154`) and the home-page hero (`src/components/FigureGround.jsx:40`).
- **One normalisation rule.** Min–max, not clamped: `normaliseValue` (`src/lib/analysis/fingerprints.js:148-150`). It is re-implemented inline with identical arithmetic in `compute-fields.mjs:198`, `sandbox.js:300` and `precedent.js:231-236`.
- **One set of bounds constructors.** `canonicalReadings` + `computeBounds` (`fingerprints.js:72-140`) feed P5 (`analyze.mjs:383`), P6 (`compute-fields.mjs:129`), P7/P8/P9-precedent (through `buildClouds`, `viewClouds.js:105`) and `validate-ratings.mjs:278`.
- **One weighted squared distance for the typology.** `weightedDist2` in `src/lib/zones.js:62-69`, duplicated character-for-character in `scripts/compute-zones.mjs:93-100`. The duplication is intentional so the script stays standalone (comment `zones.js:58-61`).
- **One whitening step for P7/P8/P9-precedent.** `whiten` multiplies each axis by √wₖ (`src/lib/analysis/clouds.js:49-52`). It is used by `clouds.js`, `build-matched-view-trials.mjs:163-165` and `precedent.js:273`.
- **One weight vector downstream.** P6, P7, P8 and P9 all read `fit.weights_normalised` from `analysis-panoramic.json`: `compute-zones.mjs:301-302`, `CloudComparisonPage.jsx:72`, `build-matched-view-trials.mjs:141`, `DiagnosePage.jsx:283` (read back via `zones.json.weighted_by.weights`).

### 1.3 Deliberate isolation

- **Layer isolation by `fov_mode`.** See §4.
- **P9's height-aware mode is a module constant**, not a per-call option: `HEIGHT_AWARE = true` (`src/lib/sandbox.js:59`). `buildEdgeIndex` records its mode, and `castIsovist` throws on a mismatched index (`isovist.js:65-71, 194-199`).
- **P9 never refits the typology.** Points are assigned to the frozen centres from `zones.json` (`zones.js:83-94`; `sandbox.js:318`).
- **P9 never writes the register.** `composeGeometry` returns a new object and `recomputeField` is pure (`sandbox.js:107-183, 228-336`). `validateScenarioFile` refuses the keys `sites, buildings, boundary, points, zones, geometry` (`src/lib/scenarios.js:50, 114-121`).
- **Separate response files per instrument.** P3 panoramic: `survey-responses-360.json`. Archived static-photo study: `survey-responses.json`, with no dev save endpoint in `vite.config.js`. P8: `matched-view-responses.json`.
- **P8's stimulus bank is frozen on disk**, not computed live. Answers carry the predictions that were live when given, and `joinResponses` separates orphaned and stale answers (`src/lib/analysis/matchedView.js:138-178`).
- **`probe.js` imports nothing from the 120° layer** (imports at `src/lib/probe.js:23-31`).

### 1.4 Dead or superseded paths

| Item | Status | Evidence |
|---|---|---|
| `assembleSurvey` in `src/lib/triplets.js:111-149` (27 items with an attention check) | DEAD. The live P3 uses `assembleSurvey` from `src/lib/survey360.js:117-136` (12 triplets, no check). | `SurveyPage.jsx:6-21` imports from `survey360`. No importer of `triplets.assembleSurvey` in `src/`, `scripts/` or `test/`. `buildBalancedPool`, `mulberry32` and `hashString` from `triplets.js` are still live. |
| `scripts/compute-360.mjs` output `src/data/fingerprints-360.json` | DEAD. The file was deleted in commit `abc37b8` and nothing reads it. | `compute-360.mjs:128-144`. A grep for `fingerprints-360` finds only this script. |
| Layer `perceptual_360_r100` (360°, 100 m range) | Declared, no data. | `fingerprints.js:51-63`; `recompute-readings.mjs:38`. `results.json` holds 18 `perceptual_120` and 18 `perceptual_360` canonical readings and no other layer (data). |
| Legacy `hypotheses` block (H1–H3) in `analysis-panoramic.json` | SUPERSEDED. It is written by `analyze.mjs:527-551` with the old statements, including "Enclosure carries the largest perceptual weight". The UI uses `buildHypotheses` (H1–H5) from `src/lib/analysis/hypotheses.js:84-233`. | `WeightsPage.jsx:51`. No reader of `analysis.hypotheses` in `src/`. |
| `--source=archive` (static-photo survey × `perceptual_120`) | Selectable, not the reported fit. The default is `panoramic`. | `analyze.mjs:84-97`. No `analysis-archive.json` is committed. |
| `scripts/perceived-holdout.mjs` (the leave-one-participant-out test of the rating blend cited in `analyze.mjs:34-36`) | NOT FOUND. Searched `scripts/`, and `git log --all -S"perceived-holdout"`: the only hit is the commit that added the comment (`70055ed`). The script was never committed. |
| Pre-2026-08-27 occlusivity and enclosure formulas | SUPERSEDED (git history only). | See §3.3 and §3.4. |
| `solid_frontage_m` (P9 diagnostic) | REMOVED in commit `7fb666f`. | Absent from `isovist.js:525-534`. |

---

## 2. Geometry and ray casting

### 2.1 Ray count, angular resolution, range

| Setting | Value | Where configured |
|---|---|---|
| Engine defaults | `FOV_DEG = 120`, `MAX_RANGE_M = 200`, `RAY_COUNT = 120` | `src/lib/isovist.js:9-17` |
| `perceptual_120` (P2 viewer) | fov 120, rays 120, range = engine default 200 | `SiteViewer.jsx:33-41`; cast `SiteViewer.jsx:430` (range not passed) |
| `perceptual_360` (P2 viewer) | fov 360, rays 360, range 200 | `SiteViewer.jsx:42-50, 427` |
| Recompute script | per layer: 120/120/200; 360/360/200; 360/360/100 (`_r100`); 360/360/200 (`field_360`) | `scripts/recompute-readings.mjs:35-40` |
| P6 field | `RAY_COUNT = 360`, `RANGE_M = 200`, fov 360 | `scripts/compute-fields.mjs:45-47, 184-189` |
| P7 markers, P9 precedent | 120 rays / 120° / 200 m | `src/lib/viewClouds.js:29-32`; `src/lib/precedent.js:55-58` |
| P9 field recompute and cell probe | 360 rays / 360° / 200 m | `src/lib/sandbox.js:30-33` |

Angular sampling (`isovist.js:73-87`):

- A 360° ring counts as closed (`fov ≥ 360 − 1e-9`). Rays sit at `θᵢ = dir − 180° + i·(360°/rayCount)`, i = 0…rayCount−1, so there is no duplicate bearing. That is 1.0° spacing.
- A wedge (fov < 360) places rays at `θᵢ = dir − fov/2 + i·fov/(rayCount−1)`, both edges included. For 120 rays over 120° the spacing is 120/119 ≈ 1.0084°.

For a 360° cast the direction has no effect on the metrics. `recompute-readings.mjs:62` and `compute-fields.mjs:184` pass 0, and stored 360° readings carry `heading_is_informational: true` (`SiteViewer.jsx:501`).

### 2.2 Ray termination and classification

- **Intersection test.** A parametric ray–segment test (`raySegmentDistance`, `isovist.js:333-344`). Parallel segments (`|denom| < 1e-12`) never hit. A hit requires `t ≥ 0` and `0 ≤ u ≤ 1`, so segment endpoints count as hits.
- **Nearest hit.** The minimum `t` over all edges with `t ≤ maxRange` (`nearestIntersection`, `isovist.js:246-260`). A hit at exactly 200 m counts as a wall.
- **Indexed path.** A uniform grid with 8 m target cells, capped at 262,144 cells (doubling the cell size until under the cap) (`isovist.js:191-244`). A DDA walk stops once the best hit is nearer than the next cell's entry distance (`isovist.js:270-329`). A ray starting outside the grid falls back to brute force (`isovist.js:277-279`). This is used by P6 and P9. The P2 viewer and the recompute script use brute force. `test/isovist.test.js` asserts the two paths give exactly equal results.
- **Two termination types only** (`isovist.js:92-110`):
  - `wall: true` — ray stopped on an edge. Records `point`, `distance = t`, `height` (edge height) and `building` (index of the source building in the list passed to the caster).
  - `wall: false` — no hit within range. The endpoint is placed at `range`, with `distance = range`, `height = null`, `building = null`.
- **NOT FOUND: finer termination classes** (for example facade vs. street opening vs. range cap vs. ground change). Searched `src/lib/isovist.js` and every `castIsovist` caller. Only the `wall` boolean and the `building` index exist. Occlusivity and closed share derive "continuity" from `building` equality plus a 1.5 m tolerance (§3.3). They do not derive it from a termination class.

### 2.3 Obstacle set

- **The only obstacle source is the building list** produced by `projectSite` (`src/lib/site.js:44-89`). Each footprint contributes every edge of its outer ring (`isovist.js:163-171`).
- **Inner rings (courtyards, holes) are ignored**: only `footprint.coordinates[0]` is read (`site.js:55`). In the 18 active sites, 4 footprints carry inner rings (data: `sites.json`, counted with `projectSite` input rules).
- A GeoJSON `MultiPolygon` becomes separate building entries at parse time (`src/lib/geojson.js:66-74`). Rings with fewer than 4 coordinates are skipped (`site.js:56`).
- Hand-drawn buildings (`manual: true`) are ordinary obstacles. The flag is display-only (`site.js:59-62`).
- **Vegetation, kiosks, canopies, street furniture, level changes.** NOT FOUND as separate obstacle categories in the P1–P8 engine path. Searched `src/lib/site.js`, `src/lib/isovist.js`, `src/lib/geojson.js` and the `sites.json` building keys (`footprint, osm_height_m, override_height_m, manual`). In the P1–P8 casts:
  - A kiosk, canopy or other structure blocks only if it was entered as a building footprint. Once entered, it blocks as a full-height prism regardless of height, because `heightAware` defaults to `false` (`isovist.js:51, 141-173`).
  - There is no terrain or level model. All casts are planar.
  - Trees, street furniture and canopies exist only as **P9 sandbox presets** (§8), and only obstruct under P9's height-aware mode.
- The plaza **boundary is not an obstacle**. It is used only to include or exclude vantage and grid points (`compute-fields.mjs:111`; `SiteViewer.jsx:104, 295`; `ViewCloudEditor.jsx:116`).

### 2.4 Building heights

Height is resolved by `effectiveHeight` (`src/lib/site.js:9-17`), applied in `projectSite` (`site.js:62`). The precedence is:

1. `override_height_m` if it is a number > 0 (manual pin);
2. `osm_height_m` if it is a number > 0;
3. the site's `default_height_m` if it is a number > 0;
4. `FALLBACK_HEIGHT = 9` m (`site.js:3`).

How the fields are populated:

- **`osm_height_m`** comes from the pasted GeoJSON (`AdminPage.jsx:216`). `heightFromProperties` (`geojson.js:81-88`) reads `height` or `building:height` (rounded to 0.1 m). Failing that, it uses `building:levels × 3.2 m` (`LEVEL_HEIGHT`, `geojson.js:7`). Otherwise the value is `null`.
- **`default_height_m`** is set to 12 at site creation (`AdminPage.jsx:21, 67`).
- **Manual buildings** drawn in the viewer store `osm_height_m: null` and `override_height_m` = the drawn height (`SiteViewer.jsx:357-358`). The viewer's own fallback default for that drawing is 12 m (`SiteViewer.jsx:316`).

Missing heights are not dropped or flagged at cast time. They silently take the site default. Resolved sources over the 5,421 buildings in the 18 active sites (data: `sites.json`):

| Source | Buildings |
|---|---|
| Manual override | 19 |
| OSM | 2,327 |
| Site default | 3,075 (56.7%) |
| 9 m fallback | 0 |

Site defaults are 32 m at Gendarmenmarkt and 12 m at the other 17 sites. Resolved effective heights range from 1.2 m (min) to 368 m (max), with a median of 12 m.

What height affects:

- **Unflagged mode (P1–P8):** height enters **only** the enclosure term (§3.4). Sightline blocking ignores height.
- **Height-aware mode:** see §2.5.

### 2.5 Height-aware ray-cast mode

**What differs.** With `heightAware: true`, a building (or sandbox part) contributes edges only if `base ≤ eyeHeight` and `top > eyeHeight`, where `base = source.base ?? 0` and `top = source.height ?? Infinity` (`isovist.js:146-154`; the equivalent rule for sandbox parts is `partBlocks`, `src/lib/presets.js:37-39`). Nothing else changes: the same intersection test, the same metrics. The enclosure angle still uses the full `top` height (§3.4). The engine default is `false` (`isovist.js:51`), and an index built in one mode is rejected in the other (`isovist.js:65-71`).

**Which phases use it.** Only P9, through `HEIGHT_AWARE = true` (`sandbox.js:59`):

- `recomputeField`, both the "with intervention" cast and the empty-sandbox baseline (`sandbox.js:238, 289`; `DiagnosePage.jsx:597-607`);
- the cell probe outline (`probe.js:70, 76`);
- the precedent probe (`precedent.js:96, 159`).

P1–P8 casts pass no flag: `SiteViewer.jsx:427-451`, `recompute-readings.mjs:60-65`, `compute-fields.mjs:178, 184-189`, `ViewCloudEditor.jsx:136-157`.

**Mixed-mode comparisons inside P9.** These are consequences of the code as written:

- The "as surveyed" zone map, the Tier A inputs, the baseline region diagnosis, and the `beforeZones` passed to `diffField` all read the **stored P6 field**, which was cast unflagged (`DiagnosePage.jsx:350-387, 483`).
- The "with intervention" values come from the **height-aware** recompute.
- The per-metric before/after table (`MetricEffect`) is the exception: both columns come from height-aware casts (`DiagnosePage.jsx:616-647`; caption `TierB.jsx:451-458`).
- The two modes give identical obstacle sets for any site with no footprint at or below 1.6 m. The only active-site footprint with effective height ≤ 1.6 m is 1.2 m at Gendarmenmarkt (data: `sites.json`), so at Konstablerwache the stored and re-cast baselines agree. The comment at `DiagnosePage.jsx:582-583` cites `test/sandbox.test.js` for the point-for-point reproduction, and `test/precedent.test.js:71-95` asserts corpus-wide agreement for the 120° views.

---

## 3. Metric definitions as implemented

All four are computed in one function, `computeMetrics` (`src/lib/isovist.js:356-535`), from the ray results.

**Polygon construction.** Vertices are ray endpoints relative to the vantage point (`isovist.js:357-362`):

- **120° wedge:** `[vantage (0,0), e₀ … e₁₁₉]`, closed back to the vantage point (`isovist.js:363`). The vantage vertex has `wall: false`.
- **360° ring:** `[e₀ … e₃₅₉]`, with no vantage vertex. The closing edge e₃₅₉→e₀ is a regular edge.

The edge loop runs over `i = 0…n−1` with `b = verts[(i+1) % n]` (`isovist.js:371-411`).

### 3.1 Isovist area

- **Formula (code):** `area = |Σᵢ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)| / 2` over the polygon above (`isovist.js:374, 448`).
- **Units:** m².
- **Function:** `computeMetrics`, `src/lib/isovist.js`.
- **Variants:** none in code. The range-dependent variant is the unused `perceptual_360_r100` layer (§1.4). The wedge and the ring are different polygons by construction (`isovist.js:28-38`).

### 3.2 Compactness

- **Formula (code):** `compactness = 4π·area / perimeter²`, or 0 if perimeter = 0 (`isovist.js:449`). Here `perimeter = Σ |vᵢ₊₁ − vᵢ|` over **all** polygon edges (`isovist.js:375-376`): wall-bound, range-bound and, for a wedge, the two radial side edges through the vantage point.
- **Units:** dimensionless, range [0, 1].
- **Function:** `computeMetrics`, `src/lib/isovist.js`.
- **Variants:**
  - LIVE: the 4πA/P² above, in every phase.
  - **`solidity = area / convexHullArea(verts)`** (`isovist.js:522-523`; Andrew monotone chain at `541-577`). This is a P9-only diagnostic that is returned by the engine but written only on P9 recompute records (`sandbox.js:316`). It never enters a fit, a field file or the typology.

### 3.3 Occlusivity

**Implementation, quoted verbatim** (`src/lib/isovist.js:371-411`, comments removed, with `TOUCHING_TOLERANCE_M = 1.5` from line 16):

```js
for (let i = 0; i < n; i++) {
  const a = verts[i]
  const b = verts[(i + 1) % n]
  shoelace += a.x * b.y - b.x * a.y
  const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
  perimeter += edgeLen
  const continuous =
    a.building === b.building || edgeLen <= TOUCHING_TOLERANCE_M
  if (a.wall && b.wall && continuous) {
    closedPerimeter += edgeLen
    closedEdges++
  }
}
```

It is returned as `occlusivity: closedPerimeter` (`isovist.js:529`).

**What is summed.** The Euclidean lengths of polygon edges between **consecutive** ray endpoints where both endpoints are wall hits **and** either:

- both hits are on the same building (same index into the obstacle list), or
- the edge is at most 1.5 m long.

In other words, closed perimeter. It is **not a ratio**, and there is no division by the total perimeter.

- **Units:** metres.
- **Wedge:** the two edges touching the vantage vertex never count, because the vantage vertex has `wall: false`.
- **360° ring:** the wrap-around edge e₃₅₉→e₀ counts if it qualifies.
- **Building identity:** after a P9 recess, the host building's rewritten edges keep the host's index (`isovist.js:156-161`), so recess walls stay continuous with the facade.

**Every occlusivity variant in the repository:**

| # | Variant | Status | Where |
|---|---|---|---|
| O1 | **Closed perimeter, continuity = same building OR edge ≤ 1.5 m** | **LIVE**. Present since commit `1dc4858`, unchanged in logic since (later commits `4a1321f`, `7fb666f`, `ce1fcb9` only restructured the `if` and added `closedEdges`). | `isovist.js:405-410` |
| O2 | Closed perimeter, "both endpoints are wall hits", no continuity test | SUPERSEDED, git history only | `git show abc37b8:src/lib/isovist.js`, line 145: `if (a.wall && b.wall) closedPerimeter += edgeLen` |
| O3 | `closed_share = closedEdges / n`: count of qualifying edges ÷ polygon vertex count, dimensionless | P9-only diagnostic. Same continuity test as O1. Written only on P9 recompute records (`sandbox.js:315`) and not used in any fit. For a wedge, `n` includes the vantage vertex (121). | `isovist.js:413-446` |
| O4 | `solid_share = wallRays / rays.length` (no continuity requirement) | P9-only diagnostic, not an occlusivity variant as such, but documented in code as its complement | `isovist.js:496-506` |
| O5 | O1 at 100 m range (`perceptual_360_r100`) | Declared, no readings exist | `recompute-readings.mjs:38` |
| — | Benedikt normalised `1 − Uv/Perimeter`; Benedikt absolute; occluding radials; radials + range arc | **NOT FOUND as code.** Searched `src/`, `scripts/`, `test/`, `google-apps-script/` for `radial`, `Benedikt`, `occluding` (case-insensitive), and `git log --all -S"radials"`. They exist only as text: a hard-coded evidence string in `src/lib/analysis/hypotheses.js:176-179` ("Closed perimeter, Benedikt absolute, Benedikt normalised, occluding radials — none converge") and prose tables in `docs/spec.md`. No committed code computes them, and no committed data holds their values. |

**Which variant produced the weight-fitting results.** O1.

- `analysis-panoramic.json` (`generated_at` 2026-09-02T06:39:49Z, committed in `70055ed`) records occlusivity bounds min 267.22 (Marktplatz-Heidelberg), max 622.93 (Hauptwache) for layer `perceptual_360`. Its enclosure bounds are 0.1131–0.3841.
- Those match `results.json` as committed in `1dc4858` (the O1 + atan-enclosure recompute): 267.22–622.93 and 0.1131–0.3841.
- They do not match the pre-correction readings in `abc37b8`: occlusivity 516.35–1336.97, enclosure 0.2032–1.0239.
- `results.json` is unchanged in these values at HEAD, and its current `perceptual_360` min/max equal the analysis bounds exactly (data).
- The fit reads stored `occlusivity_m`, not a live cast (`fingerprints.js:20-25`; `analyze.mjs:380-383`).

**Recompute provenance.** `recompute-readings.mjs` rewrites only `occlusivity_m` and `enclosure_ratio` from the stored pose. Area and compactness are left as captured (`recompute-readings.mjs:76-93`). The script adds a `recomputed_at` field (`recompute-readings.mjs:92`), but no record in the committed `results.json` carries `recomputed_at` (data). NOT FOUND: an explanation of why the field is absent. Searched the git diff of `1dc4858` for `results.json` and `recomputed_at` references in `scripts/`.

### 3.4 Enclosure ratio

**Formula (code)** (`isovist.js:474-483`):

```
enclosure = (1/N) · Σ_{i=1..N} e_i
e_i = atan(h_i / d_i) / (π/2)   if ray i is a wall hit with h_i > 0 and d_i > 0
e_i = 0                          otherwise (open rays included in N)
```

- `N = rays.length`: 120 or 360.
- `h_i` is the height of the hit edge, which is the building's effective height, measured **from the ground** (`isovist.js:158, 169`).
- `d_i` is the horizontal hit distance in metres.
- **Eye height is not subtracted.** The formula uses `h_i`, not `h_i − 1.6`. **DISCREPANCY:** the comment at `src/lib/viewGeometry.js:10-12` says 1.6 m is "the standing eye height the enclosure metric's vertical angles already assume". No such offset appears in `isovist.js:474-483`.
- In P9 height-aware casts, `h_i = part.top`; a part's `base` does not enter the angle (`sandbox.js:161-162`).
- **Units:** dimensionless in [0, 1]. ×90 gives mean degrees.
- **Function:** `computeMetrics`, `src/lib/isovist.js`.

**Variants:**

- LIVE: the arctangent mean over all rays (since `1dc4858`).
- SUPERSEDED (git history only): `mean(h_i / d_i)` over wall-hit rays only (`git show abc37b8:src/lib/isovist.js`, lines 151-154).

The stored golden fixture for the 18 canonical 120° readings is `test/fixtures/canonical-120.golden.json` (fov 120, rayCount 120, rangeM 200, `captured_at` 2026-08-27T12:45:25Z). It is rewritten only by `recompute-readings.mjs:129-162`.

### 3.5 Stored precision

| Record | Rounding |
|---|---|
| Canonical readings | `area_m2` 2 dp, `compactness` 4 dp, `occlusivity_m` 2 dp, `enclosure_ratio` 4 dp, `local_x/y` 2 dp, `direction_deg` 2 dp (`SiteViewer.jsx:484-495`) |
| P7 markers | Same as canonical readings (`CloudComparisonPage.jsx:160-170`) |
| P6 field points | `area_m2` 2 dp, `compactness` 5 dp, `occlusivity_m` 2 dp, `enclosure_ratio` 5 dp, normalised `n` 5 dp (`compute-fields.mjs:203, 215-223`) |
| P9 recompute | P6 rounding (`sandbox.js:300-319`) |

Normalisation and fitting run on the rounded stored values.

---

## 4. The two measurement layers

### 4.1 Layer registry

`FOV_MODES = ['perceptual_120', 'perceptual_360', 'perceptual_360_r100', 'field_360']` (`src/lib/analysis/fingerprints.js:63`).

The "120° perceptual" and "360° field" layers in the thesis correspond to:

- `perceptual_120`: P7 markers, P8 stimuli, the P9 precedent probe; the archived P5 source.
- `field_360`: P6 grid, P9 diagnosis and sandbox.
- `perceptual_360`: canonical hand-placed 360° readings. The **live P5 fit** and **the normalisation bounds of the field layer** both come from it.

### 4.2 Where `fov_mode` is set, stored and enforced

**Set:**

| Record type | Value | Where |
|---|---|---|
| Canonical readings | `perceptual_120` or `perceptual_360`, from the viewer's mode toggle | `SiteViewer.jsx:496` |
| P6 field files and index | `field_360` | `compute-fields.mjs:45, 261, 294` |
| P7 markers and file | `perceptual_120` | `CloudComparisonPage.jsx:171`; `viewClouds.js:58-66` |
| P8 bank | `perceptual_120` | `build-matched-view-trials.mjs:213` (constant `matchedView.js:51`) |
| P9 recompute result | `fovMode: 'field_360'` (in-memory) | `sandbox.js:333` |
| P9 precedent probe | `perceptual_120` (in-memory) | `precedent.js:174` |
| P5 output | `fov_mode` of the source | `analyze.mjs:484` |

**Stored:**

- `results.json` records;
- `fields/*.json` and `fields/index.json`;
- `view-clouds.json` (file-level and per-marker);
- `matched-view-trials.json` (bank-level and per-view);
- `analysis-panoramic.json`;
- `rating-validation.json` (`validate-ratings.mjs:536`).

**Enforced:**

- `canonicalReadings` throws on a canonical record with no `fov_mode`, selects **only** the requested layer, and throws on two canonical readings per site per layer or a missing site (`fingerprints.js:72-113`).
- `analyze.mjs` source pairing ties the responses file to the layer (`analyze.mjs:84-102`).
- The self-test gate 4 asserts every reading declares a layer, one canonical reading per site per layer, and that no two layers share identical min **and** max for any metric (`analyze.mjs:310-366`).
- `validateCloudFile` rejects any non-`perceptual_120` file or marker. It runs in the save endpoint (`viewClouds.js:72-90`; `vite.config.js:215-216`).
- `validateTrialBank` rejects a non-`perceptual_120` bank or view (`matchedView.js:113-176`; called at `build-matched-view-trials.mjs:254`).
- The P2 viewer passes `field_360` records through untouched on save and edits one layer at a time (`SiteViewer.jsx:55-56, 437, 466, 507-510`).
- Tests: `test/analysis.test.js:152` (bounds do not coincide across layers); `test/precedent.test.js:155` (120° bounds do not coincide with 360° field bounds).

### 4.3 Normalisation bounds per layer

Bounds are min–max over the 18 active sites' canonical readings in a given layer. Each bound records its site (`fingerprints.js:116-140`). Values are not clamped (`fingerprints.js:142-150`).

| Consumer | Bounds used | How obtained | Values (data) |
|---|---|---|---|
| P5 fit (`perceptual_360`) | `perceptual_360` | Computed in `analyze.mjs:383`; frozen into `analysis-panoramic.json.bounds` | area 3905.37–46656.93 m²; compactness 0.057–0.2031; occlusivity 267.22–622.93 m; enclosure 0.1131–0.3841 |
| P6 field points | **`perceptual_360`** (deliberate cross-layer reuse) | **Recomputed from `results.json` at script run time** (`compute-fields.mjs:129`), not read from `analysis-panoramic.json`; written to `fields/index.json.bounds`; files carry `normalisation_source: 'perceptual_360'` (`compute-fields.mjs:267, 298`) | Identical to the P5 bounds |
| P6 zones | Consume the stored `n` vectors | `compute-zones.mjs:304-312` | — |
| P9 diagnosis and recompute | `fields/index.json.bounds` | `DiagnosePage.jsx:478, 602` | Identical to the P5 bounds |
| P7 clouds, P8 bank, P9 precedent | `perceptual_120` | **Recomputed live** from `results.json` in `buildClouds` (`viewClouds.js:105`); P8 snapshots them into `matched-view-trials.json.source.bounds` (`build-matched-view-trials.mjs:223`); P9 precedent uses `corpus.bounds` from the same call (`precedent.js:192-218, 267`) | area 1759.02–12524 m²; compactness 0.1262–0.6516; occlusivity 110.92–273.46 m; enclosure 0.1121–0.3145 |
| Rating validation | `perceptual_360` | `validate-ratings.mjs:59, 278` | Identical to the P5 bounds |

Sharing:

- **360° perceptual ↔ 360° field:** shared by design (the field layer uses `perceptual_360` bounds).
- **120° ↔ any 360° layer:** never shared in code. Enforced by tests (§4.2).
- **NOT FOUND:** a frozen copy of the `perceptual_120` bounds for P7. Searched `src/data/` and the `analysis-*.json` keys. P7 and the P9 precedent derive them from `results.json` on every load, and the only frozen copy is the P8 bank's snapshot.

**Observed envelope.** `fields/index.json.observed_envelope` holds per-metric min/max of the stored normalised values across all field points (`compute-fields.mjs:168-214, 303`). It is used by P9 Tier A (`DiagnosePage.jsx:405, 445-448`; `zones.js:264-291`) and is not a normalisation bound. Values (data):

| Metric | Min | Max |
|---|---|---|
| area | −0.02505 | 1.57499 |
| compactness | −0.16316 | 2.24504 |
| occlusivity | −0.33271 | 1.44593 |
| enclosure | −0.14232 | 1.60987 |

Field points outside [0, 1] out of 11,719 (data, `fields/index.json.out_of_range`):

| Metric | Points outside [0, 1] |
|---|---|
| area | 764 |
| compactness | 1,631 |
| occlusivity | 1,296 |
| enclosure | 1,331 |

---

## 5. Weight model

Library `src/lib/analysis/`; runner `scripts/analyze.mjs`. The live result is `src/data/analysis-panoramic.json` (source `panoramic`: `survey-responses-360.json` × `perceptual_360`).

### 5.1 Data preparation

**Fingerprint** = the normalised 4-vector of the site's canonical `perceptual_360` reading (`fingerprints.js:153-175`). **DISCREPANCY:** the header comment at `fingerprints.js:1-14` still describes the fingerprint as the 120° reading. The live source is 360° (`analyze.mjs:97`).

**Exclusions** (`exclusions.js:72-121`):

- attention-check triplets;
- a triplet naming a non-active or duplicate site;
- a malformed `chosen_pair`;
- participants who failed or never reached a check, **only if** the instrument administered one, which is decided dataset-wide by `instrumentHasAttentionCheck` (`exclusions.js:50-68`).

The panoramic records have `attention_check_passed: null` and no check triplets, so no participant is excluded. Live inputs (data, `analysis-panoramic.json.inputs`): 46 participants collected and used; 552 triplets collected and used; 0 dropped.

**Per triplet** (`model.js:36-62`): `Δ[p,k] = (x_i,k − x_j,k)²` for pairs p ∈ {(0,1), (0,2), (1,2)} (`model.js:22-26`), plus the index of the chosen pair.

### 5.2 Distance and choice likelihood

From `model.js:83-112` (the header comment at `model.js:7-9` states the same formulas):

```
d²_p = Σ_k w_k · Δ[p,k]                  (squared weighted Euclidean; no square root is taken)
P(p)  = exp(−d²_p) / Σ_{q∈pairs} exp(−d²_q)   (softmax over the triplet's 3 pairs; shifted by max for stability)
NLL   = −Σ_t log max(P_t(chosen_t), 1e-300)
```

- There is no temperature parameter. The weight scale carries sharpness (`model.js:13-17`).
- `w` is the **raw** fitted vector. `weights_normalised = w / Σw` is a reporting transform only (`model.js:164-167`).
- Analytic gradient: `∂NLL/∂w_k = Σ_t [Δ_t[chosen,k] − Σ_p P_t(p)·Δ_t[p,k]]` (`model.js:123-141`).
- Prediction = argmax P (`model.js:144-149`); accuracy = share of correct predictions, chance = 1/3 (`model.js:152-157`; `crossval.js:17`).

Live raw weights (data):

| Metric | Raw | Normalised |
|---|---|---|
| area | 1.81620 | 0.31220 |
| compactness | 1.59914 | 0.27489 |
| occlusivity | 1.20141 | 0.20652 |
| enclosure | 1.20072 | 0.20640 |

NLL 543.94 over n = 552 triplets, `converged: true`.

**Note on downstream scale.** P6, P7, P8 and P9 use the normalised vector, which is the raw vector ÷ 5.8175 (§1.2). Assignments, rankings and k-means partitions are unaffected by that scale. Absolute distance values reported in those phases are in normalised-weight units.

### 5.3 Optimiser

Optimiser: **Adam on θ = log w** (positivity by reparametrisation), with the chain rule `g_θ = g_w · w` (`fit.js:44-95`).

Settings, `DEFAULT_FIT` (`fit.js:11-41`):

| Setting | Value |
|---|---|
| Restarts | 5 |
| Max iterations | 5000 |
| Learning rate | 0.05 |
| β₁, β₂, ε | 0.9, 0.999, 1e-8 |
| Seed | 20260817 |
| `relTolerance` | 1e-8 |
| `patience` | 25 |

**Initialisation** (`fit.js:109-123`): start 1 is θ = 0 (all w = 1); starts 2–5 are θ_k ~ U(−1.5, 1.5) from mulberry32(20260817). With `warmStart`, there is a single start at log(max(w, 1e-12)).

**Convergence** (`fit.js:64-75`): mean NLL per triplet is tracked. If `bestMean − meanNLL < 1e-8` for 25 consecutive iterations, the run stops with `converged = true`. Otherwise it stops at 5000 iterations with `converged = false`. θ is clamped to [−25, 25] after each step (`fit.js:88-89`). The best finite-NLL run across starts is returned (`fit.js:125-130`).

### 5.4 Regularisation

**NOT FOUND.** Searched `src/lib/**/*.js` and `scripts/*` for `regulari|ridge|lambda|penalt|prior` (case-insensitive). The only hit is an eigenvalue variable `lambda` in `src/lib/analysis/projection.js:81-83`. The objective is the unpenalised NLL (`fit.js:61`; `model.js:123-141`). There is no regularisation, on by default or otherwise.

### 5.5 Bootstrap

- **Resampling unit:** participant. For each draw, `ids.length` participants are sampled with replacement and all their triplets concatenated (`resample.js:23-31, 61-67`).
- **Resamples:** `DEFAULT_RESAMPLES = 1000` (`resample.js:15`), or 100 with `--quick` (`analyze.mjs:435`). Live: 1000, 0 failures (data).
- **Fit per draw:** warm start from the full-data raw weights, with the other `DEFAULT_FIT` settings (`resample.js:69`).
- **Seed:** 20260817 (`resample.js:16`).
- **Reported statistics:** mean, median, and 2.5/97.5 percentiles with linear interpolation, on **normalised** weights (`resample.js:33-41, 75, 85-95`). The enclosure-lead statistics (`resample.js:78-83, 97-112`) feed only the superseded H3 block.

Live 95% CIs (data):

| Metric | 95% CI |
|---|---|
| area | 0.197–0.455 |
| compactness | 0.179–0.364 |
| occlusivity | 0.112–0.289 |
| enclosure | 0.116–0.292 |

### 5.6 Cross-validation

**Scheme: leave-one-plaza-out** over the active site ids (`crossval.js:40-78`).

- **Splitting unit:** plaza. A triplet is in the test set of fold s if it names site s. Each triplet therefore appears in 3 test folds.
- **Accuracy:** the unweighted mean of per-fold accuracies (macro-average over folds with non-empty train and test) (`crossval.js:74-75`). Live: 0.5260 over 18 folds (data).
- **Fold fit:** `FOLD_FIT = { restarts: 1, iterations: 5000 }` (`crossval.js:38`), which is a single neutral start (θ = 0), with no warm start from the full fit and all other `DEFAULT_FIT` settings. **DISCREPANCY:** `docs/spec.md` (P5, "Two rules govern cross-validation") says "one neutral start, 300 Adam iterations". The code uses 5000 iterations with the stall rule.

**Area-only baseline:** identical LOPO on triplets with Δ for non-area metrics set to 0 (`crossval.js:86-88`; `fit.js:165-176`). Live: 0.5219 (data).

**Paired comparison:** per fold, full vs. area-only. Two-sided exact sign test over non-tied folds (`crossval.js:93-131`). Live: 9 wins, 6 losses, 3 ties, p = 0.607 (data).

**Permutation test** (`crossval.js:160-189`; parallel runner `analyze.mjs:110-147`; worker `scripts/permutation-worker.mjs:24-26`):

- chosen-pair labels are shuffled across **all** triplets (Fisher–Yates, seed `20260817 + index·7919`), and the full LOPO is re-run with `FOLD_FIT`;
- 1000 permutations (100 with `--quick`);
- `p = (1 + #{null ≥ observed}) / (1 + N)`; `null_95 = sorted[floor(0.95·N)]`.

Live: p = 0.000999, null mean 0.3335 (data).

**Leave-one-metric-out ablation:** LOPO with one metric's Δ zeroed; `drop = full − without` (`ablation.js:20-48`). Live drops (data):

| Metric removed | Drop in accuracy |
|---|---|
| enclosure | 2.34 pp |
| occlusivity | 2.02 pp |
| area | 1.87 pp |
| compactness | 0.54 pp |

**Self-test gate** (`analyze.mjs:192-374`):

1. Synthetic recovery at weight scale 12, 60 participants × 26 triplets, tolerance 0.08.
2. Shuffled-label accuracy within 0.05 of chance, and 6 null datasets × 25 permutations with mean p in (0.2, 0.8) and ≤ 2 below 0.05.
3. Ablation sanity.
4. Layer separation.

### 5.7 Hypotheses and rating validation (as used by the UI)

**Live verdict rules** are in `buildHypotheses` (`hypotheses.js:84-233`); reliability is treated as a precondition (`hypotheses.js:58-82`):

| Hypothesis | Rule |
|---|---|
| H1 | LOPO accuracy > 1/3 and permutation p < 0.05 |
| H2 | Count of scales with Holm p < 0.05 and aligned r > 0 |
| H3 | Occlusivity Holm p ≥ 0.05 and reliability ≥ 0.4 |
| H4 | All bootstrap lower bounds > 0 |
| H5 | "Supported" unless the sign test p < 0.05 with a positive mean delta |

Several evidence strings in `hypotheses.js` are hard-coded rather than computed:

- `hypotheses.js:228`: "area ↔ enclosure r = −0.64; 63.9% of area is reconstructable from the other three";
- `hypotheses.js:178`: the alternative-definitions list.

NOT FOUND: code computing the −0.64 or 63.9% figures. Searched `src/lib/analysis/`, `scripts/`, and `src/pages/WeightsPage.jsx` for `0.64` and `63.9`. **DISCREPANCY:** `docs/spec.md` lists H1–H6; the code implements H1–H5, with a different mapping.

**Rating validation** (`scripts/validate-ratings.mjs`):

- per scale, Pearson and Spearman r between per-plaza mean rating (1–7) and the raw computed metric across plazas;
- aligned by `EXPECTED_SIGN` (occlusivity −1) (`validate-ratings.mjs:65-70, 352-354`);
- permutation p with 20,000 shuffles, Holm correction (`validate-ratings.mjs:110-124, 241-248, 396-397`);
- Fisher CI (`validate-ratings.mjs:130-138`);
- participant bootstrap, 2000 resamples (`validate-ratings.mjs:153-188`);
- split-half reliability, Spearman–Brown corrected, 2000 splits (`validate-ratings.mjs:198-235`).

---

## 6. Field layer and zone typology

### 6.1 Grid sampling

Implemented in `scripts/compute-fields.mjs`:

- **Spacing:** `--spacing`, default **2.5 m** (`compute-fields.mjs:42`). Live: 2.5 (data, `fields/index.json.spacing_m`).
- **Lattice:** anchored to absolute local coordinates. x runs from `ceil(min_x/spacing)·spacing` to `max_x` in steps of `spacing`, and the same for y, over the boundary's bounding box (`compute-fields.mjs:99-118`).
- **Kept if:** the point is inside the plaza boundary (even–odd test, `compute-fields.mjs:59-69, 111`) and is not blocked (`compute-fields.mjs:85-94`).
- **Blocked if:** the point is inside any building's outer ring, or within **`CLEARANCE_M = 1.0` m** of any building edge (`compute-fields.mjs:55`). The edge distance test loops over all edges in `index.edges`; it does not query the spatial grid.
- **Cast:** 360°, 360 rays, 200 m, unflagged, through a per-site edge index (`compute-fields.mjs:178, 184-189`).
- **Sites without a boundary** are skipped (`compute-fields.mjs:174-177`).

Live (data): 11,719 points over 18 sites. Konstablerwache: 988 points inside the boundary, 21 rejected, 967 kept. **DISCREPANCY:** `docs/spec.md` P6 reports 11,580 points. The committed field files were regenerated 2026-09-06 (commit `dac2380`, Theaterplatz boundary change).

### 6.2 Clustering

Implemented in `scripts/compute-zones.mjs`:

- **Data:** the stored normalised 4-vectors `n` from all 18 field files, pooled globally (`compute-zones.mjs:304-312`).
- **Distance:** weighted squared Euclidean `Σ w_k (a_k − b_k)²`, with `w` = `analysis-panoramic.json.fit.weights_normalised` (`compute-zones.mjs:93-100, 301-302`).
- **Algorithm:** Lloyd's k-means with k-means++ seeding under the same weighted distance (`compute-zones.mjs:106-185`).
  - Up to `MAX_ITERS = 100` iterations; stops when no assignment changes (after iteration 0).
  - An empty cluster is re-seeded at the point furthest from its assigned centre.
  - Restarts: `RESTARTS = 10` per k in diagnostics, **20** (`RESTARTS·2`) for the final fit. Each restart is seeded `20260904 + k·1000 + r`, and the lowest inertia wins (`compute-zones.mjs:49, 187-194, 380`).
- **Silhouette:** mean over a seeded sample of 2,500 points (mulberry32(20260904 + k)), with √(weighted d²) as the distance (`compute-zones.mjs:56, 199-238, 251`). Inertia is the sum of weighted d² to the assigned centre (`compute-zones.mjs:182-183`).

**Diagnostics** (`kDiagnostics`, `compute-zones.mjs:243-269`): for every k = 2…12 the script records inertia, silhouette, single-zone plazas and mean zones per plaza. They are computed on every run, including runs with `--k=N` (`compute-zones.mjs:318-325`).

**How k is chosen** (`ruleChoice`, `compute-zones.mjs:285-295`): over k = 2…12, the smallest k with:

- silhouette ≥ peak − 0.04;
- mean zones per plaza ≥ 2.0, where a zone counts if it holds ≥ 5% of the plaza's points;
- at most 5 plazas where one zone holds > `SINGLE_ZONE_SHARE = 0.9` of the points (`compute-zones.mjs:63-89`).

If no k qualifies, the silhouette argmax is used. `--k=N` fits the stated k instead of the rule's choice (`compute-zones.mjs:45, 325`).

**Storage** (`kSelection`, `compute-zones.mjs:335-359`): `zones.json.k_selection` holds the thresholds, the seed, `restarts_per_k`, `silhouette_sample`, `peak_k`, `rule_choice`, `rule_fell_back`, `chosen_k`, `chosen_by`, `total_points`, `generated_at`, and the diagnostics table.

`--diagnostics-only` (`compute-zones.mjs:361-378`) recomputes that block and writes it into the existing `zones.json` without refitting. It refuses to run if the field files' point count no longer matches the stored typology. The P6 page renders the block as a table under "Methods & robustness" (`KSelection`, `src/pages/FieldPage.jsx`).

**Live typology** (data, `zones.json`): k = 5, 11,719 points, restarts 20, seed 20260904, inertia 366.5841.

| Zone | Points | Centre (area, compactness, occlusivity, enclosure) |
|---|---|---|
| 0 | 4,879 | (0.49851, 0.43447, 0.81716, 0.30783) |
| 1 | 1,671 | (0.45388, 1.02019, 0.43921, 0.53569) |
| 2 | 2,158 | (0.15241, 0.56320, 0.25173, 0.95204) |
| 3 | 2,146 | (0.15653, 0.21098, 0.26252, 0.49857) |
| 4 | 865 | (1.16056, 1.07255, 0.17479, 0.11272) |

**DISCREPANCY: the rule does not select the k in use.** The typology was fitted on 2026-09-06 with `--k=5`. The diagnostics for that grid were added on 2026-09-13 with `--diagnostics-only`, which left the fit untouched. On them the rule meets no k and falls back to k = 3: `rule_fell_back: true`, `rule_choice: 3`, `chosen_k: 5`. k = 5 fails only the single-zone criterion, with 6 plazas against a limit of 5. Values are in results doc §5.3.

**Other outputs:**

- **Robustness check:** unweighted k-means (w = [1, 1, 1, 1], 10 restarts) at the chosen k. Agreement = share of points in the unweighted cluster that dominates their weighted cluster (`compute-zones.mjs:381-390`). Live: 0.9605 (data).
- **Zone labels:** rule-based from centre coordinates, e.g. `area > 0.8 → 'Vast'` (`zones.js:36-46`). These are for display and are not part of clustering.
- **Assignment in P9:** nearest frozen centre (5-dp centres from disk) under the same weighted distance (`zones.js:83-94`).

---

## 7. Plaza-level comparison (P7)

### 7.1 Cloud composition

- Each plaza's cloud is its canonical `perceptual_120` reading plus the placed markers from `view-clouds.json`, composed at read time (`viewClouds.js:104-128`). `TARGET_PER_SITE = 8` (`viewClouds.js:43`).
- Markers are cast at 120 rays / 120° / 200 m, unflagged (`ViewCloudEditor.jsx:136-139`). The vantage must be inside the boundary and ≥ 1 m from any footprint edge (`ViewCloudEditor.jsx:34, 116-119`).
- Points are normalised on the `perceptual_120` bounds, unclamped (`viewClouds.js:133-136`).

Live (data): 126 placed markers + 18 canonical = 144 views; `updated_at` 2026-09-06T09:34:40Z.

### 7.2 Chamfer distance

`chamferDistance` (`src/lib/analysis/clouds.js:152-170`):

```
A' = whiten(A, w),  B' = whiten(B, w)          (axis k scaled by √w_k)
chamfer(A,B) = ½ · [ (1/|A|) Σ_{a∈A'} min_{b∈B'} ‖a−b‖₂  +  (1/|B|) Σ_{b∈B'} min_{a∈A'} ‖a−b‖₂ ]
```

- **Directionality:** both directed terms are computed.
- **Symmetry:** symmetric, as the average of the two directed means.
- **Distance:** unsquared Euclidean in the whitened space, i.e. √(Σ w_k Δ_k²).
- **Normalisation:** each directed term is divided by its own cloud's size (mean over points). There is no further normalisation by cloud spread, diameter or corpus scale.
- **Metric properties:** the code comment states it is not a metric (triangle inequality) and is used for ranking and matching only (`clouds.js:149-151`).
- **Matrix:** symmetric, zero diagonal (`clouds.js:276-289`).
- **Directed pairings** (A→B only) are exposed as `matchViews` (`clouds.js:202-213`). The corpus-wide nearest view pairs, excluding same-site pairs, top 15 by default, are `globalNearestViews` (`clouds.js:225-248`).

### 7.3 Centroid and Gaussian alternatives

Both are present and LIVE on the P7 page and in P8 trial construction.

- **Centroid:** `‖mean(A') − mean(B')‖₂` (`clouds.js:96-100`).
- **Gaussian:** 2-Wasserstein between fitted Gaussians in the whitened space (`clouds.js:117-135`):
  - `W₂ = √( ‖μA−μB‖² + max(0, tr ΣA + tr ΣB − 2·tr((ΣA^½ ΣB ΣA^½)^½)) )`;
  - sample covariance with n−1 (`clouds.js:75-87`);
  - matrix square root by Jacobi eigendecomposition, negative eigenvalues floored at 0 (`clouds.js:372-384`; `jacobiEigen` in `projection.js:119`).

### 7.4 Weighted or unweighted

**Weighted.** The weights are `analysis-panoramic.json.fit.weights_normalised` (fitted on `perceptual_360`, applied to 120° data): `CloudComparisonPage.jsx:72, 448-452`. In live data these are [0.31220, 0.27489, 0.20652, 0.20640].

The page also computes:

- an **unweighted** robustness matrix with w = [0.25, 0.25, 0.25, 0.25] for the selected measure, reported as a Spearman rank agreement with the weighted matrix (`CloudComparisonPage.jsx:457-467`);
- the single-point reference matrix: the canonical readings only, as 1-point clouds under `centroid` with the same weights (`CloudComparisonPage.jsx:474-477`).

### 7.5 P8 use of the three measures

**Trial enumeration** (`build-matched-view-trials.mjs:285-359`). For each reference view r in plaza A and each unordered candidate pair (B, C) with B, C ≠ A:

- each candidate is represented by its own view nearest r (whitened Euclidean);
- Chamfer's pick is the candidate with the nearer view;
- centroid's and Gaussian's picks are the candidate plaza with the smaller plaza-level distance to A;
- trials where centroid ≠ Gaussian are discarded;
- the rest are sorted into `agreement` (all three agree) or `discriminating` (Chamfer disagrees with both).

**Margins:** |difference| ÷ that measure's mean scale; `strength = min` of the three margins (`build-matched-view-trials.mjs:183-189, 336-349`).

**Selection:**

- `MIN_STRENGTH = 0.05`;
- `PER_STRATUM = 54`, i.e. 3 trials per reference plaza;
- `BALANCE_WINDOW = 40`;
- agreement trials are drawn from equal-count strength bins; discriminating trials strongest first; greedy least-used candidates within the window; seeded (`build-matched-view-trials.mjs:102-127, 401-486`).

Live bank (data): 108 trials; pool 11,994 agreement / 5,718 discriminating; 1,872 discarded because the cloud measures split.

**Participant block:** `TRIALS_PER_STRATUM = 6`, `BLOCK_LENGTH = 12`, interleaved, with a random left/right side per trial (`matchedView.js:74-75, 228-248`). **DISCREPANCY:** the comments at `matchedView.js:211` and `analysis/matchedView.js:15` say 24 trials; the constant gives 12.

**Analysis** (`src/lib/analysis/matchedView.js`):

- per stratum and predictor: pooled exact binomial vs. 0.5 with a Wilson CI (`:61-90, 182-216`);
- participant-level sign test, ties dropped (`:224-250`);
- exact McNemar, Chamfer vs. centroid and Chamfer vs. Gaussian, on discordant trials (`:102-116, 259-285`);
- accuracy in 4 equal-count margin bins (`:302-332`);
- left-side bias binomial (`:342-350`).

Live responses: 15 session records (data, `matched-view-responses.json`).

---

## 8. Design tool (P9)

The case site is `Konstablerwache-Frankfurt am Main` (`DiagnosePage.jsx:114`).

### 8.1 Diagnosis (field_360)

**Selection:** a disc centred on a click. Default radius 15 m, range 5–60 m. The selection is the set of stored field points within the disc (`DiagnosePage.jsx:119-121, 333-344`).

**Region diagnosis** against an intended zone t (`zones.js:143-183`):

- per point, `contribution_k = w_k·(x_k − c_t,k)²`;
- region terms are the mean of per-point contributions;
- total = Σ terms; share_k = term_k / total;
- signed gap = mean(x_k − c_t,k);
- also reported: on-target share (nearest-centre assignment) and the spread of per-point distances.

**Tier A sensitivity** (`DiagnosePage.jsx:399-450`):

- each metric is shifted by δ ∈ [−1, +1] normalised units in 81 steps, applied uniformly to all selected points, and the share of points assigned to t is reported;
- steps where the selection mean falls outside `observed_envelope` are flagged;
- four combined sliders apply all shifts at once;
- exact single-metric flip distances come from `flipDistance`, which solves the linear inequalities against each rival centre (`zones.js:204-243`).

### 8.2 Preset library

`PRESETS` in `src/lib/presets.js:154-611`. Each preset is a generator from parameters, anchor and rotation to parts `{footprint, base, top, role}`. A part blocks the cast iff `base ≤ 1.6 < top` (`presets.js:37-39`). Parameters are `min / max / step / default`, in metres unless stated.

| id | Parameters | Parts generated | Where |
|---|---|---|---|
| `colonnade` | length 6/80/1/30; depth 2/10/0.5/4; spacing 2/12/0.5/4; height 3/14/0.5/6 | Square columns of side `min(0.6, depth/3)` at `spanPositions(length, spacing)`, base 0, top = height. Roof slab `(length+side) × depth`, base `max(2.0, height−0.6)`, top = height (non-blocking). | `presets.js:155-208` |
| `pergola` | width 3/40/1/10; length 3/40/1/8; height 2.5/8/0.25/3.5; openness 0/100/5/50 % | 0.25 m posts on two rows at v = ±length/2, spaced ~3.5 m along the width, base 0, top = height. Roof `width × length`, base `height−0.2` (non-blocking; openness is render-only). | `presets.js:210-267` |
| `landmark` | size 2/24/0.5/8; height 2/30/0.5/6 | One square solid `size × size`, base 0, top = height | `presets.js:269-299` |
| `treeRow` | length 6/100/1/30; spacing 3/20/0.5/8; clearance 0.3/6/0.1/2.5; canopy_diameter 2/14/0.5/6; canopy_height 3/25/0.5/9 | Per position: 0.4 m trunk, base 0, top = clearance. Octagonal canopy, base = clearance, top = `max(clearance+1, canopy_height)`. The canopy blocks only when clearance ≤ 1.6. | `presets.js:301-352` |
| `lowWall` | length 3/60/1/20; height 0.3/1.2/0.05/0.5; segments 1/8/1/1 | `segments` runs of thickness 0.4 m with 1.2 m gaps; top ≤ 1.2, so never blocking | `presets.js:354-394` |
| `marketRow` | length 6/80/1/30; depth 1.5/8/0.5/3; height 2/5/0.1/2.8; gap_width 0/8/0.25/1 | `floor((length+gap)/(3+gap))` stalls, each 3 m × depth, base 0, top = height | `presets.js:396-442` |
| `plinth` | size 3/40/1/12; height 0.3/4/0.1/0.9; sides_open 0/4/1/2 | Square plinth `size × size`, base 0, top = height (blocks only if > 1.6 m). Up to 4 step treads 0.8 m deep, top `max(0.15, height/2)`. | `presets.js:444-492` |
| `screenWall` | length 3/60/1/14; height 1.8/6/0.1/2.4; perforation 0/80/5/0 % | 0.3 m thick. With no perforation, one solid run. Otherwise 8 bays, each solid for `pitch·(1−open)` with `open ≤ 0.8`. | `presets.js:496-560` |
| `recessedArcade` (subtractive) | length 4/60/1/24; depth 1/8/0.5/3; pier_spacing 2/14/0.5/5 | No parts. Rewrites the host outline (§8.3). | `presets.js:562-610` |

Each preset also carries `expected` sign tags per metric and optional `limitation` strings. These are used by `scripts/validate-presets.mjs`, which places each preset at anchor (−20, 0), rotation 0, and compares mean metrics within a 35 m radius (`validate-presets.mjs:72-78`; `NEGLIGIBLE_SHARE = 0.02`, `presets.js:88`).

### 8.3 Freehand and subtractive edits

Element kinds are resolved by `elementParts` (`presets.js:941-980`) and composed by `composeGeometry` (`sandbox.js:107-183`).

**Freehand mass (additive):**

- created by `makeMass(vertices, height)` with no `kind` field. Coordinates are rounded to 3 dp, and the height slider runs 3–60 m (`sandbox.js:64-71`; `TierB.jsx:73-79`; `DiagnosePage.jsx:1479-1483`);
- `validateMass` requires ≥ 3 finite vertices, height > 0 and polygon area ≥ 1 m² (`sandbox.js:73-93`);
- it becomes one part: base 0, top = `height_m` (`presets.js:972-979`).

**Preset (additive):** `makePresetElement` stores id, params, anchor and rotation. Geometry is regenerated from the params on every read (`presets.js:924-936, 956-960`).

**Recess (subtractive):** `makeRecessElement(facade)` stores the building index, edge index and the parameter t along the edge (`presets.js:908-919`).

- **Host selection:** `nearestFacade` picks the nearest edge ≥ 8 m long on a non-sandbox building ≥ 6 m tall, within 30 m of the click, skipping demolished indices (`presets.js:638-693`; call at `DiagnosePage.jsx:539`).
- **`generateRecess`** (`presets.js:713-814`):
  - finds the inward normal by testing a probe point at mid-edge + 0.5 m;
  - sets `inset = max(0.5, depth)`, so the opening span is `min(length, edgeLen − 2·inset)`, centred at t, and needs ≥ 2 m available;
  - caps the depth at `0.8 × depthBehindSpan` (the shallowest inward hit over 9 samples);
  - emits edges for the surviving facade either side, two return walls and a back wall;
  - adds 0.6 m square piers on the original line at `round(span/pier_spacing)` bays.
- **Composition:** the host's ring is replaced by an explicit `edges` list (`replaceEdge`, `sandbox.js:146-151, 202-205`). The edges inherit the host's height and building index (`isovist.js:156-161`).
- **Limits:** the host footprint used for point-in-polygon tests is unchanged. Loggia floors therefore remain non-standable for the probe (`precedent.js:115-120`), and P6 never sampled them.

**Demolition (subtractive):** `makeDemolition(buildingIndex)` stores an index only (`presets.js:1005-1014`). `composeGeometry` collects demolitions first, applies recesses by index, then filters out demolished buildings last (`sandbox.js:124-129, 170-173`). No new sample points are created on the cleared ground (`sandbox.js:250-263`).

**Point removal:** a field point is dropped if it lies inside a **blocking** part's footprint or within 1 m of its edges (`sandbox.js:40, 264-282, 372-382`). Surveyed buildings are not re-tested.

### 8.4 Before/after computation and metric space

**`recomputeField`** (`sandbox.js:228-336`):

- reuses the stored P6 lattice positions;
- casts 360° / 360 rays / 200 m **height-aware** through the composed geometry;
- normalises with `fields/index.json.bounds` (`perceptual_360`), rounded to 5 dp;
- assigns the nearest frozen centre with normalised P5 weights;
- also returns P9-only `solid_share`, `closed_share` and `solidity`.

It is re-run on every change, debounced by 200 ms (`DiagnosePage.jsx:126, 459-490`).

**Readouts:**

| Readout | Before | After | Where |
|---|---|---|---|
| Zone change map and composition delta (`diffField`, point-for-point by lattice index) | Stored P6 `zones` (unflagged) | Recomputed zones | `sandbox.js:344-368`; `DiagnosePage.jsx:483`; `TierB.jsx:176-274` |
| Region re-diagnosis ("Did it close the gap") | `diagnoseRegion` on stored `n` | `diagnoseRegion` on recomputed `n` of surviving selected points, in the field_360 weighted space | `DiagnosePage.jsx:384-387, 711-720`; `TierB.jsx:281-350` |
| Per-metric table (`MetricEffect`): raw units, mean over the **same surviving points** on both sides | Empty-sandbox height-aware recompute | Recompute with the intervention | `DiagnosePage.jsx:596-647`; `TierB.jsx:373-461` |
| Cell probe | Stored field record | Recomputed record, or `'built-over'` | `DiagnosePage.jsx:657-672`; `probe.js:94-133` |
| Precedent probe (perceptual_120) | — | One 120° height-aware cast at a standable vantage, normalised on live `perceptual_120` bounds, ranked by whitened Euclidean distance with normalised P5 weights against the 144 corpus views, top 5; Konstablerwache's own views excluded by default | `precedent.js:121-129, 153-181, 260-312` |

The per-metric table's percentage change is `(after − before)/before × 100`, displayed as "—" below 0.5% (`DiagnosePage.jsx:631`; `TierB.jsx:442-444`).

**Persistence:**

- scenarios store elements, selection, radius, target zone and a provenance stamp (zones `generated_at`, k, weights, spacing, normalisation source) (`scenarios.js:52-86, 178-186`);
- drift is reported on load (`scenarios.js:195-208`);
- nothing measured is stored.

Live (data): 7 scenarios in `scenarios.json`, all stamped with zones `generated_at` 2026-09-06T00:30:27.887Z, k = 5, the live weights and 2.5 m spacing.

### 8.5 Limitations documented in code

- **Planar eye-height slice:** elements entirely below or above 1.6 m do not register. The UI note comes from `visibilityNote` (`presets.js:9-27, 1054-1067`).
- **Pergola and tree row:** stated limitation that shade and overhead shelter are unmeasurable (`presets.js:223-224, 316-317`).
- **Screen wall lowers enclosure:** a near low surface replaces a far tall one (`presets.js:510-511, 518-525`).
- **Freestanding objects lower occlusivity** under the closed-perimeter definition. Compactness collapses under slender obstacles (`presets.js:58-87`).
- **`solid_share` saturated at this site:** sign only, flagged `diagnostic: false` (`presets.js:94-97`; `DiagnosePage.jsx:644`).
- **`closed_share` penalises fragmentation by piece count:** net (rays spanned − 3) per piece; it is not a coverage measure (`isovist.js:431-445`).
- **Whole plaza recomputed**, with no affected-region approximation (`sandbox.js:14-19`).
- **Demolished footprints leave holes**, with no new samples (`sandbox.js:250-263`).
- **Swallowed points leave the sample.** The UI warns that apparent improvement may be removal of the worst points (`TierB.jsx:339-347, 384-393`).
- **Recess host footprint unchanged for standability** (conservatism) (`precedent.js:115-120`).
- **The recess 3D storey height (4.5 m) is drawing-only** (`presets.js:818-825`).
- **Nearest-facade host rule** (≥ 8 m edge, ≥ 6 m height), introduced after a kiosk edge was selected (`presets.js:625-642`).
- **Precedent ranking is a lookup, not validation.** P8 figures are read live (`precedent.js:29-36, 338-399`).
- **P9 metrics** (`solid_share`, `closed_share`, `solidity`) never enter a fit or corpus file (`isovist.js:485-494`; `sandbox.js:310-313`).

---

## 9. Data model

### 9.1 `src/data/sites.json`: array of sites

There are 23 records, 18 active (data). Fields as read by code (`site.js`, `AdminPage.jsx`, `survey360.js`):

| Field | Type / units | Notes |
|---|---|---|
| `id` | string | Primary key used everywhere, e.g. `"Konstablerwache-Frankfurt am Main"` |
| `name`, `city`, `country` | string | |
| `center_lat`, `center_lng` | degrees WGS84 | Projection origin; required (`site.js:45-49`) |
| `boundary` | GeoJSON Polygon `[lng, lat]` | Outer ring used (`site.js:66-69`) |
| `buildings[]` | array | See next table |
| `default_viewpoint` | `{lat, lng}` | Not the canonical vantage |
| `street_view_image` | path | Also determines the panorama filename (`survey360.js:56-60`) |
| `default_height_m` | m | Height fallback, step 3 (`site.js:14-15`) |
| `excluded` | boolean, optional | `true` removes the site from every stage (`site.js:23-29`) |
| `pano_north_offset_deg` | degrees, optional | Read by `survey360.js:82-92`; absent from all current records (data) |

Each entry in `buildings[]`:

| Field | Type / units | Notes |
|---|---|---|
| `footprint` | GeoJSON Polygon | Only `coordinates[0]` used |
| `osm_height_m` | m or null | From OSM tags |
| `override_height_m` | m or null | Manual pin |
| `manual` | boolean, optional | Hand-drawn footprint |

### 9.2 `src/data/results.json`: canonical readings

Array; 18 `perceptual_120` + 18 `perceptual_360` (data). Written by `SiteViewer.jsx:478-504`.

| Field | Units / type |
|---|---|
| `id` | UUID |
| `site_id`, `site_name` | string |
| `lat`, `lng` | degrees, 6 dp |
| `local_x`, `local_y` | m, 2 dp, local frame |
| `direction_deg` | compass degrees, 2 dp (0 for 360° if unaimed) |
| `area_m2` | m², 2 dp |
| `compactness` | –, 4 dp |
| `occlusivity_m` | m, 2 dp |
| `enclosure_ratio` | –, 4 dp |
| `fov_mode` | `perceptual_120` \| `perceptual_360` |
| `fov_deg` | 120 \| 360 |
| `ray_count` | 120 \| 360 |
| `heading_is_informational` | `true` on 360° only |
| `canonical` | `true` |
| `saved_at` | ISO time |
| `recomputed_at` | ISO time; written by `recompute-readings.mjs:92`; absent in the current file (data) |

There is no `range_m` field. Range is the engine default of 200 m (`SiteViewer.jsx:427-430`).

### 9.3 `src/data/fields/<slug>.json`: P6 field per site

Written by `compute-fields.mjs:258-274`; `k` and `zones` added by `compute-zones.mjs:431`.

**File-level:** `site_id`, `name`, `fov_mode: "field_360"`, `fov_deg: 360`, `ray_count: 360`, `range_m: 200`, `spacing_m`, `clearance_m`, `normalisation_source: "perceptual_360"`, `metrics`, `points_in_boundary`, `points_rejected`, `point_count`, `generated_at`, `k`, `points[]`, `zones[]` (zone index per point, same order).

**`points[]`:** `x`, `y` (m, 2 dp); `area_m2` (m², 2 dp); `compactness` (5 dp); `occlusivity_m` (m, 2 dp); `enclosure_ratio` (5 dp); `n` (normalised 4-vector, 5 dp, unclamped).

### 9.4 `src/data/fields/index.json`

Written by `compute-fields.mjs:292-314`: `generated_at`, `fov_mode`, `spacing_m`, `range_m`, `clearance_m`, `normalisation_source`, `bounds{metric:{min,max,minSite,maxSite}}` (raw units), `observed_envelope{metric:{min,max,minSite,maxSite}}` (normalised units), `metrics`, `total_points`, `out_of_range{metric: count}`, `sites[{site_id, name, file, point_count, points_rejected}]`.

### 9.5 `src/data/zones.json`

Written by `compute-zones.mjs:440-454`: `generated_at`, `k`, `k_selection` (see §6.2 for its fields; in the current file it was added by `--diagnostics-only`), `seed`, `restarts`, `weighted_by{source, weights[4], metrics}`, `normalisation_source`, `total_points`, `centres[k][4]` (normalised units, 5 dp), `counts[k]`, `inertia` (Σ weighted d², 4 dp), `unweighted_agreement` (share, 4 dp), `composition[{site_id, name, point_count, shares[k]}]`.

### 9.6 `src/data/analysis-panoramic.json`

Written by `analyze.mjs:478-559`. The `-n30` file is the same schema, produced with `--limit=30`.

| Field | Contents |
|---|---|
| `analysis_version` | `"1.0.0"` |
| `generated_at` | ISO time |
| `fov_mode` | Source layer |
| `fingerprint_source` | `"computed_geometry_only"` |
| `source{id, label, responses}` | Source pairing |
| `metrics`, `metric_labels` | |
| `seeds{fit, bootstrap, permutation}` | |
| `bounds` | Raw units, with sites |
| `inputs` | Participants and responses collected/used/dropped by reason; `attentionCheckAdministered`, `attentionCheckDiscriminated` |
| `fit{weights (raw), weights_normalised, nll, n, restarts, converged}` | |
| `bootstrap{resamples, failures, per_metric[{mean, median, lo, hi, n}]}` | |
| `crossval{chance, mean_accuracy, per_fold[{site, n, accuracy}], area_only{…}, paired{perFold, wins, losses, ties, meanDelta, signTestP}}` | |
| `permutation{permutations, p, null_mean, null_min, null_max, null_95}` | |
| `ablation{fullAccuracy, results[{metric, label, accuracyWithout, drop, perFold}], ranked}` | |
| `hypotheses{H1, H2, H3}` | Superseded, §1.4 |

### 9.7 `src/data/rating-validation.json`

Written by `validate-ratings.mjs:530-545`.

**Top level:** `generated_at`, `stability_trajectory{metric:[{participants, plazas, r}]}`, `purpose`, `fov_mode`, `responses`, `participants`, `ratings`, `permutation_shuffles`, `reliability_splits`, `scales[]`.

**`scales[]`** (`validate-ratings.mjs:371-393`): `metric`, `label`, `anchors{low, high}`, `expected_sign`, `n_plazas`, `ratings_per_plaza`, `pearson_raw`, `pearson_aligned`, `pearson_ci{lo, hi}`, `pearson_p`, `pearson_p_holm`, `spearman_raw`, `spearman_aligned`, `spearman_p`, `participant_bootstrap{lo, hi, pPositive, draws}`, `reliability`, `reliability_splits`, `disattenuated_pearson`, `per_site[{site_id, name, computed (raw units), normalised, mean_rating (1–7), n_raters}]`.

### 9.8 `src/data/survey-responses-360.json`: live P3 sessions

46 records, all `survey_version: "panoramic_v1"` (data). Written by `SurveyPage.jsx` (session at `:99-126`, triplet answer at `:165-174`, rating at `:194-199`). Upserted on `participant_id` with a stale-revision guard (`vite.config.js:147-158`; `Code.gs:38-109`).

**Session:**

| Field | Contents |
|---|---|
| `participant_id` | UUID |
| `survey_version` | |
| `started_at`, `updated_at`, `finished_at` | ISO time |
| `status` | `in_progress` \| `completed`; `abandoned` is derived after 30 min (`session.js:11-19, 60-68`) |
| `revision` | int |
| `attention_check_passed` | `null` on this instrument |
| `background` | `"yes"` \| `"no"` |
| `age_group` | string |
| `stimulus{kind: "equirectangular_panorama", hfov_deg: 75, pitch_limit_up_deg: 12, pitch_limit_down_deg: 9, zoom_enabled, autorotate}` | |
| `rated_site_ids[]` | |
| `anchor_directions{scale: "low_left" \| "high_left"}` | |
| `tasks[]` | |
| `responses[]` | Triplet answers |
| `rating_responses[]` | Ratings |

**`responses[]`:** `participant_id`, `triplet_id` (`"<pid>:<order>"`), `order` (0–11), `site_a`, `site_b`, `site_c`, `chosen_pair[2]`, `is_attention_check` (false), `shown_at`, `answered_at`, `duration_ms` (ms), `timestamp`.

**`rating_responses[]`:** `participant_id`, `site_id`, `scale` (area \| compactness \| occlusivity \| enclosure), `value` (integer 1–7, canonical direction: 1 = `low` anchor, `survey360.js:149-177, 200-202`), `presentation_order`, `anchor_direction`, `task_type: "semantic_differential"`, `shown_at`, `answered_at`, `duration_ms`.

**Google Sheet row** (`Code.gs:59-89`): `timestamp`, `participant_id`, `started_at`, `finished_at` (Europe/Berlin display), `status`, `attention_check_passed`, `background`, `age_group`, `response_count`, `survey_version`, `median_seconds`, `rating_count`, `rated_sites`, `rated_site_ids`, `anchor_directions`, `payload_json` (the authoritative full record).

### 9.9 `src/data/survey-responses.json`: archived static-photo study

56 session records, 1,387 triplet responses (data). Session fields: `participant_id`, `started_at`, `updated_at`, `finished_at`, `status`, `revision`, `attention_check_passed` (boolean), `background`, `age_group`, `responses[]`. Response fields: `participant_id`, `triplet_id`, `order`, `site_a`, `site_b`, `site_c`, `chosen_pair`, `is_attention_check`, `timestamp`.

It is read only by `analyze.mjs --source=archive` and `test/analysis.test.js:40`. **DISCREPANCY:** `src/lib/surveyEndpoint.js:9-10` describes "1,213 sessions". The file holds 56 sessions.

### 9.10 `src/data/view-clouds.json`: P7 markers

**File-level** (`viewClouds.js:58-66`): `fov_mode: "perceptual_120"`, `fov_deg: 120`, `ray_count: 120`, `range_m: 200`, `target_per_site: 8`, `updated_at`, `markers[]`.

**Marker** (`CloudComparisonPage.jsx:154-176`): `id`, `site_id`, `site_name`, `lat`, `lng` (6 dp), `local_x`, `local_y` (m, 2 dp), `direction_deg` (2 dp), `area_m2`, `compactness`, `occlusivity_m`, `enclosure_ratio` (reading rounding), `fov_mode`, `fov_deg`, `ray_count`, `range_m`, `placed_at`.

### 9.11 `src/data/matched-view-trials.json`: P8 frozen bank

Written by `build-matched-view-trials.mjs:209-252`.

**Bank-level:** `version: "matched_view_v1"`, `generated_at`, `seed`, `fov_mode`, `source{weights, weights_from, view_clouds_updated_at, marker_count, site_count, views_per_site, bounds (perceptual_120, raw units)}`, `scales{view, centroid, gaussian}` (mean distances, whitened units), `selection{min_strength, balance_window, per_stratum, per_site, agreement_rule, discriminating_rule}`, `pool{agreement, discriminating, agreement_below_floor, discriminating_below_floor, cloud_measures_split}`, `trials[]`.

**Trial** (`build-matched-view-trials.mjs:525-540`): `trial_id` (`"ref:refIndex:B:C"`), `stratum`, `reference` view, `candidates[2]` views, `predictions{centroid, gaussian, chamfer: "a" \| "b"}`, `view_distances[2]` (whitened Euclidean), `margins{view, centroid, gaussian}` (÷ scale), `strength` (min margin).

**View** (`:505-523`): `site_id`, `site_name`, `view_index` (0 = canonical), `origin`, `local_x`, `local_y`, `direction_deg`, `area_m2`, `compactness`, `occlusivity_m`, `enclosure_ratio`, `fov_mode`, `fov_deg`, `range_m`.

### 9.12 `src/data/matched-view-responses.json`: P8 sessions

15 records (data). Written by `MatchedViewSurvey.jsx:98-175`.

**Session:** `participant_id`, `survey_version`, `task: "matched_view_2afc"`, `started_at`, `updated_at`, `finished_at`, `status`, `revision`, `background`, `bank_version`, `bank_generated_at`, `stimulus{kind: "rendered_massing_view", fov_deg: 120, eye_height_m: 1.6, textures: false}`, `responses[]`.

**Response:** `participant_id`, `trial_id`, `order`, `stratum`, `reference_site`, `candidate_a_site`, `candidate_b_site`, `chosen_side` (`a` \| `b`, bank identity), `left_side`, `predictions` (as live when answered), `shown_at`, `answered_at`, `duration_ms`, `timestamp`.

**Sheet row** (`MatchedView.gs`): `timestamp`, `participant_id`, `started_at`, `finished_at`, `status`, `background`, `answer_count`, `agreement_count`, `discriminating_count`, `chamfer_agreement`, `chamfer_discriminating`, `median_seconds`, `survey_version`, `bank_version`, `payload_json`.

The renderer uses `verticalFov(120, aspect)` at 1.6 m eye height, far plane 220 m (`ViewRender.jsx:43-45, 63`; `viewGeometry.js:25-29`).

### 9.13 `src/data/scenarios.json`: P9

**File:** `version: 1`, `updated_at`, `scenarios[]` (`scenarios.js:40-44`).

**Scenario** (`scenarios.js:52-86`): `id`, `name`, `note`, `site_id`, `created_at`, `updated_at`, `elements[]`, `selection{x, y}` (m, 2 dp) or null, `radius_m`, `target_zone` (index or null), `provenance{zones_generated_at, zone_count, weights, field_spacing_m, normalisation_source}`.

**Element kinds:**

| Kind | Fields | Where |
|---|---|---|
| Preset | `{id, kind: "preset", preset, params{…}, anchor{x, y} (m), rotation_deg, placed_at}` | `presets.js:927-935` |
| Recess | `{id, kind: "recess", preset: "recessedArcade", params, building (index into the site's projected building list), edge (index into its ring), t (0–1), placed_at}` | `presets.js:909-918` |
| Demolition | `{id: "demolish-<index>", kind: "demolish", building, drawn_at}` | `presets.js:1006-1013` |
| Freehand mass | `{id, footprint[{x, y}] (m, 3 dp), height_m, drawn_at}`, with no `kind` | `sandbox.js:64-71` |

Browser storage uses the same element shapes under `localStorage["sf-p9-sandbox-v1"] = {version: 1, elements}` (`sandboxStore.js:19-31`).

### 9.14 In-memory P9 recompute point (not persisted)

From `sandbox.js:302-319`: `x`, `y`, `index` (into the P6 lattice), `area_m2`, `compactness`, `occlusivity_m`, `enclosure_ratio` (P6 rounding), `solid_share`, `closed_share`, `solidity` (5 dp, P9 only), `n` (5 dp), `zone`.

### 9.15 `test/fixtures/canonical-120.golden.json`

`_comment`, `captured_at`, `fov: 120`, `rayCount: 120`, `rangeM: 200`, `readings[18]{site_id, local_x, local_y, direction_deg, area (m²), perimeter (m), compactness, occlusivity (m), enclosureRatio}`, full precision. Re-cut only by `recompute-readings.mjs:129-162`.
