# Spatial Fingerprinting

**Spatial Fingerprinting: A Perceptually Calibrated Metric Framework for the Diagnosis and Targeted Redesign of Public Plazas**

Master's thesis in urban design by **Tarek Ahmed**. Supervisors: **Reinhard König** and **Martin Bielik**.

**Live app:** https://tarekmatarawi.github.io/Spatial-Fingerprinting/

This repository is the thesis's research platform. It asks whether four geometric measures, computed from building footprints and heights, capture how people actually perceive public plazas — and, where they do, how that can be used to diagnose a real square and test design changes to it.

## The idea in brief

From any standing point in a plaza, the platform casts sight lines to the surrounding buildings and measures four things about what can be seen:

| Metric | What it measures |
| --- | --- |
| **Isovist area** | How much ground is visible from the point |
| **Compactness** | How regular the visible shape is (4πA / P²) |
| **Closed perimeter** | Metres of continuous building facade in view |
| **Enclosure index** | The mean angle the surrounding buildings rise to, as a share of 90° |

Together these four numbers are a plaza's *spatial fingerprint*. A perceptual survey calibrates how much each one matters to people, and the calibrated fingerprint then drives a zone typology and a design diagnostic.

## What the study found

Eighteen German plazas in ten cities, 46 survey participants, 552 similarity judgements and 2,972 ratings. Every figure below is read from the stored analysis files and shown on the `#/weights` page.

| | Hypothesis | Verdict |
| --- | --- | --- |
| Precondition | Each rating scale reaches a split-half reliability of at least .40 | Met |
| H1 | Weighted distance in the metric space predicts which two of three plazas people judge most similar at a rate above chance | Supported (52.6% vs 33.3% chance) |
| H2 | Each metric corresponds to observers' own ratings of the matching quality | Partially supported (3 of 4) |
| H3 | Where a metric does not match its rating scale, the mismatch is systematic and not due to inconsistent ratings | Supported |
| H4 | The fitted model gives every metric a weight above zero | Supported |
| H5 | The combined four-metric model outperforms isovist area alone | Not statistically supported, in the predicted direction |

Fitted weights (they sum to 1): isovist area 0.312, compactness 0.275, closed perimeter 0.207, enclosure index 0.206.

## The nine phases

Each phase is a page in the app. P1–P4 form **Setup**, P5–P8 **Analysis**, and P9 the **Design Tool**.

| | Phase | Route | What it does |
| --- | --- | --- | --- |
| **P1** | Site Register | `#/sites` | 23 site records (18 in the study), entered from OpenStreetMap footprints with checked heights |
| **P2** | Spatial Analysis — 3D Viewer | `#/viewer` | 3D model of each plaza; click to place a viewpoint and read the four metrics live |
| **P3** | Perceptual Survey — Panoramic | `#/survey` (participants: `?survey`) | Participants pick which two of three plaza panoramas feel most alike, then rate each plaza on four scales |
| **P4** | Survey Results Dashboard | `#/results` | Response quality and pooled pair coverage |
| **P5** | Weight Fitting & Hypothesis Testing | `#/weights` | Maximum-likelihood weights with bootstrap intervals, cross-validation, ablation and the hypothesis tests |
| **P6** | Isovist Field Mapping & Zone Typology | `#/field` | 11,719 grid points across the 18 plazas, clustered into five zone types that serve as a reference for diagnosing and comparing places within and across plazas |
| **P7** | View-Cloud Comparison | `#/cloud-comparison` | Each plaza as a cloud of eight views (144 in all), compared by centroid, Gaussian and Chamfer distance |
| **P8** | Matched-View Validation Survey | `#/matched-view` (participants: `?matched-view-survey`) | Do people agree with the view pairs the framework calls similar? Complete: 15 participants, 180 judgements |
| **P9** | Design Diagnostic & Intervention | `#/diagnose` | Konstablerwache, Frankfurt: diagnose an area against a zone type, draw interventions and watch the zone map change; nine saved scenarios |

## Two field-of-view layers

