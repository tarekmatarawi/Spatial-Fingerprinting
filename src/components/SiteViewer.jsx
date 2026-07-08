import { useMemo, useState, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import sites from '@/data/sites.json'
import { projectSite, pointInPolygon } from '@/lib/site'
import { Buildings } from './Buildings'

export function SiteViewer() {
  const [selectedId, setSelectedId] = useState(sites[0]?.id)
  const [pick, setPick] = useState(null)

  const site = useMemo(() => sites.find((s) => s.id === selectedId) ?? sites[0], [selectedId])

  const projected = useMemo(() => {
    try {
      return { data: projectSite(site), error: null }
    } catch (err) {
      return { data: null, error: err.message }
    }
  }, [site])

  // Reset the marker whenever the selected site changes
  useEffect(() => setPick(null), [selectedId])

  function handlePick(point) {
    const data = projected.data
    const inside = data.boundary ? pointInPolygon(point, data.boundary) : true
    const { lat, lon } = data.toLatLon(point.x, point.z)
    if (inside) {
      // eslint-disable-next-line no-console
      console.log('[SiteViewer] viewpoint picked', {
        site: site.id,
        local_x_m: +point.x.toFixed(2),
        local_z_m: +point.z.toFixed(2),
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
        camera={{ position: [120, 120, 120], fov: 45, near: 0.5, far: 8000 }}
        style={{ background: '#f8fafc' }}
      >
        <hemisphereLight args={['#ffffff', '#e2e8f0', 1.0]} />
        <directionalLight position={[200, 350, 150]} intensity={1.3} />
        <directionalLight position={[-150, 200, -120]} intensity={0.35} />

        {data && (
          <>
            <CameraRig
              centroid={data.centroid}
              radius={data.boundaryRadius}
              far={data.sceneRadius}
            />

            <Grid
              position={[data.centroid.x, 0, data.centroid.z]}
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
          <GizmoViewport
            axisColors={['#ef4444', '#22c55e', '#3b82f6']}
            labelColor="#334155"
          />
        </GizmoHelper>
      </Canvas>

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

// Repositions the camera and orbit target to frame the selected plaza whenever
// it changes, so switching sites always gives a sensible starting view.
function CameraRig({ centroid, radius, far }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useEffect(() => {
    // Frame on the plaza (its boundary radius) with room for surrounding
    // context, clamped so tiny or huge plazas both land at a usable distance.
    const d = clamp(radius * 3.2, 90, 650)
    camera.position.set(centroid.x + d * 0.62, d * 0.72, centroid.z + d * 0.62)
    camera.far = Math.max(far * 4, 8000)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(centroid.x, 0, centroid.z)
      controls.update()
    }
  }, [centroid.x, centroid.z, radius, far, camera, controls])

  return null
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// Large invisible-ish ground plane that catches clicks anywhere in the scene.
function ClickPlane({ centroid, radius, onPick }) {
  const size = Math.max(radius * 6, 400)
  return (
    <mesh
      position={[centroid.x, -0.02, centroid.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return // left-click only; right/middle drive the camera
        e.stopPropagation()
        onPick({ x: e.point.x, z: e.point.z })
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
    const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(p.x, -p.z)))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [boundary])

  return (
    <mesh geometry={geometry} position={[0, 0.03, 0]}>
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

// The picked viewpoint: a sphere at ~eye height on a thin pole to the ground.
function Marker({ point, inside }) {
  const color = inside ? '#ef4444' : '#f59e0b'
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 1.6, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
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
                local x {pick.point.x.toFixed(1)} m, z {pick.point.z.toFixed(1)} m
              </>
            ) : (
              <span className="text-amber-600">That point is outside the plaza boundary.</span>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Left-drag orbit · right-drag pan · scroll zoom · gizmo (bottom-right) snaps to views
        </p>
      </div>
    </div>
  )
}
