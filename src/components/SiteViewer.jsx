import { useMemo, useState, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import sites from '@/data/sites.json'
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
// (Three.js doesn't parse oklch() strings). The scene reads as a white
// museum-board model: paper ground, ink lines, indigo isovist, redline marker.
const SCENE = {
  paper: '#ffffff',
  gridCell: '#e6e6ee',
  gridSection: '#cbcbd9',
  plazaWash: '#6a5cc4',
  isovist: '#5748b8',
  wallRibbon: '#c04030',
  markerInside: '#c04030',
  markerOutside: '#8b8b9c',
  arrowInk: '#22223a',
}

// Reference metrics from the original Grasshopper/Decoding Spaces computation
// for Gendarmenmarkt, used only as a rough sanity check on this site (see
// spec Phase 3) — the exact original vantage point/direction weren't logged,
// so this is a soft check, not a strict pass/fail gate.
const GENDARMENMARKT_REFERENCE = {
  siteId: 'Gendarmenmarkt-Berlin',
  area: 12437.877366,
  compactness: 0.269934,
  occlusivity: 354.097561,
  enclosureRatio: 0.330407,
}

export function SiteViewer() {
  const [selectedId, setSelectedId] = useState(sites[0]?.id)
  const [pick, setPick] = useState(null)
  const [direction, setDirection] = useState(null) // compass bearing, radians (0 = north, clockwise)
  const [stage, setStage] = useState('vantage') // 'vantage' = next click sets viewpoint, 'aim' = next click sets facing direction
  const [resetToken, setResetToken] = useState(0)
  const compassRef = useRef(null)

  const site = useMemo(() => sites.find((s) => s.id === selectedId) ?? sites[0], [selectedId])

  const projected = useMemo(() => {
    try {
      return { data: projectSite(site), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [site])

  useEffect(() => {
    setPick(null)
    setDirection(null)
    setStage('vantage')
  }, [selectedId])

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

  const data = projected.data

  const isovistResult = useMemo(() => {
    if (!data || !pick?.inside || direction == null) return null
    return castIsovist(pick.point, direction, data.buildings)
  }, [data, pick, direction])

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ up: UP, position: [0, -120, 120], fov: 45, near: 0.5, far: 8000 }}
        style={{ background: SCENE.paper }}
      >
        <hemisphereLight args={['#ffffff', '#e8e8ef', 1.0]} />
        <directionalLight position={[180, -160, 400]} intensity={1.3} />
        <directionalLight position={[-140, 120, 220]} intensity={0.35} />

        {data && (
          <>
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

            <ClickPlane centroid={data.centroid} radius={data.sceneRadius} onPick={handlePick} />

            {data.boundary && <PlazaFloor boundary={data.boundary} />}

            <Buildings buildings={data.buildings} />

            {isovistResult && <IsovistOverlay result={isovistResult} />}

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
          <GizmoViewport axisColors={['#c04030', '#3f8a52', '#4b3daa']} labelColor="#3c3c52" />
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
      />
    </div>
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
function ClickPlane({ centroid, radius, onPick }) {
  const size = Math.max(radius * 6, 400)
  return (
    <mesh
      position={[centroid.x, centroid.y, -0.05]}
      onPointerDown={(e) => {
        if (e.button !== 0) return // left-click only; right/middle drive the camera
        e.stopPropagation()
        onPick({ x: e.point.x, y: e.point.y })
      }}
    >
      <planeGeometry args={[size, size]} />
      {/* Matches the canvas background so the plane's far edge is invisible */}
      <meshStandardMaterial color={SCENE.paper} />
    </mesh>
  )
}

// The plaza's open area, drawn as a subtle indigo wash so its extent is clear.
function PlazaFloor({ boundary }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(p.x, p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [boundary])

  return (
    <mesh geometry={geometry} position={[0, 0, 0.03]}>
      <meshStandardMaterial
        color={SCENE.plazaWash}
        transparent
        opacity={0.14}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
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
function Marker({ point, inside, direction }) {
  const color = inside ? SCENE.markerInside : SCENE.markerOutside
  // The arrow shape points +Y (north) by default; rotating around Z by
  // -direction turns it to match a clockwise-from-north compass bearing.
  const rotationZ = direction != null ? -direction : 0

  return (
    <group position={[point.x, point.y, 0]}>
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
          <meshBasicMaterial color={SCENE.arrowInk} side={THREE.DoubleSide} />
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
    <div className="relative h-16 w-16 rounded-full border border-line-strong bg-bg/95 shadow-sm">
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
      className="rounded border border-line-strong bg-bg/95 px-2 py-1 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
    >
      North-up view
    </button>
  </div>
)

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function Panel({ sites, selectedId, onSelect, site, data, error, pick, stage, direction, result, onMoveViewpoint }) {
  const bearingDeg = direction != null ? Math.round(((direction * 180) / Math.PI + 360) % 360) : null

  return (
    <div className="pointer-events-none absolute top-4 left-4 w-80 max-w-[calc(100%-2rem)] space-y-3">
      <div className="pointer-events-auto rounded border border-line bg-bg/95 p-4 shadow-sm backdrop-blur">
        <label className="mb-1 block font-mono text-[11px] text-ink-muted">Plaza</label>
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

      <div className="pointer-events-auto rounded border border-line bg-bg/95 p-4 text-sm shadow-sm backdrop-blur">
        <p className="text-ink-muted">
          {stage === 'vantage' ? (
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
        </p>
        {pick && (
          <div className="mt-2 rounded bg-surface p-2 font-mono text-xs text-ink">
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
            className="mt-2 rounded border border-line-strong bg-bg px-2 py-1 text-xs text-ink-muted shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            Move viewpoint
          </button>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          Left-drag orbit · right-drag pan · scroll zoom · gizmo snaps to views
        </p>
      </div>

      {result && <MetricsPanel result={result} site={site} />}
    </div>
  )
}

function bearingLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// Live Phase-3 metrics from the shared ray pass, plus a soft sanity check
// against the Gendarmenmarkt Grasshopper reference values when that site is
// selected (see GENDARMENMARKT_REFERENCE above — not a strict validation,
// since the original vantage point/direction weren't recorded).
function MetricsPanel({ result, site }) {
  const ref = site.id === GENDARMENMARKT_REFERENCE.siteId ? GENDARMENMARKT_REFERENCE : null

  return (
    <div className="pointer-events-auto rounded border border-line bg-bg/95 p-4 text-sm shadow-sm backdrop-blur">
      <p className="mb-2 flex items-baseline justify-between border-b border-line pb-1.5">
        <span className="text-sm font-semibold text-ink">Isovist metrics</span>
        <span className="font-mono text-[11px] text-primary">live</span>
      </p>
      <dl className="divide-y divide-line/60 font-mono text-xs text-ink">
        <MetricRow label="Area" value={`${result.area.toFixed(1)} m²`} refValue={ref && `${ref.area.toFixed(1)} m²`} />
        <MetricRow label="Compactness" value={result.compactness.toFixed(4)} refValue={ref && ref.compactness.toFixed(4)} />
        <MetricRow
          label="Occlusivity"
          value={`${result.occlusivity.toFixed(1)} m`}
          refValue={ref && `${ref.occlusivity.toFixed(1)} m`}
        />
        <MetricRow
          label="Enclosure ratio"
          value={result.enclosureRatio.toFixed(4)}
          refValue={ref && ref.enclosureRatio.toFixed(4)}
        />
      </dl>
      {ref && (
        <p className="mt-2 text-xs text-ink-faint">
          Reference values are from the original Grasshopper run at an unrecorded vantage
          point/direction — treat as a rough sanity check, not an exact match.
        </p>
      )}
    </div>
  )
}

function MetricRow({ label, value, refValue }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">
        {value}
        {refValue && <span className="ml-1.5 text-ink-faint">(ref {refValue})</span>}
      </dd>
    </div>
  )
}
