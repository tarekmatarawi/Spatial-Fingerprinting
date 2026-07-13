# Product

## Register

product

## Platform

web

## Users

The primary user is the researcher building this platform for their own master's thesis: the person entering the 18 sites' geometry, driving the 3D viewer, running the isovist engine, and eventually reading the results dashboard. This is a working instrument used repeatedly by one expert operator, not a general audience — density and precision can outrank hand-holding on these surfaces.

Two secondary audiences exist on very different surfaces. Anonymous survey participants (Phase 4) land on a single triplet-comparison task with zero context and no login — a one-shot, public-facing experience that needs to feel effortless rather than instrument-grade. Thesis reviewers or committee members may view the results dashboard (Phase 6) or watch the tool demoed, so that surface should read as credible and legible to someone seeing it for the first time.

## Product Purpose

A research web platform testing whether geometric isovist metrics (area, compactness, occlusivity, enclosure ratio) computed from building footprints predict how people actually perceive the spatial similarity of public plazas. It carries the full pipeline: manual data entry of 18 real European plazas' geometry, a 3D viewer for each site, a ray-casting isovist engine, a perceptual triplet survey, maximum-likelihood weight fitting against survey responses, and a results dashboard with clustering and hypothesis tests. Success is a defensible thesis result — accuracy of the geometry engine matters more than speed of delivery.

## Positioning

The fastest, most accurate path from raw OSM building footprints to a defensible isovist metric — a precise personal research instrument built for one thesis, done right, not a general-purpose GIS or survey tool.

## Brand Personality

Architectural and drafting-plan in sensibility: the platform should feel like it belongs next to plan drawings and section cuts, not next to a SaaS dashboard. Editorial restraint over software-generic chrome — line weight, figure-ground clarity, and a calm, confident precision carry the personality instead of decoration. The tone is quietly rigorous, never playful or salesy, even on the participant-facing survey screen where the task itself should feel simple even if the instrument behind it is exacting.

## Anti-references

Not a generic SaaS dashboard — no card grids, gradient accents, hero-metric tiles, or tiny uppercase eyebrows above every section. Not a consumer map app — no playful pins, rounded map balloons, or cartoonish markers, even though the app deals in maps and geometry. Not a spreadsheet-in-a-browser — the admin data-entry page carries real structure and hierarchy already; keep it that way rather than letting it flatten into dense, unstyled CRUD tables as more phases get added.

## Design Principles

Precision over decoration: every visual choice should read as instrument-grade accuracy, echoing the project's own standard that geometry correctness outranks visual polish — so decoration never gets to imply a confidence the underlying data doesn't have.

One tool, two densities: the researcher's working surfaces (admin, viewer, dashboard) can be dense and information-rich; the moment a screen is participant-facing (the survey), strip it down to a single, unambiguous task with no leftover instrument chrome.

Plan-view sensibility, not app-generic: draw from architectural drafting conventions — line weight, restrained palette, figure-ground clarity — before reaching for default dashboard patterns like cards or colored status pills.

Show the data, don't decorate it: metrics, coordinates, and geometry states (OSM / default / pinned height, boundary set or not) must stay legible and directly visible, never buried behind icons or ornament standing in for information.

Design only the current phase: the build is gated phase-by-phase with validation checkpoints; don't pre-design surfaces for phases that haven't been reached yet (e.g. no survey or dashboard visual work before Phase 4/6 are unblocked).

## Accessibility & Inclusion

No formal accessibility target was requested. Apply general good practice as a baseline regardless (sufficient color contrast, semantic HTML, keyboard-operable controls) but do not treat WCAG conformance, reduced-motion alternatives, or color-blind-safe encoding as committed requirements unless the user asks for them later.
