import { useMemo, useState, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import {
  LuClipboardList,
  LuCompass,
  LuCrosshair,
  LuDownload,
  LuNavigation,
  LuPencilRuler,
  LuRadar,
  LuSave,
} from 'react-icons/lu'
import sites from '@/data/sites.json'
import savedResults from '@/data/results.json'
import storedViewerState from '@/data/viewer-state.json'
import { projectSite, pointInPolygon } from '@/lib/site'
import { castIsovist, bearingTo } from '@/lib/isovist'
import { Buildings } from './Buildings'
import { IsovistOverlay } from './IsovistOverlay'

// The whole scene uses a Z-up world (X = east/right, Y = north/front, Z = up),
// matching CAD tools like Rhino. This also renders each site the correct way
// round (no mirroring), since a top-down view of the X/Y plane is a standard
// map: east right, north up.
const UP = [0, 0, 1]

// Scene palette — hex approximations of the OKLCH design tokens in index.css
// (Three.js doesn't parse oklch() strings). The scene reads as a warm
// museum-board model: cream ground, ink lines, orange isovist, redline marker.
const SCENE = {
  paper: '#f4f2ec',
  // Sky treatment: a quiet cool-to-warm vertical gradient behind the model
  // (the canvas renders with a transparent background so this shows through),
  // ending on the paper tone so the ground plane meets the horizon invisibly.
  sky: 'linear-gradient(to bottom, #e7ebe8 0%, #f1eee4 55%, #f4f2ec 100%)',
  gridCell: '#e4e0d3',
  gridSection: '#cbc5b5',
  plazaWash: '#f97316',
  isovist: '#ea580c',
  wallRibbon: '#b91c1c',
  markerInside: '#b91c1c',
  markerOutside: '#98928a',
  markerSaved: '#c2410c',
  arrowInk: '#292524',
}

const DEFAULT_STATE = { selectedId: sites[0]?.id, pick: null, direction: null, stage: 'vantage' }

// Shared validation for a restored viewer state, from whatever source (URL query
// or the persisted viewer-state.json). Only the site id and raw x/y/dir numbers
// are trusted: lat/lon and inside/outside are always recomputed from the
// projected site, and anything missing or malformed degrades to just the site
// (or the defaults, if the id is unknown).
function buildViewerState(siteId, rawX, rawY, rawDir) {
  const site = sites.find((s) => s.id === siteId)
  if (!site) return { ...DEFAULT_STATE }

  const state = { selectedId: site.id, pick: null, direction: null, stage: 'vantage' }

  const x = parseFloat(rawX)
  const y = parseFloat(rawY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state

  try {
    const data = projectSite(site)
    const point = { x, y }
    const inside = data.boundary ? pointInPolygon(point, data.boundary) : true
    const { lat, lon } = data.toLatLon(x, y)
    state.pick = { point, inside, lat, lon }
    if (inside) {
      const dir = parseFloat(rawDir)
      if (Number.isFinite(dir)) {
        state.direction = (dir * Math.PI) / 180
        state.stage = 'aim'
      }
    }
  } catch {
    // Site geometry couldn't be projected — keep just the selected site.
  }
  return state
}

// URL query state, or null when no known site is named there.
// URLSearchParams already percent-decodes, so the space-bearing ids match.
function readUrlState() {
  const params = new URLSearchParams(window.location.search)
  const siteId = params.get('site')
  if (!siteId || !sites.some((s) => s.id === siteId)) return null
  return buildViewerState(siteId, params.get('x'), params.get('y'), params.get('dir'))
}

// Persisted state from viewer-state.json, or null when it names no known site.
function readStoredState() {
  const s = storedViewerState
  if (!s || typeof s !== 'object' || !sites.some((site) => site.id === s.site_id)) return null
  return buildViewerState(s.site_id, s.x, s.y, s.dir_deg)
}

// Restore precedence: an explicit URL link wins, then the last persisted state,
// then defaults (first site, no pick).
function readInitialState() {
  return readUrlState() ?? readStoredState() ?? { ...DEFAULT_STATE }
}

export function SiteViewer({ active = true }) {
  // Restore the last viewer state once (URL query first, then the persisted
  // viewer-state.json), so a shared link, a refresh, or a brand-new tab all
  // reopen on the same plaza/viewpoint. Computed once, reused as lazy state below.
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = readInitialState()
  const initial = initialRef.current

  const [selectedId, setSelectedId] = useState(initial.selectedId)
  const [pick, setPick] = useState(initial.pick)
  const [direction, setDirection] = useState(initial.direction) // compass bearing, radians (0 = north, clockwise)
  const [stage, setStage] = useState(initial.stage) // 'vantage' = next click sets viewpoint, 'aim' = next click sets facing direction
  const [resetToken, setResetToken] = useState(0)
  const [results, setResults] = useState(savedResults) // saved isovist readings, seeded from src/data/results.json
  const [saveError, setSaveError] = useState(null)
  const [showSavedProjections, setShowSavedProjections] = useState(false) // overlay saved points' isovists faintly
  const compassRef = useRef(null)
  const pendingLoadRef = useRef(null) // a saved entry to restore after a site switch settles
  const prevSiteRef = useRef(null) // last selectedId the effect below acted on; lets it clear only on real site changes

  // The sites list is held in state (seeded from the imported JSON) so a
  // building drawn in the viewer can be added to the current site and take
  // effect immediately — rendered and fed into the ray-casting metrics — the
  // same pattern the admin page uses for edits.
  const [sitesData, setSitesData] = useState(sites)
  // In-progress hand-drawn building, or null when not drawing. `points` are the
  // placed corners (local metres); `cursor` is the live pointer position for the
  // rubber-band preview edge; `height` is the extrusion height in metres.
  const [draw, setDraw] = useState(null)
  const [buildingNote, setBuildingNote] = useState(null) // save feedback for a committed building
  // Latest sitesData, so an onBlur handler can persist the current edits without
  // capturing a stale value from an earlier render.
  const sitesDataRef = useRef(sitesData)

  const site = useMemo(() => sitesData.find((s) => s.id === selectedId) ?? sitesData[0], [sitesData, selectedId])

  useEffect(() => {
    sitesDataRef.current = sitesData
  }, [sitesData])

  // Hand-drawn buildings on the current site, with their array index (into the
  // full buildings list) so each can be re-heighted or deleted after drawing.
  const manualBuildings = useMemo(() => {
    const out = []
    ;(site.buildings ?? []).forEach((b, index) => {
      if (b.manual) {
        out.push({
          index,
          corners: (b.footprint?.coordinates?.[0]?.length ?? 1) - 1,
          height: b.override_height_m ?? '',
        })
      }
    })
    return out
  }, [site])

  const projected = useMemo(() => {
    try {
      return { data: projectSite(site), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [site])

  useEffect(() => {
    // Only react to a real site change. On mount (including StrictMode's
    // double-run in dev) the state already reflects the URL restore, and
    // clearing it here would wipe the restored viewpoint.
    if (prevSiteRef.current === null) prevSiteRef.current = selectedId
    if (prevSiteRef.current === selectedId) return
    prevSiteRef.current = selectedId
    // Any half-drawn building belongs to the old plaza — discard it on a switch.
    setDraw(null)
    setBuildingNote(null)
    // A pending Load survives the site switch: restore its viewpoint/direction
    // once the new site is selected, instead of clearing to a fresh vantage.
    const pending = pendingLoadRef.current
    if (pending) {
      pendingLoadRef.current = null
      setPick({ point: { x: pending.local_x, y: pending.local_y }, inside: true, lat: pending.lat, lon: pending.lng })
      setDirection((pending.direction_deg * Math.PI) / 180)
      setStage('aim')
    } else {
      setPick(null)
      setDirection(null)
      setStage('vantage')
    }
  }, [selectedId])

  // Mirror the current viewer state to both persistence layers whenever it
  // changes (select, place, aim/re-aim, Move viewpoint, Load-from-saved, or a
  // cleared pick): the URL query (via replaceState, so history isn't spammed)
  // for shared/deployed use, and the dev-only backend so a fresh tab restores.
  // With no pick we keep just the site; a pick adds x/y, an aimed pick adds dir.
  useEffect(() => {
    const params = [`site=${encodeURIComponent(selectedId)}`]
    const payload = { site_id: selectedId }
    if (pick) {
      const x = round(pick.point.x, 2)
      const y = round(pick.point.y, 2)
      params.push(`x=${x}`, `y=${y}`)
      payload.x = x
      payload.y = y
      if (direction != null) {
        const dir = round(((direction * 180) / Math.PI + 360) % 360, 1)
        params.push(`dir=${dir}`)
        payload.dir_deg = dir
      }
    }
    window.history.replaceState(null, '', `?${params.join('&')}${window.location.hash}`)
    // Fire-and-forget: the endpoint is absent on the deployed static site, where
    // the URL query already carries the state, so failures are silently ignored.
    fetch('/__save-viewer-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }, [selectedId, pick, direction])

  function handlePick(point) {
    const data = projected.data

    if (stage === 'aim' && pick?.inside) {
      const angle = bearingTo(pick.point, point)
      setDirection(angle)
      // eslint-disable-next-line no-console
      console.log('[SiteViewer] direction set', {
        site: site.id,
        bearing_deg: +(((angle * 180) / Math.PI + 360) % 360).toFixed(1),
      })
      return
    }

    const inside = data.boundary ? pointInPolygon(point, data.boundary) : true
    const { lat, lon } = data.toLatLon(point.x, point.y)
    if (inside) {
      // eslint-disable-next-line no-console
      console.log('[SiteViewer] viewpoint picked', {
        site: site.id,
        local_x_m: +point.x.toFixed(2),
        local_y_m: +point.y.toFixed(2),
        lat: +lat.toFixed(6),
        lng: +lon.toFixed(6),
      })
      setDirection(bearingTo(point, data.centroid))
      setStage('aim')
    }
    setPick({ point, inside, lat, lon })
  }

  const siteDefaultHeight = Number(site.default_height_m) > 0 ? Number(site.default_height_m) : 12

  // Enters draw mode: subsequent ground clicks drop footprint corners instead of
  // placing a viewpoint. Seeds the height with the site's default so a finished
  // shape can be committed in one click.
  function startDrawing() {
    setBuildingNote(null)
    setDraw({ points: [], cursor: null, height: siteDefaultHeight })
  }

  // Routes a ground click: a new footprint corner while drawing, otherwise the
  // normal viewpoint/aim pick.
  function handleGroundDown(point) {
    if (draw) {
      setDraw((d) => ({ ...d, points: [...d.points, point] }))
    } else {
      handlePick(point)
    }
  }

  // Tracks the pointer over the ground for the rubber-band preview edge; only
  // wired up while drawing so idle mouse moves don't trigger renders.
  function handleGroundMove(point) {
    setDraw((d) => (d ? { ...d, cursor: point } : d))
  }

  // Commits the drawn footprint as a real building on the current site: the
  // local-metre corners are converted back to [lng, lat] GeoJSON (via the site's
  // own projector) and appended to its buildings array with a `manual` flag and
  // the height as a pinned override. Because the sites list is state, projectSite
  // re-runs and the building appears in the scene and the metrics right away.
  function commitDrawing() {
    if (!draw || draw.points.length < 3 || !data) return
    const ring = draw.points.map((p) => {
      const { lat, lon } = data.toLatLon(p.x, p.y)
      return [round(lon, 7), round(lat, 7)]
    })
    ring.push(ring[0]) // close the GeoJSON ring
    const height = Number(draw.height) > 0 ? Number(draw.height) : siteDefaultHeight
    const building = {
      footprint: { type: 'Polygon', coordinates: [ring] },
      osm_height_m: null,
      override_height_m: round(height, 1),
      manual: true,
    }
    const next = sitesData.map((s) =>
      s.id === selectedId ? { ...s, buildings: [...s.buildings, building] } : s
    )
    setSitesData(next)
    setDraw(null)
    persistSites(next)
  }

  // Writes the whole sites array back to src/data/sites.json via the dev-only
  // endpoint (same one the admin page uses). On the deployed static site the
  // endpoint is absent, so the building stays for this session and we show a
  // clear note rather than failing loudly.
  async function persistSites(next) {
    try {
      const response = await fetch('/__save-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!response.ok) throw new Error(`save endpoint returned ${response.status}`)
      setBuildingNote({ kind: 'ok', text: 'Building added and saved to sites.json.' })
    } catch {
      setBuildingNote({
        kind: 'warn',
        text: 'Building added for this session only — it persists to sites.json when running locally (npm run dev).',
      })
    }
  }

  // Live-edits a drawn building's height (metrics recompute as you type); the
  // change is persisted on blur via commitManualEdits, not on every keystroke.
  function setManualHeight(index, value) {
    setSitesData((prev) =>
      prev.map((s) =>
        s.id === selectedId
          ? {
              ...s,
              buildings: s.buildings.map((b, i) =>
                i === index ? { ...b, override_height_m: value === '' ? null : Number(value) } : b
              ),
            }
          : s
      )
    )
  }

  function commitManualEdits() {
    persistSites(sitesDataRef.current)
  }

  // Removes a drawn building from the current site and persists immediately.
  function deleteManualBuilding(index) {
    const next = sitesData.map((s) =>
      s.id === selectedId ? { ...s, buildings: s.buildings.filter((_, i) => i !== index) } : s
    )
    setSitesData(next)
    persistSites(next)
  }

  const data = projected.data

  const isovistResult = useMemo(() => {
    if (!data || !pick?.inside || direction == null) return null
    return castIsovist(pick.point, direction, data.buildings)
  }, [data, pick, direction])

  // Every saved reading that belongs to the current plaza, drawn as a persistent
  // marker in the scene so all of a site's saved vantage points stay visible
  // (and clickable to reload) after switching sites or refreshing.
  const savedForSite = useMemo(
    () => results.filter((r) => r.site_id === selectedId),
    [results, selectedId]
  )

  // Recompute each saved point's isovist so its projection can be overlaid
  // faintly (behind the toggle below) alongside the live one — lets several
  // saved viewpoints be compared at once.
  const savedProjections = useMemo(() => {
    if (!data || !showSavedProjections) return []
    return savedForSite.map((r) => ({
      id: r.id,
      result: castIsovist({ x: r.local_x, y: r.local_y }, (r.direction_deg * Math.PI) / 180, data.buildings),
    }))
  }, [data, savedForSite, showSavedProjections])

  // Sends the whole results array to the dev-only /__save-results endpoint,
  // updating React state first so the panel reacts immediately. On the deployed
  // static site the endpoint is absent, so we keep the entry in-session and show
  // a friendly "local only" note instead of crashing.
  async function persistResults(next) {
    setResults(next)
    try {
      const response = await fetch('/__save-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!response.ok) throw new Error(`save endpoint returned ${response.status}`)
      setSaveError(null)
    } catch {
      setSaveError('Saving only works when running locally (npm run dev).')
    }
  }

  function handleSaveResult() {
    if (!isovistResult || !pick?.inside || direction == null) return
    const record = {
      id: crypto.randomUUID(),
      site_id: site.id,
      site_name: site.name,
      lat: round(pick.lat, 6),
      lng: round(pick.lon, 6),
      local_x: round(pick.point.x, 2),
      local_y: round(pick.point.y, 2),
      direction_deg: round(((direction * 180) / Math.PI + 360) % 360, 1),
      area_m2: round(isovistResult.area, 2),
      compactness: round(isovistResult.compactness, 4),
      occlusivity_m: round(isovistResult.occlusivity, 2),
      enclosure_ratio: round(isovistResult.enclosureRatio, 4),
      saved_at: new Date().toISOString(),
    }
    persistResults([...results, record])
  }

  function handleDelete(id) {
    persistResults(results.filter((r) => r.id !== id))
  }

  // Restores a saved reading onto the viewer. If it belongs to another plaza we
  // switch sites first and let the selectedId effect apply it once the new
  // geometry is ready; same-site entries can be applied straight away.
  function handleLoad(entry) {
    if (entry.site_id !== selectedId) {
      pendingLoadRef.current = entry
      setSelectedId(entry.site_id)
      return
    }
    setPick({ point: { x: entry.local_x, y: entry.local_y }, inside: true, lat: entry.lat, lon: entry.lng })
    setDirection((entry.direction_deg * Math.PI) / 180)
    setStage('aim')
  }

  return (
    <div className="relative h-full w-full">
      {/* frameloop pauses while another phase is open — the WebGL scene (and
          all viewer state) stays alive at zero render cost, resuming instantly
          on return. shadows="soft" = PCFSoft for board-model shadow edges. */}
      <Canvas
        dpr={[1, 2]}
        frameloop={active ? 'always' : 'never'}
        shadows="soft"
        camera={{ up: UP, position: [0, -120, 120], fov: 45, near: 0.5, far: 8000 }}
        style={{ background: SCENE.sky }}
      >
        <hemisphereLight args={['#fdfcf6', '#e2dccd', 0.85]} />

        {data && (
          <>
            <SceneLighting centroid={data.centroid} radius={data.sceneRadius} />
            <CameraRig
              centroid={data.centroid}
              radius={data.boundaryRadius}
              far={data.sceneRadius}
              resetToken={resetToken}
            />

            {/* Grid lies in the X/Y ground plane (rotated from drei's default X/Z) */}
            <Grid
              rotation={[Math.PI / 2, 0, 0]}
              position={[data.centroid.x, data.centroid.y, 0]}
              args={[data.sceneRadius * 4, data.sceneRadius * 4]}
              cellSize={10}
              cellThickness={0.6}
              cellColor={SCENE.gridCell}
              sectionSize={50}
              sectionThickness={1}
              sectionColor={SCENE.gridSection}
              fadeDistance={data.sceneRadius * 4}
              fadeStrength={1.5}
              followCamera={false}
              infiniteGrid={false}
            />

            <ClickPlane
              centroid={data.centroid}
              radius={data.sceneRadius}
              onGroundDown={handleGroundDown}
              onGroundMove={draw ? handleGroundMove : undefined}
            />

            {data.boundary && <PlazaFloor boundary={data.boundary} />}

            <Buildings buildings={data.buildings} />

            {draw && <DrawingOverlay points={draw.points} cursor={draw.cursor} onCloseVertex={commitDrawing} />}

            {savedProjections.map((p) => (
              <IsovistOverlay key={p.id} result={p.result} dim />
            ))}

            {isovistResult && <IsovistOverlay result={isovistResult} />}

            {savedForSite.map((r) => (
              <Marker
                key={r.id}
                point={{ x: r.local_x, y: r.local_y }}
                inside
                direction={(r.direction_deg * Math.PI) / 180}
                variant="saved"
                onSelect={() => handleLoad(r)}
              />
            ))}

            {pick && (
              <Marker
                point={pick.point}
                inside={pick.inside}
                direction={pick.inside ? direction : null}
              />
            )}

            <CompassUpdater arrowRef={compassRef} />
          </>
        )}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          zoomToCursor
          rotateSpeed={0.6}
          panSpeed={0.9}
          minDistance={5}
          maxDistance={4000}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#b91c1c', '#3f8a52', '#c2410c']} labelColor="#44403c" />
        </GizmoHelper>
      </Canvas>

      <Compass ref={compassRef} onReorient={() => setResetToken((t) => t + 1)} />

      <Panel
        sites={sites}
        selectedId={selectedId}
        onSelect={setSelectedId}
        site={site}
        data={data}
        error={projected.error}
        pick={pick}
        stage={stage}
        direction={direction}
        result={isovistResult}
        onMoveViewpoint={() => setStage('vantage')}
        onSaveResult={handleSaveResult}
        saveError={saveError}
        savedCount={savedForSite.length}
        showSavedProjections={showSavedProjections}
        onToggleSavedProjections={() => setShowSavedProjections((v) => !v)}
        draw={draw}
        buildingNote={buildingNote}
        onStartDrawing={startDrawing}
        onUndoPoint={() => setDraw((d) => (d ? { ...d, points: d.points.slice(0, -1) } : d))}
        onSetDrawHeight={(v) => setDraw((d) => (d ? { ...d, height: v } : d))}
        onFinishDrawing={commitDrawing}
        onCancelDrawing={() => setDraw(null)}
        manualBuildings={manualBuildings}
        onSetManualHeight={setManualHeight}
        onCommitManualEdits={commitManualEdits}
        onDeleteManualBuilding={deleteManualBuilding}
      />

      <SavedResultsPanel
        results={results}
        onDelete={handleDelete}
        onLoad={handleLoad}
      />
    </div>
  )
}

// Key light + fill, scaled to the selected site so the shadow camera always
// covers the whole model at useful resolution. The sun sits south-west and
// high (Z-up world), throwing long soft shadows to the north-east — the
// museum-board look — while the fill keeps shaded faces readable.
function SceneLighting({ centroid, radius }) {
  const target = useMemo(() => new THREE.Object3D(), [])
  const d = Math.max(radius * 1.25, 220)

  return (
    <group>
      <primitive object={target} position={[centroid.x, centroid.y, 0]} />
      <directionalLight
        position={[centroid.x + d * 0.55, centroid.y - d * 0.7, d * 1.05]}
        target={target}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.5}
        shadow-camera-left={-d}
        shadow-camera-right={d}
        shadow-camera-top={d}
        shadow-camera-bottom={-d}
        shadow-camera-near={0.5}
        shadow-camera-far={d * 3.5}
      />
      <directionalLight
        position={[centroid.x - d * 0.5, centroid.y + d * 0.45, d * 0.7]}
        intensity={0.3}
      />
    </group>
  )
}

// Frames the selected plaza in a north-up view (camera south of and above the
// plaza, looking north) whenever the site changes or the reorient button is
// pressed. North (+Y) ends up pointing away/up, east (+X) to the right.
function CameraRig({ centroid, radius, far, resetToken }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useEffect(() => {
    const d = clamp(radius * 3.2, 90, 650)
    camera.up.set(0, 0, 1)
    camera.position.set(centroid.x, centroid.y - d * 0.7, d * 0.85)
    camera.far = Math.max(far * 4, 8000)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(centroid.x, centroid.y, 0)
      controls.update()
    }
  }, [centroid.x, centroid.y, radius, far, resetToken, camera, controls])

  return null
}

// Large ground plane (in the X/Y plane already) that catches clicks anywhere.
// onGroundDown fires on a left-click (viewpoint pick, or a footprint corner when
// drawing); onGroundMove, wired only while drawing, feeds the rubber-band preview.
function ClickPlane({ centroid, radius, onGroundDown, onGroundMove }) {
  const size = Math.max(radius * 6, 400)
  return (
    <mesh
      position={[centroid.x, centroid.y, -0.05]}
      receiveShadow
      onPointerDown={(e) => {
        if (e.button !== 0) return // left-click only; right/middle drive the camera
        e.stopPropagation()
        onGroundDown({ x: e.point.x, y: e.point.y })
      }}
      onPointerMove={onGroundMove ? (e) => onGroundMove({ x: e.point.x, y: e.point.y }) : undefined}
    >
      <planeGeometry args={[size, size]} />
      {/* Matches the sky gradient's horizon tone so the plane's far edge
          dissolves instead of ending in a visible seam */}
      <meshStandardMaterial color={SCENE.paper} roughness={1} />
    </mesh>
  )
}

// Live preview of a building footprint being drawn: the placed corners as dots,
// the edges between them, a rubber-band edge to the current cursor, and (once
// three corners exist) a faint closing edge back to the first corner. The first
// corner is a larger, clickable sphere — clicking it closes and commits the
// shape, the same as the Finish button.
function DrawingOverlay({ points, cursor, onCloseVertex }) {
  const Z = 0.12 // sit just above the ground plane / grid to avoid z-fighting
  const canClose = points.length >= 3

  // Ordered vertices of the preview line: placed corners, then the live cursor,
  // then back to the first corner once the shape has enough points to close.
  const linePoints = useMemo(() => {
    const pts = points.map((p) => new THREE.Vector3(p.x, p.y, Z))
    if (cursor) pts.push(new THREE.Vector3(cursor.x, cursor.y, Z))
    if (points.length >= 2) pts.push(new THREE.Vector3(points[0].x, points[0].y, Z))
    return pts
  }, [points, cursor])

  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints(linePoints.length ? linePoints : [new THREE.Vector3()])
    return g
  }, [linePoints])

  useEffect(() => () => lineGeometry.dispose(), [lineGeometry])

  return (
    <group>
      {linePoints.length >= 2 && (
        <line geometry={lineGeometry}>
          <lineBasicMaterial color={SCENE.isovist} />
        </line>
      )}
      {points.map((p, i) => {
        const first = i === 0
        return (
          <mesh
            key={i}
            position={[p.x, p.y, Z]}
            onPointerDown={
              first && canClose
                ? (e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    onCloseVertex()
                  }
                : undefined
            }
            onPointerOver={
              first && canClose
                ? (e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer'))
                : undefined
            }
            onPointerOut={first && canClose ? () => (document.body.style.cursor = 'default') : undefined}
          >
            <sphereGeometry args={[first ? 1.5 : 1.0, 16, 16]} />
            <meshBasicMaterial color={first ? SCENE.plazaWash : SCENE.isovist} />
          </mesh>
        )
      })}
    </group>
  )
}

// The plaza's open area: a subtle orange wash plus a crisp boundary line, so
// the studied extent reads like a redlined figure on the board.
function PlazaFloor({ boundary }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(p.x, p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [boundary])

  const outline = useMemo(() => {
    const pts = boundary.map((p) => new THREE.Vector3(p.x, p.y, 0.05))
    pts.push(new THREE.Vector3(boundary[0].x, boundary[0].y, 0.05))
    const g = new THREE.BufferGeometry()
    g.setFromPoints(pts)
    return g
  }, [boundary])

  useEffect(
    () => () => {
      geometry.dispose()
      outline.dispose()
    },
    [geometry, outline]
  )

  return (
    <group>
      <mesh geometry={geometry} position={[0, 0, 0.03]} receiveShadow>
        <meshStandardMaterial
          color={SCENE.plazaWash}
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <line geometry={outline}>
        <lineBasicMaterial color={SCENE.plazaWash} transparent opacity={0.55} depthWrite={false} />
      </line>
    </group>
  )
}

const ARROW_SHAPE = new THREE.Shape([
  new THREE.Vector2(0, 4.5),
  new THREE.Vector2(1.1, 0),
  new THREE.Vector2(-1.1, 0),
])
const ARROW_GEOMETRY = new THREE.ShapeGeometry(ARROW_SHAPE)

// The picked viewpoint: a sphere at ~eye height on a thin pole up the +Z axis,
// plus a flat arrow lying on the ground pointing along the chosen viewing
// direction (bearing in radians, 0 = north/+Y, clockwise).
// A vantage-point marker. The 'live' variant (default) is the redline point the
// user is actively placing; the 'saved' variant is a filed reading for this
// site — indigo, slightly smaller, and clickable to reload it onto the viewer.
function Marker({ point, inside, direction, variant = 'live', onSelect }) {
  const saved = variant === 'saved'
  const color = saved ? SCENE.markerSaved : inside ? SCENE.markerInside : SCENE.markerOutside
  const scale = saved ? 0.72 : 1
  // The arrow shape points +Y (north) by default; rotating around Z by
  // -direction turns it to match a clockwise-from-north compass bearing.
  const rotationZ = direction != null ? -direction : 0

  return (
    <group
      position={[point.x, point.y, 0]}
      scale={scale}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect()
            }
          : undefined
      }
      onPointerOver={onSelect ? (e) => (e.stopPropagation(), (document.body.style.cursor = 'pointer')) : undefined}
      onPointerOut={onSelect ? () => (document.body.style.cursor = 'default') : undefined}
    >
      <mesh position={[0, 0, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 1.6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, 1.7]}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {direction != null && (
        <mesh geometry={ARROW_GEOMETRY} position={[0, 0, 0.08]} rotation={[0, 0, rotationZ]}>
          <meshBasicMaterial color={saved ? color : SCENE.arrowInk} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// Rotates the HUD compass each frame so its "N" always points to true north
// (+Y) on screen, based on where the camera is looking.
function CompassUpdater({ arrowRef }) {
  const camera = useThree((s) => s.camera)
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!arrowRef.current) return
    camera.getWorldDirection(dir)
    if (Math.hypot(dir.x, dir.y) < 1e-4) return // looking straight down: heading undefined
    const angle = -Math.atan2(dir.x, dir.y)
    arrowRef.current.style.transform = `rotate(${angle}rad)`
  })

  return null
}

const Compass = ({ ref, onReorient }) => (
  <div className="absolute top-4 right-4 flex flex-col items-center gap-2">
    <div className="relative h-16 w-16 rounded-full border border-line-strong bg-paper/95 shadow-sm">
      <div ref={ref} className="absolute inset-0">
        <div className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-xs font-semibold text-redline">
          N
        </div>
        <div className="absolute left-1/2 top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-full bg-redline" />
        <div className="absolute left-1/2 top-1/2 h-6 w-0.5 -translate-x-1/2 bg-line-strong" />
      </div>
    </div>
    <button
      onClick={onReorient}
      className="flex items-center gap-1.5 rounded-full border border-line-strong bg-paper/95 px-2.5 py-1 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
    >
      <LuCompass aria-hidden className="h-3.5 w-3.5" />
      North-up view
    </button>
  </div>
)

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function Panel({ sites, selectedId, onSelect, site, data, error, pick, stage, direction, result, onMoveViewpoint, onSaveResult, saveError, savedCount, showSavedProjections, onToggleSavedProjections, draw, buildingNote, onStartDrawing, onUndoPoint, onSetDrawHeight, onFinishDrawing, onCancelDrawing, manualBuildings, onSetManualHeight, onCommitManualEdits, onDeleteManualBuilding }) {
  const bearingDeg = direction != null ? Math.round(((direction * 180) / Math.PI + 360) % 360) : null

  return (
    // The panel column caps just above the Saved-results bar and scrolls its
    // own content when the stack outgrows the viewport (small screens, or a
    // long drawn-buildings list) — the outer div stays pointer-transparent so
    // the canvas still receives clicks beside/below the panels.
    <div className="pointer-events-none absolute top-4 bottom-20 left-4 w-80 max-w-[calc(100%-2rem)]">
      <div className="pointer-events-auto -mr-2 max-h-full space-y-3 overflow-y-auto overscroll-contain pr-2 pb-1">
      <div className="rounded-xl border border-line bg-paper/95 p-4 shadow-sm backdrop-blur">
        <label className="mb-1 block font-mono text-xs text-ink-muted">Plaza</label>
        <select
          className="input w-full"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.city}
            </option>
          ))}
        </select>

        {error ? (
          <p className="mt-3 text-sm text-redline">{error}</p>
        ) : (
          <p className="mt-3 font-mono text-xs text-ink-muted">
            {site.city}
            {site.country ? `, ${site.country}` : ''} · {data?.buildings.length ?? 0} buildings
            {data?.boundary ? ' · boundary ✓' : ' · no boundary'}
          </p>
        )}
      </div>

      <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 p-4 text-sm shadow-sm backdrop-blur">
        <p className="flex items-start gap-2.5 text-ink-muted">
          {draw ? (
            <LuPencilRuler aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : stage === 'vantage' ? (
            <LuCrosshair aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : (
            <LuNavigation aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <span>
            {draw ? (
              <>
                <span className="font-medium text-ink">Drawing a building.</span> Click each
                corner on the ground — see the panel below.
              </>
            ) : stage === 'vantage' ? (
              <>
                <span className="font-medium text-ink">Click the ground</span> inside the
                plaza to drop a viewpoint.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">Click anywhere</span> to aim the 120°
                view cone.
              </>
            )}
          </span>
        </p>
        {pick && (
          <div className="mt-2 rounded-lg bg-surface p-2.5 font-mono text-xs text-ink">
            {pick.inside ? (
              <>
                lat {pick.lat.toFixed(6)}, lng {pick.lon.toFixed(6)}
                <br />
                local x {pick.point.x.toFixed(1)} m, y {pick.point.y.toFixed(1)} m
                {bearingDeg != null && (
                  <>
                    <br />
                    facing {bearingDeg}° {bearingLabel(bearingDeg)}
                  </>
                )}
              </>
            ) : (
              <span className="text-warn">That point is outside the plaza boundary.</span>
            )}
          </div>
        )}
        {pick?.inside && (
          <button
            onClick={onMoveViewpoint}
            className="mt-2 rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            Move viewpoint
          </button>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          Left-drag orbit · right-drag pan · scroll zoom · gizmo snaps to views
        </p>
      </div>

      <BuildingTool
        draw={draw}
        note={buildingNote}
        onStart={onStartDrawing}
        onUndo={onUndoPoint}
        onSetHeight={onSetDrawHeight}
        onFinish={onFinishDrawing}
        onCancel={onCancelDrawing}
      />

      {manualBuildings.length > 0 && (
        <DrawnBuildingList
          buildings={manualBuildings}
          onSetHeight={onSetManualHeight}
          onCommit={onCommitManualEdits}
          onDelete={onDeleteManualBuilding}
        />
      )}

      {result && <MetricsPanel result={result} />}

      {result && pick?.inside && direction != null && (
        <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 p-4 shadow-sm backdrop-blur">
          <button
            onClick={onSaveResult}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-primary bg-primary-wash px-3 py-2 text-sm font-medium text-primary-deep shadow-sm transition-all duration-150 hover:bg-primary hover:text-white active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuSave aria-hidden className="h-4 w-4" />
            Save result
          </button>
          {saveError && <p className="mt-2 text-xs text-warn">{saveError}</p>}
        </div>
      )}

      {savedCount > 0 && (
        <label className="pointer-events-auto flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-paper/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm text-ink">
            Show saved projections
            <span className="ml-1 text-ink-faint">({savedCount})</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showSavedProjections}
            onClick={onToggleSavedProjections}
            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
              showSavedProjections ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-paper shadow-sm transition-transform duration-150 ${
                showSavedProjections ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      )}
      </div>
    </div>
  )
}

// Add-a-building tool. Collapsed to a single button until drawing starts; while
// drawing it becomes a small workbench — corner count, height field, and
// Undo / Finish / Cancel. For plazas with a landmark missing from OSM (e.g. the
// Neues Rathaus on Marienplatz) whose absence badly distorts the isovist.
function BuildingTool({ draw, note, onStart, onUndo, onSetHeight, onFinish, onCancel }) {
  if (!draw) {
    return (
      <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 p-4 shadow-sm backdrop-blur">
        <button
          onClick={onStart}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-paper px-3 py-2 text-sm font-medium text-ink shadow-sm transition-all duration-150 hover:border-primary hover:text-primary-deep active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          <LuPencilRuler aria-hidden className="h-4 w-4" />
          Add a missing building
        </button>
        <p className="mt-2 text-xs text-ink-faint">
          Draw a footprint for a building absent from OSM, set its height, and it joins the model
          and the isovist calculation.
        </p>
        {note && (
          <p className={`mt-2 text-xs ${note.kind === 'warn' ? 'text-warn' : 'text-ok'}`}>{note.text}</p>
        )}
      </div>
    )
  }

  const corners = draw.points.length
  const canFinish = corners >= 3

  return (
    <div className="pointer-events-auto rounded-xl border border-primary/40 bg-paper/95 p-4 shadow-sm backdrop-blur">
      <p className="flex items-baseline justify-between border-b border-line pb-1.5">
        <span className="text-sm font-semibold text-ink">Drawing a building</span>
        <span className="font-mono text-xs text-primary">
          {corners} corner{corners === 1 ? '' : 's'}
        </span>
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        Click each corner on the ground. Click the first corner again — or “Finish” — to close the
        shape. Needs at least 3 corners.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        Height (m)
        <input
          className="input w-24 font-mono"
          type="number"
          min="1"
          step="0.5"
          value={draw.height}
          onChange={(e) => onSetHeight(e.target.value)}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onFinish}
          disabled={!canFinish}
          className="rounded-full border border-primary bg-primary-wash px-3 py-1.5 text-xs font-medium text-primary-deep shadow-sm transition-colors duration-150 hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary-wash disabled:hover:text-primary-deep outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          Finish &amp; add
        </button>
        <button
          onClick={onUndo}
          disabled={corners === 0}
          className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
        >
          Undo corner
        </button>
        <button
          onClick={onCancel}
          className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs text-redline shadow-sm transition-colors duration-150 hover:border-redline hover:bg-redline-wash outline-none focus-visible:ring-2 focus-visible:ring-redline-wash"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Lists the hand-drawn buildings on the current plaza so each can be re-heighted
// (metrics recompute live; the value persists on blur) or deleted after drawing.
function DrawnBuildingList({ buildings, onSetHeight, onCommit, onDelete }) {
  return (
    <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 p-4 shadow-sm backdrop-blur">
      <p className="mb-2 flex items-baseline justify-between border-b border-line pb-1.5">
        <span className="text-sm font-semibold text-ink">Drawn buildings</span>
        <span className="font-mono text-xs text-primary">{buildings.length}</span>
      </p>
      <ul className="divide-y divide-line/60">
        {buildings.map((b, n) => (
          <li key={b.index} className="flex items-center gap-2 py-2 text-sm">
            <span className="flex-1 text-ink-muted">
              #{n + 1}
              <span className="ml-1 font-mono text-xs text-ink-faint">{b.corners}-corner</span>
            </span>
            <label className="flex items-center gap-1 text-ink-muted">
              <input
                className="input w-20 font-mono"
                type="number"
                min="1"
                step="0.5"
                value={b.height}
                onChange={(e) => onSetHeight(b.index, e.target.value)}
                onBlur={onCommit}
              />
              m
            </label>
            <button
              onClick={() => onDelete(b.index)}
              className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-redline shadow-sm transition-colors duration-150 hover:border-redline hover:bg-redline-wash outline-none focus-visible:ring-2 focus-visible:ring-redline-wash"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function bearingLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// Live Phase-3 metrics from the shared ray pass.
function MetricsPanel({ result }) {
  return (
    <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 p-4 text-sm shadow-sm backdrop-blur">
      <p className="mb-2 flex items-center justify-between border-b border-line pb-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <LuRadar aria-hidden className="h-4 w-4 text-primary" />
          Isovist metrics
        </span>
        <span className="font-mono text-xs text-primary">live</span>
      </p>
      <dl className="divide-y divide-line/60 font-mono text-xs text-ink">
        <MetricRow label="Area" value={`${result.area.toFixed(1)} m²`} />
        <MetricRow label="Compactness" value={result.compactness.toFixed(4)} />
        <MetricRow label="Occlusivity" value={`${result.occlusivity.toFixed(1)} m`} />
        <MetricRow label="Enclosure ratio" value={result.enclosureRatio.toFixed(4)} />
      </dl>
    </div>
  )
}

function MetricRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

// Rounds to `decimals` places and returns a Number (drops trailing zeros), so
// the saved record and the CSV carry clean numeric values.
function round(v, decimals) {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// Escapes one CSV cell: wraps in quotes and doubles any embedded quotes when the
// value contains a comma, quote, or newline.
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const RESULT_COLUMNS = [
  'id',
  'site_id',
  'site_name',
  'lat',
  'lng',
  'local_x',
  'local_y',
  'direction_deg',
  'area_m2',
  'compactness',
  'occlusivity_m',
  'enclosure_ratio',
  'saved_at',
]

// Client-side CSV download of every saved result (ignores the active filter).
function exportResultsCsv(results) {
  const header = RESULT_COLUMNS.join(',')
  const rows = results.map((r) => RESULT_COLUMNS.map((c) => csvCell(r[c])).join(','))
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'isovist-results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Bottom-left log of saved isovist readings. Collapsed to a single bar by
// default so it never crowds the metrics stack; expands into a scrollable
// table with a per-site filter, plus Load/Delete on each row.
function SavedResultsPanel({ results, onDelete, onLoad }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  // Distinct sites that actually have saved entries, for the filter dropdown.
  const filterSites = useMemo(() => {
    const seen = new Map()
    for (const r of results) if (!seen.has(r.site_id)) seen.set(r.site_id, r.site_name)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [results])

  const visible = filter === 'all' ? results : results.filter((r) => r.site_id === filter)

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 w-[42rem] max-w-[calc(100%-2rem)]">
      <div className="pointer-events-auto rounded-xl border border-line bg-paper/95 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <span className="font-mono text-xs text-ink-muted">{open ? '▾' : '▸'}</span>
            <LuClipboardList aria-hidden className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-ink">Saved results</span>
            <span className="font-mono text-xs text-ink-faint">{results.length}</span>
          </button>
          {open && results.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="input py-1 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All sites</option>
                {filterSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => exportResultsCsv(results)}
                className="flex items-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
              >
                <LuDownload aria-hidden className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          )}
        </div>

        {open && (
          <div className="border-t border-line px-2 pb-2">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-xs text-ink-faint">
                No saved results yet. Place a viewpoint, aim it, then use “Save result”.
              </p>
            ) : (
              <div className="max-h-56 overflow-auto">
                <table className="w-full border-collapse font-mono text-xs text-ink">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="whitespace-nowrap px-2 py-1 font-medium">Plaza</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Area m²</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Compact.</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Occl. m</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Encl.</th>
                      <th className="whitespace-nowrap px-2 py-1 text-right font-medium">Dir°</th>
                      <th className="whitespace-nowrap px-2 py-1 font-medium">Saved</th>
                      <th className="px-2 py-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} className="border-t border-line/60">
                        <td className="whitespace-nowrap px-2 py-1 font-sans text-ink">{r.site_name}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{r.area_m2.toFixed(2)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{r.compactness.toFixed(4)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{r.occlusivity_m.toFixed(2)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{r.enclosure_ratio.toFixed(4)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">{r.direction_deg.toFixed(1)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-ink-muted">{formatSavedAt(r.saved_at)}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">
                          <button
                            onClick={() => onLoad(r)}
                            className="text-primary transition-colors duration-150 hover:text-primary-deep outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
                          >
                            Load
                          </button>
                          <span className="px-1 text-line-strong">·</span>
                          <button
                            onClick={() => onDelete(r.id)}
                            className="text-redline transition-colors duration-150 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-redline-wash"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact local timestamp for the table (the full ISO string lives in the CSV).
function formatSavedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
