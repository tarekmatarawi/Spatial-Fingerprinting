import { useMemo, useState, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import sites from '@/data/sites.json'
import { projectSite, pointInPolygon } from '@/lib/site'
import { Buildings } from './Buildings'

// The whole scene uses a Z-up world (X = east/right, Y = north/front, Z = up),
// matching CAD tools like Rhino. This also renders each site the correct way
// round (no mirroring), since a top-down view of the X/Y plane is a standard
// map: east right, north up.
const UP = [0, 0, 1]

export function SiteViewer() {
  const [selectedId, setSelectedId] = useState(sites[0]?.id)
  const [pick, setPick] = useState(null)
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

  useEffect(() => setPick(null), [selectedId])

  function handlePick(point) {
    const data = projected.data
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
    }
    setPick({ point, inside, lat, lon })
  }

  const data = projected.data

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ up: UP, position: [0, -120, 120], fov: 45, near: 0.5, far: 8000 }}
        style={{ background: '#f8fafc' }}
      >
        <hemisphereLight args={['#ffffff', '#e2e8f0', 1.0]} />
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
              cellColor="#cbd5e1"
              sectionSize={50}
              sectionThickness={1}
              sectionColor="#94a3b8"
              fadeDistance={data.sceneRadius * 4}
              fadeStrength={1.5}
              followCamera={false}
              infiniteGrid={false}
            />

            <ClickPlane centroid={data.centroid} radius={data.sceneRadius} onPick={handlePick} />

            {data.boundary && <PlazaFloor boundary={data.boundary} />}

            <Buildings buildings={data.buildings} />

            {pick && <Marker point={pick.point} inside={pick.inside} />}

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
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#334155" />
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
      <meshStandardMaterial color="#f8fafc" />
    </mesh>
  )
}

// The plaza's open area, drawn as a subtle tinted floor so its extent is clear.
function PlazaFloor({ boundary }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(p.x, p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [boundary])

  return (
    <mesh geometry={geometry} position={[0, 0, 0.03]}>
      <meshStandardMaterial
        color="#93c5fd"
        transparent
        opacity={0.35}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// The picked viewpoint: a sphere at ~eye height on a thin pole up the +Z axis.
function Marker({ point, inside }) {
  const color = inside ? '#ef4444' : '#f59e0b'
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
    <div className="relative h-16 w-16 rounded-full border border-slate-300 bg-white/95 shadow-sm">
      <div ref={ref} className="absolute inset-0">
        <div className="absolute left-1/2 top-1 -translate-x-1/2 text-xs font-bold text-red-600">
          N
        </div>
        <div className="absolute left-1/2 top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-full bg-red-500" />
        <div className="absolute left-1/2 top-1/2 h-6 w-0.5 -translate-x-1/2 bg-slate-300" />
      </div>
    </div>
    <button
      onClick={onReorient}
      className="rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-100"
    >
      North-up view
    </button>
  </div>
)

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function Panel({ sites, selectedId, onSelect, site, data, error, pick }) {
  return (
    <div className="pointer-events-none absolute top-4 left-4 w-80 max-w-[calc(100%-2rem)] space-y-3">
      <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <label className="mb-1 block text-xs font-medium text-slate-500">Plaza</label>
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
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            {site.city}
            {site.country ? `, ${site.country}` : ''} · {data?.buildings.length ?? 0} buildings
            {data?.boundary ? ' · boundary ✓' : ' · no boundary'}
          </p>
        )}
      </div>

      <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-4 text-sm shadow-sm backdrop-blur">
        <p className="text-slate-600">
          <span className="font-medium text-slate-800">Click the ground</span> inside the plaza to
          drop a viewpoint marker (Phase 3 will compute isovist metrics here).
        </p>
        {pick && (
          <div className="mt-2 rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">
            {pick.inside ? (
              <>
                lat {pick.lat.toFixed(6)}, lng {pick.lon.toFixed(6)}
                <br />
                local x {pick.point.x.toFixed(1)} m, y {pick.point.y.toFixed(1)} m
              </>
            ) : (
              <span className="text-amber-600">That point is outside the plaza boundary.</span>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Left-drag orbit · right-drag pan · scroll zoom · gizmo snaps to views
        </p>
      </div>
    </div>
  )
}
