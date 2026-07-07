# Spatial Fingerprinting

A research web platform for a master's thesis in urban design. It studies how the *geometry* of public plazas relates to how people *perceive* them:

1. **18 real European plazas** stored as building footprints + heights, viewable as 3D models
2. **Isovist metrics** — click any point in a plaza to compute isovist area, compactness, occlusivity, and enclosure ratio from that spot
3. **Perceptual survey** — participants judge which two of three plazas feel most spatially similar
4. **Weight fitting** — maximum-likelihood estimation of how much each metric contributes to perceived similarity, with bootstrap CIs, cross-validation, and permutation tests
5. **Results dashboard** — fitted weights, hypothesis tests, and clustering

The full build plan lives in [docs/spec.md](docs/spec.md). Development proceeds in phases with validation gates between them.

## Current status

| Phase | Status |
| --- | --- |
| 1 — Data model + admin data-entry page | ✅ built — now being populated with real site data |
| 2 — 3D site viewer | ⏳ prototype exists (Weimar demo tab); per-site version pending Phase 1 gate |
| 3 — Isovist ray-casting engine | ⏳ prototype exists (360° version in the demo); 120° cone + metrics pending |
| 4 — Survey module | not started |
| 5 — Weight fitting | not started |
| 6 — Results dashboard | not started |

## Running locally

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173/Spatial-Fingerprinting-/`).

- **Site Data tab** — enter building footprints (GeoJSON pasted from OpenStreetMap) and heights for each of the 18 sites. Saving writes to `src/data/sites.json` (dev server only).
- **3D Viewer tab** — the Weimar workshop prototype: live OSM data, orbit/pan/zoom, click the ground for a 360° isovist.

## Project structure

```
src/
  data/sites.json      the 18 sites: metadata, boundary, buildings (Phase 1)
  pages/AdminPage.jsx   data-entry UI (Phase 1)
  components/           3D scene components (Buildings, Streets, Ground, isovist overlay)
  lib/
    geo.js              lat/lng → local meters projection
    geojson.js          parsing pasted OSM GeoJSON exports
    isovist.js          radial ray-casting engine
    overpass.js         live OSM fetching (Weimar demo only)
docs/spec.md            the phased build specification
```

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds the app and publishes it to GitHub Pages (enable once under repo **Settings → Pages → Source: GitHub Actions**).
