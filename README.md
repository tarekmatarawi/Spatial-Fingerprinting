# Spatial Fingerprinting

A research web platform for a master's thesis in urban design. It studies how the *geometry* of public plazas relates to how people *perceive* them:

1. **18 real European plazas** stored as building footprints + heights, viewable as 3D models
2. **Isovist metrics** — click any point in a plaza to compute isovist area, compactness, occlusivity, and enclosure ratio from that spot
3. **Perceptual survey** — participants judge which two of three plazas feel most spatially similar
4. **Weight fitting** — maximum-likelihood estimation of how much each metric contributes to perceived similarity, with bootstrap CIs, cross-validation, and permutation tests
5. **Zone typology and design application** — isovist fields sampled across each plaza, clustered into zone types, and used to diagnose and test a real design intervention

The full build plan lives in [docs/spec.md](docs/spec.md). Development proceeds in phases with validation gates between them.

## The nine phases

| | Phase | Route | Status |
| --- | --- | --- | --- |
| **P1** | Site Register | `#/sites` | ✅ built — all 18 sites populated |
| **P2** | Spatial Analysis — 3D Viewer | `#/viewer` | ✅ built — ray-casting engine validated |
| **P3** | Perceptual Survey — Views | `#/survey` (participants: `?survey`) | ✅ built — collecting responses |
| **P4** | Survey Results Dashboard | `#/results` | ✅ built |
| **P5** | Weight Fitting & Hypothesis Testing | `#/weights` | to build |
| **P6** | Isovist Field Mapping & Zone Typology | `#/field` | to build |
| **P7** | View-Cloud Comparison | `#/cloud-comparison` | to build |
| **P8** | Matched-View Validation Survey | `#/matched-view` (participants: `?matched-view-survey`) | to build |
| **P9** | Design Diagnostic & Intervention | `#/diagnose` | to build |

P1–P4 form **Setup**, P5–P8 **Analysis**, and P9 the **Design Tool** — the grouping used in the app's navigation. The order above is the build order and does not change.

## Two field-of-view layers

Metrics are computed under two conventions that produce **non-interchangeable** values, and keeping them apart is a correctness requirement:

- **Perceptual layer** — 120°, directional. What a person sees facing a direction. Used for survey stimuli, weight fitting, view clouds.
- **Field layer** — 360°, omnidirectional. An intrinsic property of a location. Used for grid field mapping and zone typology.

Every metric record carries an explicit `fov_mode`, the two layers never share normalisation bounds, and they never appear in the same distance calculation.

## Running locally

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173/Spatial-Fingerprinting/`).

- **P1 Site Register** — enter building footprints (GeoJSON pasted from OpenStreetMap) and heights. Saving writes to `src/data/sites.json` (dev server only).
- **P2 Spatial Analysis** — orbit/pan/zoom the 3D model, click to place a vantage point, click again to aim it, and read the four metrics live.
- **P3 Perceptual Survey** — preview the participant survey and copy its shareable link.
- **P4 Survey Results Dashboard** — response quality and pooled pair coverage, read live from disk while the dev server runs.

The save/read endpoints are dev-server middleware only; they do not exist on the deployed static site.

## Commands

```bash
npm run dev      # dev server with the data-writing endpoints
npm run build    # production build
npm run lint     # oxlint
npm test         # geometry engine regression + correctness tests
```

`npm test` uses Node's built-in test runner — no test dependencies. It locks the 120° perceptual layer against a golden snapshot of all 18 canonical readings, so the geometry underneath the survey cannot change unnoticed.

## Project structure

```
src/
  data/sites.json            the 23 site records (18 active, 5 excluded)
  data/results.json          the 18 canonical 120° readings
  data/survey-responses.json collected survey sessions
  pages/                     one page per phase station
  components/                3D scene, isovist overlay, coverage panel
  lib/
    phases.jsx               the phase registry — single source of truth for codes, names, groups
    geo.js                   lat/lng → local metres projection
    geojson.js               parsing pasted OSM GeoJSON exports
    isovist.js               the unified ray-casting engine (120° and 360°)
    site.js                  site projection, active/excluded filtering
    triplets.js              survey triplet sampling
    coverage.js              pooled pair coverage
    session.js               session status and attention-check reading
test/                        geometry regression tests + golden fixture
docs/spec.md                 the phased build specification
```

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds the app and publishes it to GitHub Pages (enable once under repo **Settings → Pages → Source: GitHub Actions**).
