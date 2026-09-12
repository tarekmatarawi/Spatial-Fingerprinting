import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuCrosshair, LuInfo } from 'react-icons/lu'

import sites from '@/data/sites.json'
import zonesFile from '@/data/zones.json'
import fieldIndex from '@/data/fields/index.json'
import readings from '@/data/results.json'
import cloudFile from '@/data/view-clouds.json'
import trialBank from '@/data/matched-view-trials.json'
import { Figure } from '@/components/Figure'
import { PlazaPlan } from '@/components/PlazaPlan'
import { CellProbePanel, IsovistOutline, ProbeMarker } from '@/components/CellProbe'
import { Boundary } from '@/components/Boundary'
import { PrecedentPanel } from '@/components/PrecedentPanel'
import { DiagnoseMethods } from '@/components/DiagnoseMethods'
import { ScenarioPanel } from '@/components/ScenarioPanel'
import scenarioFile from '@/data/scenarios.json'
import { scenarioProvenance } from '@/lib/scenarios'
import { buildCorpusViews, precedentEvidence } from '@/lib/precedent'
import { analyseMatchedView } from '@/lib/analysis/matchedView'
import { useMatchedViewResponses } from '@/lib/matchedViewData'
import { clearSandbox, loadSandbox, saveSandbox } from '@/lib/sandboxStore'

// Three.js is heavy and only the 3D review panel needs it, so it arrives when
// the researcher switches to it rather than in the page's own chunk.
const SandboxScene = lazy(() =>
  import('@/components/SandboxScene').then((m) => ({ default: m.SandboxScene }))
)
import {
  CompositionDelta,
  MassPanel,
  MetricEffect,
  SandboxDiagnosisCompare,
  ViewToggle,
} from '@/components/TierB'
import {
  ACCENT,
  COOL,
  FAINT,
  GRID,
  INK,
  MONO,
  MUTED,
  NEG,
  OK,
  RULE,
  SANS,
  TYPE,
} from '@/components/charts/tokens'
import { METRICS, METRIC_LABELS } from '@/lib/analysis/fingerprints'
import { activeSites, corpusWindowRadius, pointsCentre, projectSite } from '@/lib/site'
import {
  allParts,
  composeGeometry,
  diffField,
  makeMass,
  recomputeField,
  validateMass,
} from '@/lib/sandbox'
import { cellIsovist, findCell, readCell } from '@/lib/probe'
import {
  ElementList,
  MetricCaveats,
  ParamSliders,
  PresetPicker,
  ToolTabs,
} from '@/components/PresetPanels'
import {
  MIN_FACADE_HEIGHT_M,
  MIN_FACADE_LENGTH_M,
  PRESETS,
  SOLID_SHARE_NOTE,
  defaultParams,
  describeElement,
  makePresetElement,
  partBlocks,
  makeRecessElement,
  makeDemolition,
  buildingAt,
  nearestFacade,
  presetById,
} from '@/lib/presets'
import {
  ZONE_COLOURS,
  assignZone,
  decompose,
  denormalise,
  diagnoseRegion,
  zoneNames as describeZones,
} from '@/lib/zones'

// P9 — Design Diagnostic & Intervention.
//
// Everything before this phase describes places that exist. This one asks a
// different question: a designer intends a part of a plaza to have a particular
// spatial character, and wants to know how far the space as built is from that
// intention, and which of the four measured dimensions is responsible.
//
// THE DIAGNOSIS IS ABOUT ZONE TYPES, NOT PLAZAS. Assigning one label to a whole
// square was cut from scope in P6, on this project's own evidence: a single
// plaza produces materially different readings depending on where you stand.
// So the unit of diagnosis is an AREA WITHIN a plaza, measured against one of
// the five zone types the corpus was clustered into.
//
// LAYER: field_360 for the diagnosis, and the numbers below are all in P5's
// frozen perceptual_360 coordinates — the same space P6's typology was built
// in, so a distance here means what a distance there meant. The precedent-view
// panel further down is the ONLY perceptual_120 surface on this page, is
// computed separately, and is never blended into these numbers.

// Konstablerwache is the developed case: a plaza the researcher knows, large
// enough to hold several zone types (68% open facade-rich, 22% tight irregular,
// 10% tight enclosed), and already carried through every earlier phase.
const CASE_SITE_ID = 'Konstablerwache-Frankfurt am Main'

// How wide a selection starts. Roughly the width of the open middle of a
// European square — big enough to hold a few dozen grid points at 2.5 m, small
// enough to be a place rather than the whole plaza.
const DEFAULT_RADIUS_M = 15
const MIN_RADIUS_M = 5
const MAX_RADIUS_M = 60

// How long a parameter must hold still before the plaza is measured again.
// Slightly longer than one remeasure (~180 ms at Konstablerwache), so a drag
// settles into a single cast rather than a queue of them.
const RECOMPUTE_DEBOUNCE_MS = 200

const FIELD_LOADERS = import.meta.glob('../data/fields/*.json')

// A stable empty set, so a component memoised on "which buildings are gone"
// does not see a new object on every render of a sandbox with no demolitions.
const EMPTY_SET = new Set()

