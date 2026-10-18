# Project Guidelines

**This project is the "Spatial Fingerprinting" master's thesis platform — see [docs/spec.md](docs/spec.md) for the phased build plan and the record of every decision taken. All nine phases are built (P1 site register, P2 3D viewer + ray-casting engine, P3 perceptual survey, P4 survey results dashboard, P5 weight fitting, P6 isovist field mapping, P7 view-cloud comparison, P8 matched-view validation survey, P9 design diagnostic & intervention). The work now is refinement, data collection and the thesis write-up, not new phases.**

Before changing anything that feeds a later phase, respect what is frozen:

- **P5 weights and normalisation bounds** (`src/data/analysis-panoramic.json`) are reused by P6–P9. Refitting changes every downstream number.
- **P6 zone centres** (`src/data/zones.json`) are what P9 diagnoses against. k = 5 is kept deliberately even though the stored selection rule now falls back (see spec, P6).
- **The P8 trial bank** (`src/data/matched-view-trials.json`) must not be rebuilt: the 15 collected sessions would be marked stale.
- **Scenarios** (`src/data/scenarios.json`) store what was drawn, never results. Loading one restores its elements, target zone and the selection circle (centre and radius) it was aimed at.

Thesis-facing reference material lives in [docs/handoff/](docs/handoff/): methods, verified results, survey protocol, and a decision log. Known open issues are listed there (P8 storage endpoint not deployed; compactness and closed perimeter rating correlations not yet settled at n = 46). There is one hypothesis set — a precondition and H1–H5, derived in `src/lib/analysis/hypotheses.js` — and P8 is complete with 15 participants. When quoting a number, check it against the data files or re-run the app's own library functions — not against prose in the spec, which can lag the code.

You are helping a student from an urban design university studio build a simple web app. They are not professional developers. Explain each step in simple terms as you go. Make development experience as simple and enjoyable as possible.

## Stack

- **Vite** — build tool and dev server
- **React** — UI framework
- **JavaScript** — language (no TypeScript)
- **shadcn/ui** — UI components
- **react-icons** — icons
- **Three.js / React Three Fiber** — 3D graphics (only if needed)
- **npm** — package manager
- **GitHub Pages** — deployment via GitHub Actions, automatic on push to `main`
- **README.md** — clear documentation for setup and usage
- **.gitignore** — ignore node_modules, dist, .env, .DS_Store, etc.

Backend (only if absolutely necessary):

- **Hono** — API server
- **SQLite (via better-sqlite3)** — database

## Design Context

See [PRODUCT.md](PRODUCT.md) for the full design brief. Quick summary: **product** register, **web** platform. Personality is architectural / drafting-plan / editorial — not a generic SaaS dashboard, not a consumer map app, not a spreadsheet-in-a-browser. The researcher's own surfaces (admin, viewer, dashboard) can be dense; the participant-facing surveys (P3 and P8) must stay to a single, unambiguous task. No DESIGN.md yet — run `/impeccable document` once the visual system is worth capturing.