Metrics are computed under two conventions that give **non-interchangeable** values, and keeping them apart is a correctness rule:

- **360°, all round** — what surrounds a standing point. The panoramic survey is fitted against 360° readings at each plaza's panorama point (`perceptual_360`), and the P6 grid samples 360° readings across every plaza (`field_360`), normalised on the P5 bounds so the fitted weights apply.
- **120°, directional** — what a person sees facing one way (`perceptual_120`). Used for view clouds, the matched-view survey and the P9 precedent lookup.

Every metric record carries an explicit `fov_mode`, and 120° and 360° values never share bounds or appear in the same distance calculation.

## Running locally

You need [Node.js](https://nodejs.org/) 22 or later.

```bash
npm install
npm run dev
```

Open the printed address (usually `http://localhost:5173/Spatial-Fingerprinting/`).

Saving — new sites, view-cloud markers, P9 scenarios, local survey responses — works only while `npm run dev` is running. The published site is read-only.

## Commands

```bash
npm run dev       # development server, with the data-saving endpoints
npm run build     # production build into dist/
npm test          # engine, analysis and data-integrity tests (Node's built-in runner)
npm run lint      # oxlint
```

Analysis steps. Each writes a file the app then only reads. The P5 weights, the P6 zones and the P8 trial bank are **frozen**: re-running them changes every number downstream, so only do it deliberately.

```bash
npm run analyze               # P5 weight fit → src/data/analysis-panoramic.json
npm run validate:ratings      # P5 ratings vs computed metrics → src/data/rating-validation.json
npm run fields                # P6 360° grid over every plaza → src/data/fields/
npm run zones                 # P6 zone typology → src/data/zones.json
npm run trials:matched-view   # P8 trial bank (do not rebuild: it would mark collected sessions stale)
npm run matched-view:selftest # P8 check: recover a planted answer, hold test size under the null
npm run validate:presets      # P9 intervention presets behave as documented
npm run sync:survey           # copy P3 responses from the Google Sheet into src/data/
npm run recompute:readings    # re-derive stored readings after a deliberate engine change
```

## Survey storage

The P3 survey saves each answer as it is given to a Google Sheet, through the Apps Script in `google-apps-script/Code.gs` (setup: [docs/survey-storage-setup.md](docs/survey-storage-setup.md)). Each participant has one row, updated as they go; new participants are added below the existing ones. `npm run sync:survey` copies the Sheet into `src/data/survey-responses-360.json` for analysis. P8 responses were collected through the development server into `src/data/matched-view-responses.json`.

## Project structure

All data lives in `src/data/`: survey responses in `survey-responses-360.json` (P3) and `matched-view-responses.json` (P8); site data and readings in `sites.json`, `results.json` and `fields/`; frozen analysis outputs in `analysis-panoramic.json`, `rating-validation.json`, `zones.json` and `matched-view-trials.json`.

```
src/
  pages/              one page per phase
  components/         3D scene, plans, charts, survey and P9 panels
  lib/
    isovist.js        the ray-casting engine and the four metrics
    analysis/         P5–P8 statistics: fitting, cross-validation, bootstrap, hypotheses
    zones.js          P6 zone assignment and P9 diagnosis
    sandbox.js        P9 intervention geometry and field recompute
    phases.jsx        the phase registry: codes, names, routes
  data/               sites, readings, survey responses, frozen analysis outputs, scenarios
scripts/              the analysis and data-generation commands above
test/                 tests, including a golden snapshot of the engine's canonical readings
google-apps-script/   survey storage for P3, and the undeployed P8 equivalent
docs/
  spec.md             the phased build specification and the record of decisions
  handoff/            thesis reference: methods, results, survey protocol, decision log
```

## Documentation

- [docs/spec.md](docs/spec.md) — what each phase does and why, decision by decision
- [docs/handoff/](docs/handoff/) — reference for the thesis write-up: methods, verified results, survey protocol, decision log, and the closed perimeter metric

## Deployment

Every push to `main` builds the app and publishes it to GitHub Pages through GitHub Actions (`.github/workflows/deploy.yml`).