export function DiagnosePage() {
  const active = useMemo(() => activeSites(sites), [])
  const site = useMemo(() => active.find((s) => s.id === CASE_SITE_ID), [active])
  const entry = useMemo(() => fieldIndex.sites.find((s) => s.site_id === CASE_SITE_ID), [])

  const [field, setField] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Where the designer is looking. `centre` is in plaza-local metres; radius in
  // metres, so the selection is a real circle on the ground rather than a
  // screen-space lasso that would mean different things at different zooms.
  const [selection, setSelection] = useState(null)
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M)
  const [hover, setHover] = useState(null)

  // INSPECT MODE — click one cell instead of selecting an area.
  //
  // A toggle rather than a second gesture because the plan's click is already
  // spoken for on both surfaces: it sets the selection disc on the zone map and
  // places geometry in the sandbox. Overloading it on a modifier key would make
  // the more destructive of the two reachable by accident.
  //
  // The probed cell is stored as an INDEX into the field's point array, not as
  // a position. Tier B rebuilds its point records on every edit, and an index
  // survives that where a coordinate would have to be re-matched — so the panel
  // keeps pointing at the same ground while the numbers under it change, which
  // is the entire use for it.
  const [inspecting, setInspecting] = useState(false)
  const [probeIndex, setProbeIndex] = useState(null)

  // The character the designer INTENDS this area to have. Null until stated,
  // and deliberately not defaulted to whatever the area already is — the
  // diagnosis is a comparison against an intention, and pre-filling it with the
  // status quo would answer the question before it was asked.
  const [targetZone, setTargetZone] = useState(null)

  // Tier A: a hypothetical shift applied to each of the four metrics, in
  // normalised units. Reset whenever the selection or the intention changes,
  // because a shift is a statement about one diagnosis and carrying it to the
  // next would silently describe the wrong place.
  const [shifts, setShifts] = useState([0, 0, 0, 0])
  useEffect(() => setShifts([0, 0, 0, 0]), [selection, radius, targetZone])

  // Tier B: masses drawn into the sandbox, the recomputed field they produce,
  // and the polygon currently being drawn. `masses` is the only edit state that
  // survives an interaction; `sandbox` is derived from it and is thrown away
  // and rebuilt whenever it changes, so there is no way for the two to
  // disagree about what is standing in the plaza.
  const [masses, setMasses] = useState([])
  const [drawing, setDrawing] = useState(null)
  const [massHeight, setMassHeight] = useState(18)
  const [sandbox, setSandbox] = useState(null)
  const [computing, setComputing] = useState(false)
  const [sandboxView, setSandboxView] = useState('after')
  const [massError, setMassError] = useState(null)

  // Which tool is placing the next element, which library preset it will place,
  // and which placed element's sliders are open. Kept separate from `masses`
  // so switching tools never disturbs what is already standing.
  const [tool, setTool] = useState('freeform')
  // Plan or model. The plan stays the place things are POSITIONED — a click
  // lands where you meant it and the whole distribution is visible at once —
  // and the model is where what was placed gets judged.
  const [sandboxDim, setSandboxDim] = useState('2d')
  // The model is mounted once and then kept mounted, hidden, rather than being
  // unmounted whenever the plan is on screen. Toggling used to destroy and
  // recreate the WebGL context every time, which browsers tolerate poorly and
  // which took the whole page — and every unsaved intervention — down with it.
  // This is the same arrangement App.jsx uses for routes, for the same reason.
  // The zone carpet under the model. Off by default — the model is for judging
  // what was placed, and a permanent field of colour under it competes with
  // the thing being judged. On, it answers "did the ground under my colonnade
  // actually change type" without leaving the view the intervention is in.
  const [showZones3d, setShowZones3d] = useState(false)
  const [modelMounted, setModelMounted] = useState(false)
  useEffect(() => {
    if (sandboxDim === '3d') setModelMounted(true)
  }, [sandboxDim])

  // Work is restored from the browser on arrival and written back on every
  // change. See lib/sandboxStore.js — this saves what was DRAWN, never the
  // site register, so the phase's gate is untouched.
  const [restoredNote, setRestoredNote] = useState(null)
  useEffect(() => {
    const { elements, dropped } = loadSandbox()
    if (elements.length) {
      setMasses(elements)
      setRestoredNote(
        `Restored ${elements.length} element${elements.length === 1 ? '' : 's'} from your last session` +
          (dropped ? `; ${dropped} could not be read and were dropped.` : '.')
      )
    }
  }, [])
  useEffect(() => {
    saveSandbox(masses)
  }, [masses])
  const [activePreset, setActivePreset] = useState(null)
  const [selectedElementId, setSelectedElementId] = useState(null)
  // The sandbox tracks its own cursor. Sharing the selection plan's `hover`
  // would let a cursor moving over the Tier B plan drag a ghost selection ring
  // around the plan two sections above it.
  const [drawHover, setDrawHover] = useState(null)

  // Escape abandons a half-drawn footprint, matching the viewer and the P7
  // editor. A partly-placed polygon is not a state worth being trapped in.
  useEffect(() => {
    if (!drawing) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDrawing(null)
        setMassError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing])

  const planRef = useRef(null)

  useEffect(() => {
    if (!entry) {
      setLoadError(`${CASE_SITE_ID} has no field data — run npm run fields`)
      return
    }
    const loader = FIELD_LOADERS[`../data/fields/${entry.file}`]
    if (!loader) {
      setLoadError(`No field data bundled for ${entry.file} — run npm run fields`)
      return
    }
    let cancelled = false
    loader()
      .then((m) => {
        if (!cancelled) setField(m.default ?? m)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  const geometry = useMemo(() => (site ? projectSite(site) : null), [site])
  const windowRadius = useMemo(() => corpusWindowRadius(active), [active])
  const centre = useMemo(
    () => (field && geometry ? pointsCentre(field.points, geometry.boundary) : null),
    [field, geometry]
  )
  const zoneNames = useMemo(() => describeZones(zonesFile.centres), [])
  const weights = zonesFile.weighted_by.weights

  // ------------------------------------------------ the perceptual_120 bridge
  //
  // Everything from here to the PrecedentPanel below belongs to the OTHER
  // layer. It is assembled here rather than inside the panel so the page can be
  // read once and the separation seen: three values that never touch `field`,
  // `zonesFile.centres` or `fieldIndex.bounds`, and a panel that never receives
  // them.
  //
  // The weights are the one thing both layers share, and legitimately: they are
  // P5's fitted weights, applied to 120° readings under the transfer assumption
  // P6 and P7 already state. Bounds are what must not cross, and they do not —
  // buildCorpusViews derives its own from the eighteen canonical 120° readings.
  // What a scenario saved today was computed against. Stamped onto every saved
  // scenario and compared on load, so one saved before a re-clustering says so
  // instead of quietly reporting numbers against a typology it never saw.
  const provenance = useMemo(() => scenarioProvenance(zonesFile, fieldIndex), [])

  const sitesById = useMemo(() => new Map(active.map((s) => [s.id, s])), [active])
  const corpus = useMemo(() => {
    try {
      return buildCorpusViews(readings, cloudFile.markers ?? [], active.map((s) => s.id))
    } catch {
      // A corpus that cannot be assembled costs this page one panel; it must not
      // cost it the diagnosis, which does not depend on the 120° layer at all.
      return null
    }
  }, [active])

  // P8's numbers, live. The hook reads the dev endpoint when it is running and
  // falls back to the bundled snapshot otherwise — the same reader P8's own
  // researcher page uses, so the two cannot report different totals.
  const { records: matchedViewRecords } = useMatchedViewResponses()
  const evidence = useMemo(() => {
    try {
      return precedentEvidence(analyseMatchedView(matchedViewRecords, trialBank))
    } catch {
      return null
    }
  }, [matchedViewRecords])

  // Which sampled points fall inside the selection circle.
  //
  // The circle is the SELECTION, and the points inside it are what gets
  // measured — never the circle itself. A circle drawn over a corner of the
  // plaza that happens to contain four sampled points is a diagnosis of four
  // points, and the readout says so, because at 2.5 m spacing a small selection
  // is a small sample and reading it as a smooth regional average would be a
  // false precision.
  const selected = useMemo(() => {
    if (!field || !selection) return null
    const indices = []
    const r2 = radius * radius
    for (let i = 0; i < field.points.length; i++) {
      const p = field.points[i]
      const dx = p.x - selection.x
      const dy = p.y - selection.y
      if (dx * dx + dy * dy <= r2) indices.push(i)
    }
    return indices
  }, [field, selection, radius])

  // Membership as a Set, memoised so the plan layer below keeps a stable prop
  // and its memo actually holds.
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected])

  const summary = useMemo(() => {
    if (!field || !selected?.length) return null
    const points = selected.map((i) => field.points[i].n)
    const assigned = points.map((p) => assignZone(p, zonesFile.centres, weights))

    const counts = new Array(zonesFile.k).fill(0)
    for (const z of assigned) counts[z]++

    // How settled each point is in the zone it has: its distance to its own
    // centre. A selection whose points sit far from their own centres is a
    // transitional place, and that is worth knowing before any intended type
    // is chosen for it.
    const ownDistances = points.map((p, i) =>
      decompose(p, zonesFile.centres[assigned[i]], weights).distance
    )

    return {
      n: points.length,
      points,
      assigned,
      counts,
      shares: counts.map((c) => c / points.length),
      dominant: counts.indexOf(Math.max(...counts)),
      meanOwnDistance: ownDistances.reduce((s, v) => s + v, 0) / ownDistances.length,
      maxOwnDistance: Math.max(...ownDistances),
      means: METRICS.map((_, k) => points.reduce((s, p) => s + p[k], 0) / points.length),
    }
  }, [field, selected, weights])

  // The diagnosis proper: this area, measured against the intended character.
  //
  // diagnoseRegion works per point and then averages, rather than collapsing
  // the selection to its mean point first — see the note there for why those
  // are different numbers and why the difference matters.
  const diagnosis = useMemo(() => {
    if (!summary || targetZone == null) return null
    return diagnoseRegion(summary.points, targetZone, zonesFile.centres, weights)
  }, [summary, targetZone, weights])

  // TIER A — how sensitive the area's classification is to each dimension.
  //
  // A uniform shift is applied to EVERY point in the selection, and the answer
  // is the share of those points that then classify as the intended type. Not
  // "does the mean point flip": a region is not its mean, and a shift that
  // carries the mean across a boundary can leave most of the actual points
  // behind it. Sweeping the whole range rather than reporting a single
  // threshold is what makes this a sensitivity analysis instead of an
  // instruction — a dimension whose curve rises steeply is one the
  // classification depends on here, and a flat curve says the opposite.
  const response = useMemo(() => {
    if (!summary || targetZone == null) return null
    const STEPS = 81
    const SPAN = 1 // normalised units either side

    return METRICS.map((metric, k) => {
      const envelope = fieldIndex.observed_envelope[metric]
      const samples = []
      for (let s = 0; s < STEPS; s++) {
        const delta = -SPAN + (2 * SPAN * s) / (STEPS - 1)
        let hits = 0
        for (const p of summary.points) {
          const moved = [...p]
          moved[k] += delta
          if (assignZone(moved, zonesFile.centres, weights) === targetZone) hits++
        }
        samples.push({
          delta,
          share: hits / summary.points.length,
          // Whether the SELECTION MEAN would still sit inside the range the
          // corpus actually exhibits. Beyond it the curve is extrapolation, and
          // is drawn as such rather than trimmed away — where a curve only
          // rises outside the envelope, that is the finding.
          inEnvelope:
            summary.means[k] + delta >= envelope.min && summary.means[k] + delta <= envelope.max,
        })
      }
      return { metric, label: METRIC_LABELS[metric], samples }
    })
  }, [summary, targetZone, weights])

  // The four sliders, applied together. This is the "what-if" half of Tier A:
  // it answers what the area would classify as if all four dimensions moved at
  // once, which no single-dimension curve can show.
  const shifted = useMemo(() => {
    if (!summary || targetZone == null) return null
    const movedPoints = summary.points.map((p) => p.map((v, k) => v + shifts[k]))
    const assigned = movedPoints.map((p) => assignZone(p, zonesFile.centres, weights))
    const onTarget = assigned.filter((z) => z === targetZone).length
    const mean = METRICS.map((_, k) => summary.means[k] + shifts[k])
    return {
      mean,
      meanZone: assignZone(mean, zonesFile.centres, weights),
      onTarget,
      onTargetShare: onTarget / movedPoints.length,
      distance: decompose(mean, zonesFile.centres[targetZone], weights).distance,
      outsideEnvelope: METRICS.filter((m, k) => {
        const e = fieldIndex.observed_envelope[m]
        return mean[k] < e.min || mean[k] > e.max
      }),
    }
  }, [summary, targetZone, shifts, weights])

  // TIER B — measure the plaza again with the drawn masses standing in it.
  //
  // Deferred one frame rather than run inline. The whole plaza is ~970 points
  // at 360°, about 150 ms, which is fast enough to feel immediate but long
  // enough to swallow the paint that would otherwise tell the researcher
  // anything is happening. Yielding first means the "measuring" state is
  // actually seen.
  useEffect(() => {
    if (!field || !geometry) return
    if (!masses.length) {
      setSandbox(null)
      setComputing(false)
      return
    }
    setComputing(true)
    let cancelled = false
    // DEBOUNCED, so a slider can be dragged. One remeasure is ~180 ms over 967
    // points at 360 rays; firing one per slider frame would queue them faster
    // than they complete and the page would fall behind the cursor. The plan
    // redraws every frame regardless — geometry generation is trivial — so what
    // is deferred is only the measurement, which is the right thing to defer.
    const handle = setTimeout(() => {
      const result = recomputeField({
        points: field.points,
        geometry,
        masses,
        bounds: fieldIndex.bounds,
        centres: zonesFile.centres,
        weights,
      })
      if (cancelled) return
      setSandbox({ result, diff: diffField(field.zones, result, zonesFile.k) })
      setComputing(false)
    }, RECOMPUTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [field, geometry, masses, weights])

  // The same selection, re-diagnosed against the edited plaza. Points the
  // masses swallowed are simply gone from it — a position inside a new building
  // is not a place the intended character can be delivered at, and quietly
  // keeping its old reading would be the most flattering possible error.
  // Placing, reshaping and removing library elements.
  //
  // Parameters are stored on the element and the geometry is regenerated from
  // them on every read, so a slider moves a real building rather than a cached
  // approximation of one — see elementParts() in lib/presets.js.
  const placeElement = (point) => {
    if (!point || !geometry) return
    setMassError(null)
    if (tool === 'preset') {
      if (!activePreset) return
      const element = makePresetElement(activePreset, point, defaultParams(activePreset), 0)
      setMasses((m) => [...m, element])
      setSelectedElementId(element.id)
      return
    }
    if (tool === 'demolish') {
      const index = buildingAt(point, geometry.buildings)
      if (index == null) {
        setMassError(
          'No building there. Click inside one of the blocks around the square — the plaza ' +
            'floor is not something that can be removed.'
        )
        return
      }
      // Keyed on the building index, so clicking the same block twice cannot
      // stack two identical demolitions in the list.
      const element = makeDemolition(index)
      if (masses.some((m) => m.id === element.id)) {
        setMassError('That building is already removed — delete it from the list to put it back.')
        return
      }
      setMasses((m) => [...m, element])
      setSelectedElementId(element.id)
      return
    }
    if (tool === 'recess') {
      // The host rule lives in nearestFacade and governs every subtractive
      // preset — a click that finds no qualifying facade places nothing and
      // says why, rather than carving into the nearest scrap of geometry.
      //
      // A demolished block is skipped by index rather than by handing this a
      // filtered list: the index it returns is stored on the recess and has to
      // keep addressing the site's own building list.
      const facade = nearestFacade(point, geometry.buildings, 30, { skip: demolishedSet })
      if (!facade) {
        setMassError(
          'No facade here long or tall enough to carve into. A recess needs an edge of at least ' +
            `${MIN_FACADE_LENGTH_M} m on a building at least ${MIN_FACADE_HEIGHT_M} m high — ` +
            'click closer to one of the blocks around the square.'
        )
        return
      }
      const element = makeRecessElement(facade, defaultParams('recessedArcade'))
      setMasses((m) => [...m, element])
      setSelectedElementId(element.id)
    }
  }

  const updateParam = (id, key, value) =>
    setMasses((m) =>
      m.map((el) => (el.id === id ? { ...el, params: { ...el.params, [key]: value } } : el))
    )

  const rotateElement = (id, deg) =>
    setMasses((m) => m.map((el) => (el.id === id ? { ...el, rotation_deg: deg } : el)))

  const removeElement = (id) => {
    setMasses((m) => m.filter((el) => el.id !== id))
    setSelectedElementId((current) => (current === id ? null : current))
  }

  // Derived from the SAME composeGeometry the cast runs through, once, so the
  // plan, the model and the measurement can never disagree about what was cut
  // or what was taken away.
  const composedSandbox = useMemo(
    () => (geometry ? composeGeometry(geometry, masses) : null),
    [geometry, masses]
  )
  const sandboxRecesses = composedSandbox?.recesses ?? []
  const demolishedSet = composedSandbox?.demolished ?? EMPTY_SET

  const selectedElement = masses.find((el) => el.id === selectedElementId) ?? null
  const selectedPreset = selectedElement?.preset ? presetById.get(selectedElement.preset) : null

  // The plaza re-measured with NOTHING drawn, height-aware.
  //
  // P6's stored field would almost do — an empty edit reproduces it point for
  // point at this site (test/sandbox.test.js) — but "almost" is the wrong
  // standard for the baseline of a before/after, and the stored file carries
  // only the four fitted metrics. Solidity and solid share exist solely in the
  // recompute, so without this there is no "before" to show them against.
  //
  // Computed only once something has been drawn, so an untouched page pays
  // nothing for it, and memoised on the geometry so it survives every slider
  // drag afterwards.
  // Extracted rather than written inline in the dependency array below: the
  // baseline must be rebuilt when the sandbox goes from empty to non-empty, and
  // NOT on every change to what is in it — an expression in a dep array cannot
  // be checked statically, and this is the one dependency that must be exactly
  // this coarse.
  const hasMasses = masses.length > 0
  const baseline = useMemo(() => {
    if (!field || !geometry || !hasMasses) return null
    return recomputeField({
      points: field.points,
      geometry,
      masses: [],
      bounds: fieldIndex.bounds,
      centres: zonesFile.centres,
      weights,
    })
  }, [field, geometry, hasMasses, weights])

  // What the intervention did to the metrics themselves, at the selected area.
  //
  // Deliberately NOT gated on an intended zone type. "Did enclosure go up here"
  // is a question about geometry with an answer either way; requiring an
  // intention first is what previously made that answer unreachable — the only
  // sandbox readout on the page needed a target zone, and the only per-metric
  // figure read from the unedited field.
  const selectionEffect = useMemo(() => {
    if (!sandbox || !baseline || !selected?.length) return null
    const wanted = new Set(selected)
    const after = sandbox.result.points.filter((p) => wanted.has(p.index))
    if (!after.length) return null
    const surviving = new Set(after.map((p) => p.index))
    // The SAME points on both sides. Averaging the before over positions the
    // intervention has since built over would credit it with removing the very
    // readings that made the area what it was.
    const before = baseline.points.filter((p) => surviving.has(p.index))

    const avg = (rows, key) => rows.reduce((s, r) => s + r[key], 0) / rows.length
    const row = (key, label, format, diagnostic = true) => {
      const b = avg(before, key)
      const a = avg(after, key)
      return { key, label, format, diagnostic, before: b, after: a, pct: b ? ((a - b) / b) * 100 : 0 }
    }

    return {
      n: after.length,
      swallowed: selected.length - after.length,
      rows: [
        row('area_m2', 'Isovist area', (v) => `${Math.round(v).toLocaleString()} m²`),
        row('compactness', 'Compactness', (v) => v.toFixed(4)),
        row('occlusivity_m', 'Occlusivity', (v) => `${Math.round(v)} m`),
        row('closed_share', 'Closed share (P9 only)', (v) => v.toFixed(4)),
        row('enclosure_ratio', 'Enclosure', (v) => v.toFixed(4)),
        row('solidity', 'Solidity (P9 only)', (v) => v.toFixed(4)),
        row('solid_share', 'Solid share (P9 only)', (v) => v.toFixed(4), false),
      ],
    }
  }, [sandbox, baseline, selected])

  // One derivation, two drawings. The plan and the model must never disagree
  // about which points changed type.
  // ------------------------------------------------------- the inspected cell
  //
  // Read, never re-measured. The as-built reading comes from the stored field
  // exactly as P6 wrote it; the sandbox reading comes from `recomputeField`'s
  // own output. Both are the records the maps are coloured from, so the panel
  // cannot report a number the cell under the crosshair disagrees with.
  const probeBefore = useMemo(() => {
    if (probeIndex == null || !field) return null
    const p = field.points[probeIndex]
    if (!p) return null
    return readCell({ ...p, zone: field.zones[probeIndex] }, zonesFile.centres, weights, zoneNames)
  }, [probeIndex, field, weights, zoneNames])

  const probeAfter = useMemo(() => {
    if (probeIndex == null || !sandbox) return null
    // A mass drawn over the probed cell removes it from the sample. That is a
    // real answer — "nobody stands here any more" — and is reported as such
    // rather than by silently falling back to the as-built reading.
    const p = sandbox.result.points.find((q) => q.index === probeIndex)
    if (!p) return 'built-over'
    return readCell(p, zonesFile.centres, weights, zoneNames)
  }, [probeIndex, sandbox, weights, zoneNames])

  // The outline is the one thing that IS cast, and only to be drawn. Cast
  // through whichever geometry the surface it is drawn on represents, so the
  // shape shown is the shape the numbers beside it describe.
  const probeIsovistBefore = useMemo(() => {
    if (probeIndex == null || !field || !geometry) return null
    return cellIsovist(field.points[probeIndex], geometry, [])
  }, [probeIndex, field, geometry])

  const probeIsovistAfter = useMemo(() => {
    if (probeIndex == null || !field || !geometry) return null
    return cellIsovist(field.points[probeIndex], geometry, masses)
  }, [probeIndex, field, geometry, masses])

  const probeCell = useMemo(
    () => (probeIndex == null || !field ? null : field.points[probeIndex]),
    [probeIndex, field]
  )

  // Turning inspect mode off leaves the cell marked. Clearing is its own
  // gesture, because the common move is to probe a cell, switch back to
  // selecting an area around it, and compare the two — and losing the marker on
  // the way would make that impossible.
  const probePlan = useCallback(
    (point) => {
      if (!field || !point) return false
      const found = findCell(point, field.points)
      setProbeIndex(found ? found.index : null)
      return true
    },
    [field]
  )

  const zoneCells = useMemo(
    () => zoneCellsFor(field, sandbox, sandboxView),
    [field, sandbox, sandboxView]
  )

  const sandboxDiagnosis = useMemo(() => {
    if (!sandbox || !selected || targetZone == null) return null
    const wanted = new Set(selected)
    const points = sandbox.result.points.filter((p) => wanted.has(p.index)).map((p) => p.n)
    if (!points.length) return null
    return {
      ...diagnoseRegion(points, targetZone, zonesFile.centres, weights),
      swallowed: selected.length - points.length,
    }
  }, [sandbox, selected, targetZone, weights])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b-2 border-ink pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            P9 · Design Diagnostic
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            {site?.name ?? 'Konstablerwache'}
          </h1>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Choose an area of the plaza and the character you intend it to have. The diagnosis
            reports how far the space as built sits from that intention, and which of the four
            measured dimensions is responsible.
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
            <Meta label="layer">field 360°</Meta>
            <Meta label="points">{field ? field.point_count.toLocaleString() : '…'}</Meta>
            <Meta label="spacing">{fieldIndex.spacing_m} m</Meta>
            <Meta label="zones">{zonesFile.k} corpus types</Meta>
            <Meta label="normalised against">P5 perceptual_360</Meta>
          </dl>
        </header>

        {loadError && (
          <p className="mt-6 text-sm text-redline">Could not load the field: {loadError}</p>
        )}

        {!field && !loadError && (
          <p className="mt-6 font-mono text-xs text-ink-faint">Loading the field…</p>
        )}

        {field && geometry && (
          <section className="pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Select an area</h2>
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Click anywhere on the plan to place a selection, then size it. The points inside
                  it are what gets measured.
                </p>
              </div>
              <RadiusControl value={radius} onChange={setRadius} disabled={!selection} />
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
              {/* Exportable, like every other drawing on the page. A zone map
                  with a selection ring on it is a thesis figure in its own
                  right — it is the picture of where a diagnosis was taken —
                  and it should not have to be screenshotted. */}
              <Figure
                title={`${field.name} — zone map, 360° field`}
                caption={
                  `Every sampled point coloured by its corpus zone type. The ring marks the ` +
                  `selected area; points outside it are dimmed, not excluded from the plaza.`
                }
                filename="konstablerwache-zone-map-selection"
                target="svg[data-plan]"
                className="mt-0"
                note={
                  `${field.point_count.toLocaleString()} points at ${field.spacing_m} m spacing, ` +
                  `cast 360° to 200 m. Drawn at the corpus window (${windowRadius.toFixed(1)} m ` +
                  'half-width), the one scale every plan in the platform shares, so a stroke width ' +
                  'here means what it means on P6 and P7.'
                }
              >
                <PlazaPlan
                  ref={planRef}
                  geometry={geometry}
                  windowRadius={windowRadius}
                  centre={centre}
                  interactive
                  onPlanClick={(point) => {
                    if (!point) return
                    if (inspecting) probePlan(point)
                    else setSelection(point)
                  }}
                  onPlanMove={(point) => setHover(point)}
                  onPlanLeave={() => setHover(null)}
                  ariaLabel={
                    inspecting
                      ? `${field.name} zone map — click a cell to inspect it`
                      : `${field.name} zone map — click to select an area`
                  }
                >
                  {({ k }) => (
                    <>
                      <SelectionPointsLayer
                        points={field.points}
                        zones={field.zones}
                        spacing={field.spacing_m}
                        selectedSet={selectedSet}
                        hasSelection={!!selection}
                      />

                      {/* Drawn UNDER the marker so the crosshair stays legible
                          against it, and only on the surface whose geometry it
                          was cast through. */}
                      <IsovistOutline isovist={probeIsovistBefore} k={k} />
                      <ProbeMarker cell={probeCell} k={k} />

                      {/* The selection ring is drawn in markup red, the
                          platform's reserved colour for something the
                          researcher has added on top of a measurement rather
                          than something measured. */}
                      {selection && (
                        <SelectionRing centre={selection} radius={radius} k={k} />
                      )}
                      {/* No ghost ring while inspecting: it previews a
                          selection the click will not make. */}
                      {!selection && hover && !inspecting && (
                        <SelectionRing centre={hover} radius={radius} k={k} ghost />
                      )}
                    </>
                  )}
                </PlazaPlan>
                {/* A <p>, not a second <figcaption>: Figure already provides
                    the figure's caption, and one figure may only have one.
                    This line is live interaction state anyway, not a caption —
                    and it is inside the export holder, so it must stay outside
                    the plan's own svg or it would travel into the download. */}
                <p className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-faint">
                  <span>
                    {field.name} · {field.point_count.toLocaleString()} points at{' '}
                    {field.spacing_m} m · 360°
                  </span>
                  <span className={inspecting || selection ? '' : 'text-primary'}>
                    {inspecting
                      ? 'click a cell to inspect it'
                      : selection
                        ? 'click again to move the selection'
                        : 'click inside the plaza'}
                  </span>
                </p>
              </Figure>

              <InspectToggle
                on={inspecting}
                onChange={setInspecting}
                probed={probeIndex != null}
                onClear={() => setProbeIndex(null)}
              />

              <CellProbePanel
                reading={probeBefore}
                onClear={() => setProbeIndex(null)}
              />

              <SelectionPanel
                summary={summary}
                selection={selection}
                radius={radius}
                zoneNames={zoneNames}
                onClear={() => setSelection(null)}
              />
            </div>
          </section>
        )}

        {/* ------------------------------------------- the diagnosis */}
        {field && geometry && (
          <section className="pt-12">
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-ink">
                Diagnose against an intended character
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                State what you intend this area to be. The diagnosis is the weighted squared
                distance from each selected point to that type's centre, decomposed into the four
                measured dimensions — so it names which one is responsible, not only how far off
                the area is.
              </p>
            </div>

            <ZonePicker
              centres={zonesFile.centres}
              zoneNames={zoneNames}
              value={targetZone}
              onChange={setTargetZone}
              currentDominant={summary?.dominant ?? null}
            />

            {!summary && (
              <p className="mt-6 font-mono text-xs text-ink-faint">
                Select an area above to diagnose it.
              </p>
            )}

            {summary && targetZone == null && (
              <p className="mt-6 font-mono text-xs text-ink-faint">
                Choose an intended character to diagnose this area against.
              </p>
            )}

            {summary && diagnosis && (
              <>
                <DiagnosisHeadline
                  diagnosis={diagnosis}
                  summary={summary}
                  zoneNames={zoneNames}
                  targetZone={targetZone}
                />
                {/* Said on the figure itself, not only in its note. This
                    diagnosis reads P6's stored field and therefore describes
                    the plaza AS SURVEYED — it does not move when something is
                    drawn in Tier B. That is defensible (a diagnosis is of the
                    thing being diagnosed) and it is also exactly how someone
                    testing colonnades concludes the tool is broken, because
                    this is the only per-metric readout on the page. The
                    before/after now lives in Tier B; this points at it. */}
                {masses.length > 0 && (
                  <p className="mt-4 rounded-lg border border-warn/40 bg-warn-wash p-3 text-[12px] leading-relaxed text-ink">
                    <span className="font-medium">This figure is the plaza as surveyed.</span> It
                    does not include the {masses.length} thing
                    {masses.length === 1 ? '' : 's'} you have drawn in Tier B — a diagnosis is of
                    the space as it stands. For what your intervention did to these same four
                    numbers, see <span className="font-medium">“What it did to the numbers at
                    your selected area”</span> in Tier B below.
                  </p>
                )}
                <Figure
                  title={`Where the gap is — ${summary.n} points against "${zoneNames[targetZone]}"${
                    masses.length ? ' (as surveyed)' : ''
                  }`}
                  caption={
                    'Each dimension’s signed distance from the intended type, and its share of ' +
                    'the total weighted discrepancy. Rows are ordered by share, so the driving ' +
                    'dimension is at the top. A bar to the right of the intended line means the ' +
                    'area has more of that quality than the type calls for.'
                  }
                  filename={`konstablerwache-diagnosis-zone-${targetZone}`}
                  note={
                    'Weighted squared distance in P5’s frozen perceptual_360 coordinates, the ' +
                    'space the typology was clustered in. Shares are of the weighted quantity and ' +
                    'therefore already account for the fitted metric weights; the signed gaps beside ' +
                    'them are plain normalised differences, which is why a large gap can carry a ' +
                    'small share and the reverse.'
                  }
                >
                  <MetricGapFigure diagnosis={diagnosis} />
                </Figure>
              </>
            )}
          </section>
        )}

        {/* ------------------------------------------- Tier A: sensitivity */}
        {/* THE HEADING RENDERS WHETHER OR NOT THERE IS A SELECTION, and that is
            the whole reason the gate sits inside the section rather than around
            it. Tier A needs a selected area and an intended type before it has
            anything to say, and it used to render nothing at all until it had
            both — so a reader arriving at the page met a "Tier B" with no Tier A
            anywhere above it, which reads as a missing section rather than as an
            empty one. An empty state that names what is missing is the same
            answer the Tier B effect table already gives. */}
        {field && geometry && (
          <section className="pt-12">
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-ink">
                Tier A — parametric sensitivity
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                {targetZone != null ? (
                  <>
                    A question, not a design move: which of the four numbers would this area need
                    to change most, to read as{' '}
                    <span className="text-ink">{zoneNames[targetZone]}</span> instead of what it is
                    now?
                  </>
                ) : (
                  <>
                    A question, not a design move: which of the four numbers would a selected area
                    need to change most, to read as an intended type instead of what it is now?
                  </>
                )}
              </p>
            </div>

            {!(summary && diagnosis && response && shifted) && (
              <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">
                  Select an area on the plan above, then choose an intended type.
                </span>{' '}
                Tier A then sweeps each of the four metrics on its own and reports the share of
                your selected points that would reclassify — which is how you find the one or two
                dimensions worth aiming a real design move at in Tier B below.
              </p>
            )}

            {summary && diagnosis && response && shifted && (
              <>

            {/* Plain-language framing, kept short on purpose. The graph and
                sliders below each carry their own one-line "what is this"
                immediately at their own heading — this block only needs to
                say what Tier A as a whole is for and what it is not. */}
            <div className="mt-4 rounded-lg border border-warn/40 bg-warn-wash p-4">
              <p className="text-sm leading-relaxed text-ink">
                <span className="font-medium">
                  This tests the number, not the building.
                </span>{' '}
                It asks a hypothetical — "what if enclosure were higher here?" — without drawing
                anything. It exists to point at the one or two dimensions worth focusing an actual
                design move on, before you go build one in Tier B below. It cannot tell you HOW to
                raise a number: the four metrics come from one shared geometry, so a real move (a
                taller building, a narrower gap) always shifts more than one of them together.
              </p>
            </div>

            <Figure
              title="Which dimension actually moves the classification"
              caption={
                `One line per dimension. Each shows: if you changed only THAT dimension by some ` +
                `amount (holding the other three exactly as built), what share of the ` +
                `${summary.n} selected points would then read as “${zoneNames[targetZone]}”? A line ` +
                `that climbs steeply is a dimension this area's type depends on; a line that stays ` +
                `flat near 0% cannot get there on its own, however far it is pushed.`
              }
              filename={`konstablerwache-tier-a-response-zone-${targetZone}`}
              note={
                'The vertical line marked "as built" is where the area is today (no change). Moving ' +
                'right on a line means increasing that dimension, left means decreasing it. A line ' +
                'turns dashed and fainter once the shift would put the area outside anywhere the ' +
                'other 17 plazas were actually measured — a dimension that only reaches 100% in its ' +
                'dashed portion is not reachable by any real position in the corpus.'
              }
            >
              <ResponseFigure response={response} means={summary.means} />
            </Figure>

            <p className="mt-6 max-w-2xl text-sm text-ink-muted">
              The graph above changes one dimension at a time. The sliders below let you change all
              four together — which is closer to what a real edit does — and show where that lands.
            </p>

            <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
              <ShiftSliders
                shifts={shifts}
                means={summary.means}
                onChange={setShifts}
                onReset={() => setShifts([0, 0, 0, 0])}
              />
              <ShiftReadout
                shifted={shifted}
                diagnosis={diagnosis}
                zoneNames={zoneNames}
                targetZone={targetZone}
                n={summary.n}
              />
            </div>
              </>
            )}
          </section>
        )}

        {/* ------------------------------------------- Tier B: the sandbox */}
        {field && geometry && (
          <section className="pt-12 pb-16">
            <Boundary
              label="P9 Tier B"
              title="The intervention tools could not be drawn."
              note="Your interventions are safe — they are held above this panel and saved in this browser. Reload the page to get the tools back."
            >
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-ink">Tier B — draw an intervention</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                Add a building mass to the plaza. The whole field is measured again with it
                standing there, and every point is re-sorted into the same {zonesFile.k} corpus
                types — so what comes back is the zone map of a plaza that does not exist.
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <p className="text-sm leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">This is the real thing, not a proxy.</span>{' '}
                Unlike Tier A, nothing here is assumed: the same ray-casting engine that measured
                all eighteen plazas re-measures this one, 360° at every sampled point, and the four
                metrics move together the way geometry makes them. Nothing is written to the site
                register — reload the page and Konstablerwache is as surveyed.
              </p>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
              {/* The phase's headline drawing, and therefore the one that most
                  needs to leave the app: the zone map of a plaza that does not
                  exist. `target` names the plan explicitly because this panel
                  also holds a toolbar and, when the model is on, a WebGL canvas
                  — the default "first svg in the holder" rule would export a
                  toolbar icon.

                  The 3D model is a <canvas> and cannot be serialised to SVG at
                  all. The export buttons stay visible while it is showing and
                  produce the PLAN, which is the honest behaviour: the plan is
                  the drawing that carries the measurement, and offering a
                  greyed-out button would suggest a model export exists. */}
              <Figure
                title={
                  sandbox
                    ? sandboxView === 'before'
                      ? 'Konstablerwache as built — zone map'
                      : sandboxView === 'changed'
                        ? `Points the intervention re-typed (${sandbox.diff.changedCount})`
                        : 'Konstablerwache with the intervention — zone map'
                    : 'Konstablerwache — the sandbox plan'
                }
                caption={
                  sandbox
                    ? `The same ${field.point_count.toLocaleString()} lattice positions, measured ` +
                      `again at 360° with what is drawn standing in the plaza, and re-sorted into ` +
                      `the same ${zonesFile.k} frozen corpus types. Interventions are drawn in ` +
                      `markup red — solid where a part reaches the 1.6 m eye-height slice and can ` +
                      `block a sightline, hollow where it cannot.`
                    : 'Building footprints and the plaza boundary at corpus scale, with the field ' +
                      'points coloured by zone type. Draw something to compare it against.'
                }
                filename={`konstablerwache-tier-b-${sandbox ? sandboxView : 'plan'}`}
                target="svg[data-plan]"
                className="mt-0"
                note={
                  'The typology is not refitted: points are assigned to the frozen centres P6 ' +
                  'clustered from all eighteen plazas. The “as built” side is P6’s stored field, ' +
                  'cast without the height-aware flag; the “with intervention” side is cast with ' +
                  'it. Those agree exactly here — every building at Konstablerwache stands above ' +
                  '1.6 m, so none is dropped by the height filter, and an empty edit reproduces ' +
                  'P6’s file point for point (test/sandbox.test.js). The flag changes only what ' +
                  'the DRAWN parts do.'
                }
              >
                {/* Both views render the SAME parts, from the same footprints
                    and heights the cast measures. Switching is a change of
                    viewpoint, never a change of model. */}
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="inline-flex overflow-hidden rounded border border-line font-mono text-[11px]">
                    {[
                      { id: '2d', label: 'plan' },
                      { id: '3d', label: 'model' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSandboxDim(o.id)}
                        aria-pressed={sandboxDim === o.id}
                        className={`px-2.5 py-0.5 transition-colors duration-150 ${
                          sandboxDim === o.id ? 'bg-ink text-bg' : 'text-ink-faint hover:text-ink'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </span>
                  {sandboxDim === '3d' && (
                    <span className="flex items-center gap-3">
                      {/* The measurement, under the design. A checkbox rather
                          than a segmented control because it is genuinely a
                          thing you turn on and off over whatever else is on
                          screen, not a third view of the model. */}
                      <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                        <input
                          type="checkbox"
                          checked={showZones3d}
                          onChange={(e) => setShowZones3d(e.target.checked)}
                          className="size-3"
                        />
                        zone map on the ground
                      </label>
                      <span className="hidden font-mono text-[11px] text-ink-faint sm:inline">
                        drag to orbit · scroll to zoom
                      </span>
                    </span>
                  )}
                </div>

                {/* Both stay mounted; only one is shown. Unmounting the model
                    tore down its WebGL context on every toggle, which is a
                    thing browsers handle badly and which took the page — and
                    the interventions on it — with it when it went wrong. */}
                {modelMounted && (
                  <div className="relative" style={{ display: sandboxDim === '3d' ? 'block' : 'none' }}>
                    {/* The legend rides on the canvas rather than sitting under
                        it, because a colour key you have to look away from is
                        one you have to memorise. Only while the carpet is on:
                        with no zones drawn it would be a key to nothing. */}
                    {showZones3d && (
                      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-line bg-paper/90 px-2 py-1.5 backdrop-blur-sm">
                        <ul className="space-y-0.5">
                          {zoneNames.map((name, i) => (
                            <li key={i} className="flex items-center gap-1.5 font-mono text-[10px] text-ink-muted">
                              <span
                                className="inline-block size-2 shrink-0 rounded-[1px]"
                                style={{ background: ZONE_COLOURS[i] }}
                              />
                              {name}
                            </li>
                          ))}
                          {sandbox && sandbox.diff.droppedCount > 0 && (
                            <li className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
                              <span className="inline-block size-2 shrink-0 rounded-[1px] bg-[#9AA0A8]" />
                              built over ({sandbox.diff.droppedCount})
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <Suspense
                      fallback={
                        <div className="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface">
                          <p className="font-mono text-xs text-ink-faint">Building the model…</p>
                        </div>
                      }
                    >
                      <SandboxScene
                        geometry={geometry}
                        masses={masses}
                        recesses={sandboxRecesses}
                        selectedElementId={selectedElementId}
                        active={sandboxDim === '3d'}
                        className="aspect-square"
                        // The carpet honours the same before/after/changed
                        // toggle the plan does, so switching between plan and
                        // model never switches which measurement you are
                        // looking at as a side effect.
                        zoneCells={showZones3d ? zoneCells : null}
                        zoneSpacing={field.spacing_m}
                        selection={selection}
                        selectionRadius={radius}
                        demolished={demolishedSet}
                      />
                    </Suspense>
                  </div>
                )}
                <div style={{ display: sandboxDim === '2d' ? 'block' : 'none' }}>
                <SandboxPlan
                  field={field}
                  shown={zoneCells}
                  geometry={geometry}
                  windowRadius={windowRadius}
                  centre={centre}
                  masses={masses}
                  drawing={drawing}
                  view={sandboxView}
                  selection={selection}
                  radius={radius}
                  inspecting={inspecting}
                  onProbe={probePlan}
                  probeCell={probeCell}
                  probeIsovist={probeIsovistAfter}
                  onVertex={(point) => {
                    if (!point) return
                    // One plan, three tools. A click adds a corner while a
                    // freehand footprint is open, and otherwise places whatever
                    // the current tool places.
                    if (drawing) {
                      setDrawing((d) => (d ? { ...d, vertices: [...d.vertices, point] } : d))
                      return
                    }
                    placeElement(point)
                  }}
                  placing={
                    !drawing &&
                    ((tool === 'preset' && !!activePreset) ||
                      tool === 'recess' ||
                      tool === 'demolish')
                  }
                  demolished={demolishedSet}
                  onHover={setDrawHover}
                  hover={drawHover}
                  selectedElementId={selectedElementId}
                  recesses={sandboxRecesses}
                />
                </div>
                <p className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-faint">
                  {/* Live in 3D too, now that the carpet gives it something to
                      switch. It stays disabled while the model is showing
                      WITHOUT the carpet, because there would be nothing on
                      screen for it to change and a control that does nothing is
                      worse than one that is absent. */}
                  <ViewToggle
                    value={sandboxView}
                    onChange={setSandboxView}
                    disabled={!sandbox || (sandboxDim === '3d' && !showZones3d)}
                    changedCount={sandbox?.diff.changedCount ?? 0}
                  />
                  <span className={inspecting || drawing ? 'text-primary' : ''}>
                    {inspecting
                      ? 'click a cell to inspect it'
                      : drawing
                        ? `${drawing.vertices.length} corner${drawing.vertices.length === 1 ? '' : 's'} — click to add, Esc to cancel`
                        : computing
                          ? 'measuring the plaza again…'
                          : `${masses.length} mass${masses.length === 1 ? '' : 'es'} in the sandbox`}
                  </span>
                </p>
              </Figure>

              {/* The same switch as on the zone map, and deliberately the same
                  state: a reader who probes a cell above and scrolls down here
                  is asking about that cell, not about a different one. */}
              <InspectToggle
                on={inspecting}
                onChange={(v) => {
                  setInspecting(v)
                  // Arming inspect while a footprint is half-drawn would strand
                  // the vertices with no way to finish them.
                  if (v) setDrawing(null)
                }}
                probed={probeIndex != null}
                onClear={() => setProbeIndex(null)}
              />

              <div className="min-w-0">
                <ToolTabs
                  value={tool}
                  onChange={(next) => {
                    setTool(next)
                    setDrawing(null)
                    setMassError(null)
                  }}
                  disabled={!!drawing}
                />

                {tool === 'preset' && (
                  <>
                    <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                      {activePreset
                        ? 'Click the plan to place it, then shape it with the sliders.'
                        : 'Pick a type, then click the plan to place it.'}
                    </p>
                    <PresetPicker
                      presets={PRESETS.filter((p) => !p.subtractive)}
                      value={activePreset}
                      onChange={setActivePreset}
                    />
                  </>
                )}

                {tool === 'recess' && (
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                    Click a facade around the square to carve a loggia into its ground floor. The
                    edge must be at least {MIN_FACADE_LENGTH_M} m long on a building at least{' '}
                    {MIN_FACADE_HEIGHT_M} m high — a recess is a cut into a ground floor, which
                    presupposes something above it.
                  </p>
                )}

                {tool === 'demolish' && (
                  <div className="mt-3 rounded-lg border border-redline/40 bg-redline-wash p-3">
                    <p className="text-[11px] leading-relaxed text-ink">
                      <span className="font-medium">Click any block around the square</span> to
                      take it away. This is the only move in the sandbox that makes the isovists{' '}
                      <span className="font-medium">larger</span> — every additive preset lowers
                      area, compactness and occlusivity together, so some zone types cannot be
                      reached by building at all.
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                      A removed building leaves a <span className="text-ink">hole</span> in the
                      zone map rather than new plaza: the sampling grid was laid on standable
                      ground, and that ground was inside a building when it was measured. The
                      sightlines it opens are measured correctly at every surviving point.
                    </p>
                    <p className="mt-1.5 font-mono text-[10px] text-ink-faint">
                      nothing is written to the site register — remove it from the list to put the
                      building back
                    </p>
                  </div>
                )}

                {massError && tool !== 'freeform' && (
                  <p className="mt-2 text-[11px] leading-relaxed text-redline">{massError}</p>
                )}

                {selectedElement && selectedPreset && (
                  <ParamSliders
                    preset={selectedPreset}
                    element={selectedElement}
                    onChange={updateParam}
                    onRotate={rotateElement}
                    onRemove={removeElement}
                    computing={computing}
                  />
                )}

                {masses.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between border-b border-line pb-1.5">
                      <h3 className="text-xs font-semibold text-ink">In the sandbox</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setMasses([])
                          setDrawing(null)
                          setSelectedElementId(null)
                          setMassError(null)
                        }}
                        className="font-mono text-[10px] text-ink-faint transition-colors hover:text-ink"
                      >
                        clear all
                      </button>
                    </div>
                    <ElementList
                      elements={masses}
                      describe={describeElement}
                      selectedId={selectedElementId}
                      onSelect={setSelectedElementId}
                      onDelete={removeElement}
                    />
                  </div>
                )}

                {tool === 'freeform' && (
                <MassPanel
                drawing={drawing}
                massHeight={massHeight}
                computing={computing}
                sandbox={sandbox}
                onHeightChange={setMassHeight}
                error={massError}
                onStartDrawing={() => {
                  setMassError(null)
                  setDrawing({ vertices: [] })
                }}
                onCancelDrawing={() => {
                  setMassError(null)
                  setDrawing(null)
                }}
                onUndoVertex={() =>
                  setDrawing((d) => (d ? { ...d, vertices: d.vertices.slice(0, -1) } : d))
                }
                onFinish={() => {
                  if (!drawing || drawing.vertices.length < 3) return
                  try {
                    const mass = validateMass(makeMass(drawing.vertices, massHeight))
                    setMasses((m) => [...m, mass])
                    setDrawing(null)
                    setMassError(null)
                  } catch (err) {
                    // Shown rather than swallowed. A rejected mass is almost
                    // always a sliver drawn by accident, and dropping it
                    // silently just looks like the button does not work.
                    setMassError(err.message)
                  }
                }}
              />
                )}

                <div className="mt-4 rounded-lg border border-line bg-surface p-3">
                  <h4 className="text-xs font-semibold text-ink">Where this is saved</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                    Your interventions are kept in this browser and restored when you come back.
                    Nothing is written to the site register, and nothing leaves this machine — the
                    plaza itself is always as surveyed.
                  </p>
                  {restoredNote && (
                    <p className="mt-2 font-mono text-[10px] text-ok">{restoredNote}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMasses([])
                      setDrawing(null)
                      setSelectedElementId(null)
                      setRestoredNote(null)
                      clearSandbox()
                    }}
                    className="mt-2 font-mono text-[10px] text-ink-faint transition-colors hover:text-redline"
                  >
                    forget saved work
                  </button>
                </div>

                {/* Two kinds of persistence, kept visibly distinct. The block
                    above is the browser's safety net for whatever is currently
                    drawn; this writes named alternatives into the repository so
                    a chapter can cite one. Presenting them as one "save" would
                    make it impossible to know which of the two had happened. */}
                <ScenarioPanel
                  siteId={CASE_SITE_ID}
                  elements={masses}
                  selection={selection}
                  radiusM={radius}
                  targetZone={targetZone}
                  provenance={provenance}
                  bundled={scenarioFile}
                  onLoad={(scenario) => {
                    // Everything a scenario restores is INPUT: what was drawn,
                    // where the question was asked, and what it was asked
                    // against. The field, the zone map and every metric are
                    // recomputed from these by the effects above, exactly as
                    // they were the first time — nothing measured is restored,
                    // because nothing measured was saved.
                    setMasses(scenario.elements ?? [])
                    setSelectedElementId(null)
                    setDrawing(null)
                    setMassError(null)
                    setSelection(scenario.selection ?? null)
                    if (scenario.radius_m != null) setRadius(scenario.radius_m)
                    setTargetZone(scenario.target_zone ?? null)
                  }}
                />

                <MetricCaveats solidShareNote={SOLID_SHARE_NOTE} />
              </div>
            </div>

            {sandbox && (
              <>
                <Figure
                  title="What the intervention did to the plaza"
                  caption={
                    `Every sampled point re-measured at 360° with the drawn mass standing, then ` +
                    `re-sorted into the same ${zonesFile.k} corpus types. ` +
                    `${sandbox.diff.changedCount} of ${sandbox.result.pointCount} surviving points ` +
                    `changed type` +
                    (sandbox.diff.droppedCount
                      ? `, and ${sandbox.diff.droppedCount} left the sample because the mass now stands on them.`
                      : '.')
                  }
                  filename="konstablerwache-tier-b-composition"
                  note={
                    'The typology is NOT refitted. Points are assigned to the same frozen centres ' +
                    'P6 clustered from all eighteen plazas, so the intervention is measured against ' +
                    'the corpus rather than against itself — re-running k-means with the edit in the ' +
                    'pool would let the intervention redefine the categories it is being judged by.'
                  }
                >
                  <CompositionDelta diff={sandbox.diff} zoneNames={zoneNames} />
                </Figure>

                {/* Before the zone-level comparison, because it is the more
                    basic question and it does not need an intended type to
                    have an answer. */}
                <MetricEffect effect={selectionEffect} />

                {/* The single-cell counterpart to the table above. Both answer
                    "what did this do", one averaged over a selection and one at
                    a named position — and the pair is the point, because a mean
                    over a selection can hide a large local effect entirely. */}
                {probeAfter === 'built-over' ? (
                  <div className="mt-4 rounded-lg border border-redline/40 bg-paper p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-redline">
                      Inspected cell
                    </p>
                    <p className="mt-1.5 text-sm text-ink">
                      <span className="font-medium">Built over.</span> An intervention now stands
                      on this position, so it is no longer somewhere a person measures the square
                      from and it has left the sample.
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      It still appears on the as-surveyed map above, where it has its original
                      reading.
                    </p>
                  </div>
                ) : (
                  <CellProbePanel
                    reading={probeAfter}
                    before={probeBefore}
                    onClear={() => setProbeIndex(null)}
                  />
                )}

                {!selection && (
                  <p className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">
                    <span className="font-medium text-ink">
                      Select an area to see what this did to the numbers.
                    </span>{' '}
                    The composition figure above is the whole plaza; the four metrics move by
                    different amounts in different parts of it, and near a small intervention
                    they move a great deal more than the plaza-wide figure suggests.
                  </p>
                )}

                {sandboxDiagnosis && diagnosis && (
                  <SandboxDiagnosisCompare
                    before={diagnosis}
                    after={sandboxDiagnosis}
                    zoneNames={zoneNames}
                    targetZone={targetZone}
                  />
                )}
              </>
            )}
            </Boundary>
          </section>
        )}

        {/* ------------------------------- the P7/P8 bridge, in the other layer

            Last on the page on purpose. It answers the question that only makes
            sense once something has been drawn — "has anyone built this?" — and
            putting it above Tier B would invite the 120° distances to be read
            as part of the 360° diagnosis, which is the one confusion the layer
            separation exists to prevent. It also carries its own error boundary:
            it is the only panel here that mounts a second WebGL context, and a
            failure in it must not take the sandbox down with it. */}
        {field && geometry && corpus && (
          <Boundary
            label="P9 precedent"
            title="The precedent panel could not be drawn."
            note="Everything above it — the diagnosis, Tier A and your interventions — is unaffected and still on the page."
          >
            <PrecedentPanel
              site={site}
              sitesById={sitesById}
              geometry={geometry}
              masses={masses}
              recesses={sandboxRecesses}
              windowRadius={windowRadius}
              centre={centre}
              corpus={corpus}
              weights={weights}
              evidence={evidence}
            />
          </Boundary>
        )}

        {/* Last, and collapsed. Everything above makes claims that hold only
            with these caveats attached; a caveat recorded in a commit message
            is not disclosed. Rendered whenever the field loaded — the
            deviations and the metric caveats are true of the phase, not of
            whatever happens to be drawn at the moment. */}
        {field && (
          <DiagnoseMethods
            site={site}
            field={field}
            fieldIndex={fieldIndex}
            zonesFile={zonesFile}
            corpus={corpus}
            evidence={evidence}
          />
        )}
      </div>
    </div>
  )
}

function Meta({ label, children }) {
  return (
    <div>
      <dt className="inline">{label} </dt>
      <dd className="inline text-ink-muted">{children}</dd>
    </div>
  )
}

// A selection is a circle on the ground, sized in metres, so it means the same
// thing at any zoom and can be stated in the methods as a radius rather than as
// "roughly this bit of the screen".
function SelectionRing({ centre, radius, k, ghost = false }) {
  return (
    <g pointerEvents="none">
      <circle
        cx={centre.x}
        cy={-centre.y}
        r={radius}
        fill="var(--color-redline)"
        opacity={ghost ? 0.04 : 0.07}
      />
      <circle
        cx={centre.x}
        cy={-centre.y}
        r={radius}
        fill="none"
        stroke="var(--color-redline)"
        strokeWidth={0.7 * k}
        strokeDasharray={`${3 * k} ${2 * k}`}
        opacity={ghost ? 0.45 : 1}
      />
      {!ghost && (
        <>
          <line
            x1={centre.x - 2.5 * k}
            y1={-centre.y}
            x2={centre.x + 2.5 * k}
            y2={-centre.y}
            stroke="var(--color-redline)"
            strokeWidth={0.6 * k}
          />
          <line
            x1={centre.x}
            y1={-centre.y - 2.5 * k}
            x2={centre.x}
            y2={-centre.y + 2.5 * k}
            stroke="var(--color-redline)"
            strokeWidth={0.6 * k}
          />
        </>
      )}
    </g>
  )
}

function RadiusControl({ value, onChange, disabled }) {
  return (
    <label
      className={`flex items-center gap-3 ${disabled ? 'opacity-40' : ''}`}
      title="Radius of the selection, in metres on the ground"
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">radius</span>
      <input
        type="range"
        min={MIN_RADIUS_M}
        max={MAX_RADIUS_M}
        step={2.5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-[var(--color-accent)]"
      />
      <span className="w-12 font-mono text-xs tabular-nums text-ink">{value} m</span>
    </label>
  )
}

// What the selection currently IS, before any intention is stated about it.
//
// This panel deliberately answers only descriptive questions — how many points,
// which types they are, how settled they are in those types. The intended type
// and the gap to it belong to the diagnosis below, and keeping them apart is
// what stops a reader mistaking "this area is 70% type 0" for a judgement.
// Switches what a click on the plan means.
//
// Presented as a switch rather than a modifier key because the two gestures are
// not equally recoverable: on the sandbox plan the default click PLACES
// GEOMETRY, and a reader holding the wrong key to inspect a cell would instead
// build something. A visible mode with a visible state is the honest version.
function InspectToggle({ on, onChange, probed, onClear }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        onClick={() => onChange(!on)}
        aria-pressed={on}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
          on
            ? 'border-redline bg-redline text-paper'
            : 'border-line-strong bg-paper text-ink-muted hover:border-primary hover:text-primary'
        }`}
      >
        <LuCrosshair aria-hidden className="h-3 w-3" />
        inspect a cell
      </button>
      {probed && !on && (
        <button
          onClick={onClear}
          className="font-mono text-[11px] text-ink-faint underline underline-offset-2 hover:text-primary"
        >
          clear the inspected cell
        </button>
      )}
      <span className="font-mono text-[10px] text-ink-faint">
        {on
          ? 'clicking now reads one cell instead of selecting an area'
          : 'read the four metrics at a single sampled position'}
      </span>
    </div>
  )
}

function SelectionPanel({ summary, selection, radius, zoneNames, onClear }) {
  if (!selection) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-surface/50 p-4">
        <LuCrosshair aria-hidden className="h-4 w-4 text-ink-faint" />
        <h3 className="mt-2 text-sm font-semibold text-ink">No area selected</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Click the plan to place a selection. Everything below is computed from the sampled points
          inside it — nothing is interpolated between them.
        </p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Empty selection</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          No sampled points fall inside this circle. Points inside a building, or within 1 m of a
          facade, are not sampled — a position inside a wall is not somewhere a person stands.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 font-mono text-[11px] text-ink-faint hover:text-ink"
        >
          clear selection
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Selection as built</h3>
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          clear
        </button>
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink-faint">
        {summary.n} point{summary.n === 1 ? '' : 's'} · r = {radius} m · centre{' '}
        {selection.x.toFixed(1)}, {selection.y.toFixed(1)}
      </p>

      <h4 className="mt-4 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        zone types present
      </h4>
      <ul className="mt-2 space-y-2">
        {summary.shares.map((share, i) =>
          share > 0 ? (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink-muted">{zoneNames[i]}</span>
                <span className="font-mono tabular-nums text-ink">
                  {(share * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-bg">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${share * 100}%`,
                    background: ZONE_COLOURS[i % ZONE_COLOURS.length],
                  }}
                />
              </div>
            </li>
          ) : null
        )}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 font-mono text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">mean distance to own centre</dt>
          <dd className="tabular-nums text-ink">{summary.meanOwnDistance.toFixed(3)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">furthest point</dt>
          <dd className="tabular-nums text-ink">{summary.maxOwnDistance.toFixed(3)}</dd>
        </div>
        {METRICS.map((m, k) => (
          <div key={m} className="flex justify-between gap-2">
            <dt className="text-ink-faint">{METRIC_LABELS[m].toLowerCase()}</dt>
            <dd className="tabular-nums text-ink">{summary.means[k].toFixed(3)}</dd>
          </div>
        ))}
      </dl>

      {summary.n < 12 && (
        <p className="mt-3 flex gap-1.5 text-[11px] leading-snug text-warn">
          <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          Few points — this is a reading of {summary.n}, not a regional average. Widen the radius
          for a steadier one.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ units & wording */

// Each metric printed in the unit its own literature uses, because normalised
// 0–1 values are the space the model works in and not a language a designer
// thinks in. Enclosure is shown in DEGREES: the metric is a share of the 90°
// you could look up, and the classical enclosure thresholds — 45°, 27°, 18°,
// 14° — are all stated as angles, so degrees is the form that can be argued
// with rather than merely reported.
const FORMAT_RAW = {
  area: (v) => `${Math.round(v).toLocaleString()} m²`,
  compactness: (v) => v.toFixed(4),
  occlusivity: (v) => `${v.toFixed(1)} m`,
  enclosure: (v) => `${(v * 90).toFixed(1)}°`,
}

// A normalised gap converted into a real-unit difference. Normalisation is
// linear, so a difference scales by the bound's width — no need to denormalise
// both ends and subtract.
function gapInRawUnits(metric, normalisedGap) {
  const bound = fieldIndex.bounds[metric]
  return normalisedGap * (bound.max - bound.min)
}

function signed(metric, normalisedGap) {
  const raw = gapInRawUnits(metric, normalisedGap)
  const sign = raw >= 0 ? '+' : '−'
  return `${sign}${FORMAT_RAW[metric](Math.abs(raw))}`
}

// The diagnosis as a sentence. A reader who takes nothing else from the figure
// should still leave with the one claim it makes.
function plainStatement(diagnosis, zoneName) {
  const lead = diagnosis.driving[0]
  if (diagnosis.total < 1e-9) {
    return `This area already sits on the centre of "${zoneName}".`
  }
  const direction = lead.gap < 0 ? 'below' : 'above'
  return (
    `${lead.label} is ${Math.abs(lead.gap).toFixed(3)} ${direction} what "${zoneName}" calls for ` +
    `(${signed(lead.metric, lead.gap)}), and carries ${(lead.share * 100).toFixed(0)}% of the gap.`
  )
}

/* ------------------------------------------------------------- intended type */

// Choosing an intended character, as characters rather than as cluster indices.
//
// Each option carries its own metric profile, because "Tight, strongly
// enclosed" is a label the platform generated from four numbers and a designer
// is entitled to see them before adopting it as an intention.
function ZonePicker({ centres, zoneNames, value, onChange, currentDominant }) {
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {centres.map((centre, i) => {
        const chosen = value === i
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(chosen ? null : i)}
            aria-pressed={chosen}
            className={`rounded-lg border p-3 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
              chosen
                ? 'border-primary bg-primary-wash'
                : 'border-line bg-paper hover:border-line-strong'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: ZONE_COLOURS[i % ZONE_COLOURS.length] }}
              />
              <span className="text-sm font-medium text-ink">{zoneNames[i]}</span>
              {currentDominant === i && (
                <span
                  className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-faint"
                  title="the type most of the selected points already are"
                >
                  current
                </span>
              )}
            </span>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-ink-faint">
              {METRICS.map((m, k) => (
                <div key={m} className="flex justify-between gap-1">
                  <dt className="truncate">{METRIC_LABELS[m].toLowerCase()}</dt>
                  <dd className="tabular-nums text-ink-muted">
                    {FORMAT_RAW[m](denormalise(centre[k], fieldIndex.bounds[m]))}
                  </dd>
                </div>
              ))}
            </dl>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- the diagnosis */

function DiagnosisHeadline({ diagnosis, summary, zoneNames, targetZone }) {
  const onTargetPct = (diagnosis.onTargetShare * 100).toFixed(0)
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-ink">{plainStatement(diagnosis, zoneNames[targetZone])}</p>
      <dl className="mt-4 grid gap-x-8 gap-y-3 font-mono text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="weighted distance" value={diagnosis.distance.toFixed(3)}>
          to the centre of “{zoneNames[targetZone]}”
        </Stat>
        <Stat label="already on target" value={`${onTargetPct}%`}>
          {diagnosis.onTarget} of {diagnosis.n} points classify as this type
        </Stat>
        <Stat label="driving dimension" value={diagnosis.driving[0].label}>
          {(diagnosis.driving[0].share * 100).toFixed(0)}% of the weighted gap
        </Stat>
        <Stat
          label="spread across points"
          value={`${diagnosis.distanceSpread.min.toFixed(2)}–${diagnosis.distanceSpread.max.toFixed(2)}`}
        >
          {/* A mean over a selection that is internally split is a number
              describing nowhere; the range is what says whether to trust it. */}
          {diagnosis.distanceSpread.sd > diagnosis.distance * 0.5
            ? 'wide — this area is not uniform'
            : 'the selection is reasonably uniform'}
        </Stat>
      </dl>
      {summary.dominant !== targetZone && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
          Most of this selection currently reads as{' '}
          <span className="text-ink">{zoneNames[summary.dominant]}</span>.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, children }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-base tabular-nums text-ink">{value}</dd>
      <dd className="mt-0.5 font-sans text-[11px] leading-snug text-ink-muted">{children}</dd>
    </div>
  )
}

// The decomposition, drawn.
//
// TWO QUANTITIES, DELIBERATELY NOT MERGED. The diverging bar is the SIGNED
// normalised gap — how far off, and which way, which is what a designer acts
// on. The meter on the right is that dimension's SHARE of the weighted squared
// distance — how much of the discrepancy it accounts for, which is what says
// where to act first. They are different questions and a single encoding would
// answer neither: the weights mean a large gap on a lightly weighted dimension
// can matter less than a small gap on a heavy one, and collapsing the two would
// hide exactly that.
function MetricGapFigure({ diagnosis }) {
  const W = 900
  const ROW_H = 52
  const TOP = 34
  const BOTTOM = 30
  const H = TOP + diagnosis.driving.length * ROW_H + BOTTOM

  const PLOT_X0 = 200
  const PLOT_X1 = 660
  const MID = (PLOT_X0 + PLOT_X1) / 2
  const HALF = (PLOT_X1 - PLOT_X0) / 2

  const SHARE_X = 690
  const SHARE_W = 140

  // The axis never shrinks below ±0.2, so a nearly-on-target area does not get
  // its trivial gaps stretched across the full width and read as a crisis.
  const maxAbs = Math.max(0.2, ...diagnosis.driving.map((t) => Math.abs(t.gap)) )
  const scale = HALF / (maxAbs * 1.12)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <text x={PLOT_X0} y={16} {...TYPE.annotation} textAnchor="start">
        less than intended
      </text>
      <text x={PLOT_X1} y={16} {...TYPE.annotation} textAnchor="end">
        more than intended
      </text>
      <text x={SHARE_X} y={16} {...TYPE.annotation} textAnchor="start">
        share of the gap
      </text>

      {/* The intended value is the zero line — the whole figure is deviation
          from it, so it is drawn as the datum a section is measured from. */}
      <line x1={MID} y1={TOP - 12} x2={MID} y2={H - BOTTOM + 6} stroke={INK} strokeWidth={1} />
      <text x={MID} y={H - BOTTOM + 20} {...TYPE.annotation} fill={MUTED} textAnchor="middle">
        intended
      </text>

      {diagnosis.driving.map((term, i) => {
        const y = TOP + i * ROW_H
        const cy = y + ROW_H / 2 - 6
        const length = term.gap * scale
        const barX = length >= 0 ? MID : MID + length
        const barW = Math.max(1, Math.abs(length))

        return (
          <g key={term.metric}>
            {i > 0 && (
              <line x1={0} y1={y - 4} x2={W} y2={y - 4} stroke={RULE} strokeWidth={0.75} />
            )}

            <text x={0} y={cy - 2} {...TYPE.axisTitle} textAnchor="start">
              {term.label}
            </text>
            <text x={0} y={cy + 12} {...TYPE.annotation} textAnchor="start">
              {FORMAT_RAW[term.metric](denormalise(term.value, fieldIndex.bounds[term.metric]))}
              {' → '}
              {FORMAT_RAW[term.metric](denormalise(term.target, fieldIndex.bounds[term.metric]))}
            </text>

            <rect x={barX} y={cy - 9} width={barW} height={16} fill={ACCENT} opacity={0.9} />

            {/* The number sits outside the bar so a short bar never hides it. */}
            <text
              x={length >= 0 ? barX + barW + 6 : barX - 6}
              y={cy + 3}
              {...TYPE.annotation}
              fill={MUTED}
              textAnchor={length >= 0 ? 'start' : 'end'}
            >
              {term.gap >= 0 ? '+' : '−'}
              {Math.abs(term.gap).toFixed(3)} · {signed(term.metric, term.gap)}
            </text>

            <rect x={SHARE_X} y={cy - 5} width={SHARE_W} height={8} fill={RULE} />
            <rect x={SHARE_X} y={cy - 5} width={SHARE_W * term.share} height={8} fill={INK} />
            <text
              x={SHARE_X + SHARE_W + 8}
              y={cy + 3}
              fontSize={11}
              fontFamily={MONO}
              fill={INK}
              textAnchor="start"
            >
              {(term.share * 100).toFixed(0)}%
            </text>
            <text x={SHARE_X} y={cy + 17} fontSize={9} fontFamily={MONO} fill={FAINT}>
              weight {term.weight.toFixed(3)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------- Tier A */

// One colour per dimension, held constant across the response figure and the
// sliders beneath it so the two read as one instrument. Four series from the
// shared figure palette, which tokens.js records as separating under
// protanopia and in greyscale.
const SERIES = { area: COOL, compactness: OK, occlusivity: NEG, enclosure: ACCENT }

// The sensitivity curves.
//
// Lines are labelled directly at their right-hand end rather than through a
// legend: a legend makes the reader hold four colour-name pairs in memory while
// tracing four crossing lines, and these lines cross a great deal.
function ResponseFigure({ response, means }) {
  const W = 900
  const H = 340
  const L = 58
  const R = 168 // room for the direct labels
  const T = 18
  const B = 46

  const x = (delta) => L + ((delta + 1) / 2) * (W - L - R)
  const y = (share) => T + (1 - share) * (H - T - B)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      {/* horizontal grid at each 25% */}
      {[0, 0.25, 0.5, 0.75, 1].map((s) => (
        <g key={s}>
          <line x1={L} y1={y(s)} x2={W - R} y2={y(s)} stroke={GRID} strokeWidth={1} />
          <text x={L - 8} y={y(s) + 3.5} {...TYPE.tick} textAnchor="end">
            {(s * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {/* the no-change datum */}
      <line x1={x(0)} y1={T} x2={x(0)} y2={y(0)} stroke={INK} strokeWidth={1} />
      <text x={x(0)} y={y(0) + 16} {...TYPE.tick} fill={MUTED} textAnchor="middle">
        as built
      </text>

      {[-1, -0.5, 0.5, 1].map((d) => (
        <text key={d} x={x(d)} y={y(0) + 16} {...TYPE.tick} textAnchor="middle">
          {d > 0 ? `+${d}` : d}
        </text>
      ))}

      <text x={(L + W - R) / 2} y={H - 8} {...TYPE.axisTitle} textAnchor="middle">
        Shift applied to one dimension (normalised units)
      </text>
      <text
        x={-(T + (H - T - B) / 2)}
        y={14}
        {...TYPE.axisTitle}
        textAnchor="middle"
        transform="rotate(-90)"
      >
        Selected points classifying as intended
      </text>

      {(() => {
        // Direct labels sit at each line's ending height so a reader can trace
        // colour to name without a separate legend. Left alone, that breaks the
        // moment two dimensions end at the same share — which is common, since
        // a dimension that cannot reach the target sits flat at 0% for the
        // whole sweep, and two or three of the four often do. STACK_LABELS
        // nudges colliding labels apart vertically, in ending order, and each
        // one gets a short leader line back to where its curve actually ends
        // so the displacement stays honest rather than silently relabelling.
        const LABEL_GAP = 28
        const MIN_LABEL_Y = 10
        const MAX_LABEL_Y = H - 20
        const raw = response.map((series) => {
          const last = series.samples[series.samples.length - 1]
          return { metric: series.metric, naturalY: y(last.share) }
        })
        const stacked = [...raw].sort((a, b) => a.naturalY - b.naturalY)
        // Two passes, not one uniform shift. A single forward pass (each label
        // pushed below the one above it) can run the bottom label off the
        // canvas; correcting that with one shift applied to the whole stack
        // then drags every OTHER label down with it, including ones that had
        // no collision at all — a line ending at 100% would get dragged away
        // from the top of its own curve to make room at the bottom. The
        // backward pass instead only pulls labels UP, and only as far as the
        // gap below them requires, so a label with no crowded neighbour stays
        // exactly where its curve actually ends.
        for (let i = 1; i < stacked.length; i++) {
          if (stacked[i].naturalY < stacked[i - 1].naturalY + LABEL_GAP) {
            stacked[i].naturalY = stacked[i - 1].naturalY + LABEL_GAP
          }
        }
        if (stacked[stacked.length - 1].naturalY > MAX_LABEL_Y) {
          stacked[stacked.length - 1].naturalY = MAX_LABEL_Y
        }
        for (let i = stacked.length - 2; i >= 0; i--) {
          if (stacked[i].naturalY > stacked[i + 1].naturalY - LABEL_GAP) {
            stacked[i].naturalY = stacked[i + 1].naturalY - LABEL_GAP
          }
        }
        if (stacked[0].naturalY < MIN_LABEL_Y) stacked[0].naturalY = MIN_LABEL_Y
        const labelYByMetric = Object.fromEntries(stacked.map((s) => [s.metric, s.naturalY]))

        return response.map((series) => {
          const colour = SERIES[series.metric]
          // Split into runs of same envelope status so the dashed
          // extrapolation is a property of the segment rather than the line.
          const runs = []
          let current = null
          for (const s of series.samples) {
            if (!current || current.inEnvelope !== s.inEnvelope) {
              if (current) current.points.push(s)
              current = { inEnvelope: s.inEnvelope, points: [] }
              runs.push(current)
            }
            current.points.push(s)
          }

          const last = series.samples[series.samples.length - 1]
          const endY = y(last.share)
          const labelY = labelYByMetric[series.metric]
          const displaced = Math.abs(labelY - endY) > 3

          return (
            <g key={series.metric}>
              {runs.map((run, r) => (
                <polyline
                  key={r}
                  points={run.points.map((s) => `${x(s.delta)},${y(s.share)}`).join(' ')}
                  fill="none"
                  stroke={colour}
                  strokeWidth={run.inEnvelope ? 2 : 1.25}
                  strokeDasharray={run.inEnvelope ? undefined : '4 3'}
                  opacity={run.inEnvelope ? 1 : 0.75}
                />
              ))}
              {/* Where the area sits today on this dimension — always delta 0,
                  marked so the reader can see which way each curve climbs. */}
              <circle cx={x(0)} cy={y(series.samples[40].share)} r={3} fill={colour} />

              {/* A short leader only where the label actually moved — a line
                  from every label to its curve would clutter a figure where
                  most labels sit exactly where they naturally would. */}
              {displaced && (
                <polyline
                  points={`${x(1)},${endY} ${W - R},${labelY}`}
                  fill="none"
                  stroke={colour}
                  strokeWidth={0.75}
                  opacity={0.5}
                />
              )}

              <text
                x={W - R + 10}
                y={labelY + 3.5}
                fontSize={10.5}
                fontFamily={SANS}
                fill={colour}
                fontWeight={500}
              >
                {series.label}
              </text>
              <text x={W - R + 10} y={labelY + 16} fontSize={9} fontFamily={MONO} fill={FAINT}>
                now {means[METRICS.indexOf(series.metric)].toFixed(2)}
              </text>
            </g>
          )
        })
      })()}
    </svg>
  )
}

// The what-if half: all four dimensions at once.
function ShiftSliders({ shifts, means, onChange, onReset }) {
  const touched = shifts.some((s) => s !== 0)
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <h3 className="text-sm font-semibold text-ink">Try a combined shift</h3>
        <button
          type="button"
          onClick={onReset}
          disabled={!touched}
          className="font-mono text-[11px] text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
        >
          reset to as built
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Drag any of the four. Each one moves that dimension by the amount shown; the panel on the
        right updates live with what the area would then read as.
      </p>
      <div className="mt-3 space-y-3">
        {METRICS.map((m, k) => {
          const bound = fieldIndex.bounds[m]
          const envelope = fieldIndex.observed_envelope[m]
          const result = means[k] + shifts[k]
          const outside = result < envelope.min || result > envelope.max
          return (
            <div key={m}>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={`shift-${m}`}
                  className="flex items-center gap-1.5 text-xs text-ink"
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: SERIES[m] }}
                  />
                  {METRIC_LABELS[m]}
                </label>
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                  {FORMAT_RAW[m](denormalise(result, bound))}
                  {shifts[k] !== 0 && (
                    <span className="ml-1.5 text-primary">{signed(m, shifts[k])}</span>
                  )}
                </span>
              </div>
              <input
                id={`shift-${m}`}
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={shifts[k]}
                onChange={(e) => {
                  const next = [...shifts]
                  next[k] = Number(e.target.value)
                  onChange(next)
                }}
                className="mt-1 w-full"
                style={{ accentColor: SERIES[m] }}
              />
              {outside && (
                <p className="font-mono text-[10px] text-warn">
                  outside the range any measured position covers
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ShiftReadout({ shifted, diagnosis, zoneNames, targetZone, n }) {
  const reached = shifted.meanZone === targetZone
  const gained = shifted.onTarget - diagnosis.onTarget
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">With those shifts applied</h3>

      <div className="mt-3 rounded-md border border-line bg-paper p-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          the mean point would read as
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink">
          <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 rounded-sm"
            style={{ background: ZONE_COLOURS[shifted.meanZone % ZONE_COLOURS.length] }}
          />
          {zoneNames[shifted.meanZone]}
          {reached && <span className="ml-auto font-mono text-[10px] text-ok">on target</span>}
        </p>
      </div>

      <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">points on target</dt>
          <dd className="tabular-nums text-ink">
            {shifted.onTarget} of {n}
            {gained !== 0 && (
              <span className={gained > 0 ? 'ml-1.5 text-ok' : 'ml-1.5 text-redline'}>
                {gained > 0 ? '+' : '−'}
                {Math.abs(gained)}
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-faint">weighted distance</dt>
          <dd className="tabular-nums text-ink">
            {shifted.distance.toFixed(3)}
            <span className="ml-1.5 text-ink-faint">was {diagnosis.distance.toFixed(3)}</span>
          </dd>
        </div>
      </dl>

      {shifted.outsideEnvelope.length > 0 && (
        <p className="mt-3 flex gap-1.5 text-[11px] leading-snug text-warn">
          <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          {shifted.outsideEnvelope.map((m) => METRIC_LABELS[m].toLowerCase()).join(' and ')}{' '}
          {shifted.outsideEnvelope.length === 1 ? 'is' : 'are'} now outside the range any of the
          11,719 measured positions cover. The classification still computes; the position it
          describes is not one the corpus has ever seen.
        </p>
      )}

      <p className="mt-3 border-t border-line pt-3 text-[11px] leading-snug text-ink-faint">
        Moving these sliders does not move a building. It asks what the typology would say about an
        area with these readings — whether any geometry produces them is Tier B's question.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------- Tier B */

// The sandbox plan: the edited zone map, the drawn masses, and the polygon
// currently being drawn, over the same base every other plan on the platform
// uses.
//
// A drawn mass is filled in markup red rather than the surface grey a surveyed
// footprint gets. The platform reserves that colour for something the
// researcher has added on top of a measurement, and an intervention is exactly
// that — a reader must never mistake a proposal for a building that is there.
// The selection plan's ~970 zone squares, isolated behind a memo for the same
// reason as the sandbox layer below.
//
// Membership is a Set rather than the index array it replaced. The array was
// tested with `selected.includes(i)` inside the 967-iteration loop, which is
// quadratic — up to about 935,000 comparisons to draw one plan, repeated on
// every state change anywhere on the page, including every frame of a slider
// drag two sections further down.
const SelectionPointsLayer = memo(function SelectionPointsLayer({
  points,
  zones,
  spacing,
  selectedSet,
  hasSelection,
}) {
  return (
    <>
      {points.map((p, i) => (
        <rect
          key={i}
          x={p.x - spacing / 2}
          y={-p.y - spacing / 2}
          width={spacing}
          height={spacing}
          fill={ZONE_COLOURS[(zones?.[i] ?? 0) % ZONE_COLOURS.length]}
          // Unselected points fade rather than disappear: the selection has to
          // be read against the zone pattern it sits in, not on an empty plan.
          opacity={hasSelection ? (selectedSet.has(i) ? 0.95 : 0.22) : 0.85}
        />
      ))}
    </>
  )
})

// The ~970 zone squares, isolated behind a memo.
//
// This layer only changes when the MEASUREMENT changes, which is at most once
// per debounce. The intervention on top of it changes on every frame of a
// slider drag. Left in the parent's render, React reconciled all 967 rects on
// every one of those frames, which is exactly what made dragging a parameter
// or a rotation feel like it was catching — the geometry was cheap and the
// backdrop underneath it was not.
//
// `shown` is already memoised on [field, sandbox, view] upstream, so its
// identity is stable across a drag and this memo genuinely holds.
const FieldPointsLayer = memo(function FieldPointsLayer({ shown, spacing, view, k }) {
  return (
    <>
      {shown.map(({ p, zone, state }, i) => {
        // A point the intervention now stands on is drawn as a hollow tick
        // rather than removed outright: an empty patch would read as "nothing
        // was ever measured here", when what happened is that a place stopped
        // being standable.
        if (state === 'dropped') {
          return (
            <rect
              key={i}
              x={p.x - spacing / 2}
              y={-p.y - spacing / 2}
              width={spacing}
              height={spacing}
              fill="none"
              stroke="var(--color-redline)"
              strokeWidth={0.2 * k}
              opacity={0.5}
            />
          )
        }
        const dim = view === 'changed' && state !== 'changed'
        return (
          <rect
            key={i}
            x={p.x - spacing / 2}
            y={-p.y - spacing / 2}
            width={spacing}
            height={spacing}
            fill={ZONE_COLOURS[zone % ZONE_COLOURS.length]}
            opacity={dim ? 0.12 : 0.9}
          />
        )
      })}
    </>
  )
})

// Which zone each ORIGINAL lattice position reads as under the current view.
// Keyed by the original index so before and after are the same places.
//
// LIFTED OUT OF SandboxPlan 2026-09-10, when the 3D model gained the same
// carpet. Two components deriving this separately from the same inputs is two
// places for the before/after rule to drift, and the one thing a before/after
// must never do is disagree with itself depending on which view you are in.
function zoneCellsFor(field, sandbox, view) {
  if (!field) return []
  if (!sandbox || view === 'before') {
    return field.points.map((p, i) => ({ p, zone: field.zones?.[i] ?? 0, state: 'kept' }))
  }
  const byIndex = new Map(sandbox.result.points.map((q) => [q.index, q]))
  const changed = new Set(sandbox.diff.changed.map((c) => c.index))
  return field.points.map((p, i) => {
    const after = byIndex.get(i)
    if (!after) return { p, zone: field.zones?.[i] ?? 0, state: 'dropped' }
    return { p, zone: after.zone, state: changed.has(i) ? 'changed' : 'kept' }
  })
}

function SandboxPlan({
  field,
  geometry,
  windowRadius,
  centre,
  masses,
  drawing,
  // The zone cells are derived once by the page and handed to both drawings —
  // the plan no longer reads `sandbox` at all, which is what guarantees it and
  // the model cannot disagree about what changed.
  shown,
  view,
  selection,
  radius,
  onVertex,
  onHover,
  hover,
  placing = false,
  selectedElementId = null,
  recesses = [],
  demolished = null,
  // Inspect mode takes the click ahead of drawing or placing, and makes the
  // plan interactive even when neither is active — otherwise a reader could
  // not inspect a cell without first arming a tool that would build something.
  inspecting = false,
  onProbe = null,
  probeCell = null,
  probeIsovist = null,
}) {
  return (
    <PlazaPlan
      geometry={geometry}
      windowRadius={windowRadius}
      centre={centre}
      demolished={demolished}
      interactive={inspecting || !!drawing || placing}
      onPlanClick={(point) => (inspecting ? onProbe?.(point) : onVertex(point))}
      onPlanMove={(point) => onHover(point)}
      onPlanLeave={() => onHover(null)}
      ariaLabel={
        inspecting
          ? 'Konstablerwache sandbox plan — click a cell to inspect it'
          : 'Konstablerwache sandbox plan'
      }
    >
      {({ k }) => (
        <>
          <FieldPointsLayer shown={shown} spacing={field.spacing_m} view={view} k={k} />

          {/* Every element resolves to parts before it is drawn, so a preset
              made of twelve columns draws as twelve columns and a freehand
              mass draws as one — the plan shows the same geometry the cast
              measures rather than a stand-in for it.

              A part that does NOT reach the eye-height slice is drawn hollow.
              It was still designed and must still appear, but showing it solid
              would imply the metrics had seen it, which for a canopy or a
              knee-high wall they have not. */}
          {allParts(masses).map((part, i) => {
            const blocks = partBlocks(part)
            const selected = part.elementId === selectedElementId
            return (
              <polygon
                key={`${part.elementId}-${i}`}
                points={part.footprint.map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="var(--color-redline)"
                fillOpacity={blocks ? (selected ? 0.62 : 0.45) : 0.1}
                stroke="var(--color-redline)"
                strokeWidth={(selected ? 0.9 : 0.55) * k}
                strokeDasharray={blocks ? undefined : `${1.5 * k} ${1.2 * k}`}
              />
            )
          })}

          {/* Recesses are cut into a host facade rather than added, so they are
              drawn as the void they open plus the piers left standing in it. */}
          {recesses.map(({ element, cut }) => (
            <g key={element.id}>
              <polygon
                points={cut.opening.map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="var(--color-bg)"
                stroke="var(--color-redline)"
                strokeWidth={(element.id === selectedElementId ? 0.9 : 0.55) * k}
              />
              {cut.piers.map((pier, j) => (
                <polygon
                  key={j}
                  points={pier.map((p) => `${p.x},${-p.y}`).join(' ')}
                  fill="var(--color-redline)"
                  fillOpacity={0.5}
                />
              ))}
            </g>
          ))}

          {drawing && drawing.vertices.length > 0 && (
            <>
              <polyline
                points={[
                  ...drawing.vertices.map((p) => `${p.x},${-p.y}`),
                  ...(hover ? [`${hover.x},${-hover.y}`] : []),
                ].join(" ")}
                fill="var(--color-redline)"
                fillOpacity={0.18}
                stroke="var(--color-redline)"
                strokeWidth={0.5 * k}
                strokeDasharray={`${2 * k} ${1.5 * k}`}
              />
              {drawing.vertices.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={-p.y}
                  r={1.1 * k}
                  fill="var(--color-redline)"
                />
              ))}
            </>
          )}

          {selection && <SelectionRing centre={selection} radius={radius} k={k} />}

          {/* Cast through the SANDBOX geometry, so the outline here is what can
              be seen with the interventions standing — the same shape the
              recomputed numbers beside it describe. */}
          <IsovistOutline isovist={probeIsovist} k={k} />
          <ProbeMarker cell={probeCell} k={k} />
        </>
      )}
    </PlazaPlan>
  )
}
