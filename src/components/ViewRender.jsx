import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { Buildings } from '@/components/Buildings'
import { EYE_HEIGHT_M, lookTarget, verticalFov } from '@/lib/viewGeometry'

// What one 120° view actually looks like.
//
// P7 can prove two views are close in the weighted space, but a reader cannot
// feel four numbers. This renders the view itself: the camera stands at the
// marker's vantage, at eye height, facing its heading, with the same 120°
// field the metrics were measured across — so "these two views are alike"
// becomes something you judge with your eyes rather than take on trust.
//
// It is deliberately the SAME geometry the measurement ran on: the extruded
// building masses from Buildings.jsx, no textures, no invented detail. A
// prettier render with fabricated windows and street furniture would show a
// reader something the isovist never measured, which would make the comparison
// dishonest in the direction that flatters it.
//
// This component is also P8's stimulus generator. The matched-view survey shows
// participants pairs of exactly these renders, so building it here means P8
// starts from something already looked at rather than from a blank file.

export function ViewRender({
  geometry,
  vantage,
  headingDeg,
  fovDeg = 120,
  aspect = 16 / 9,
  className = '',
  label,
}) {
  // Heading is a compass bearing: 0° = north (+Y), increasing clockwise. The
  // scene is Z-up, so the look direction is (sin, cos) in the ground plane.
  // Destructured so the memo depends on the coordinates rather than on the
  // object: the page passes a fresh { x, y } literal each render, so depending
  // on the object would rebuild the camera — and re-aim it — every frame.
  const { x: vx, y: vy } = vantage
  const camera = useMemo(
    () => ({
      position: [vx, vy, EYE_HEIGHT_M],
      target: lookTarget({ x: vx, y: vy }, headingDeg),
      fov: verticalFov(fovDeg, aspect),
      fovDeg,
    }),
    [vx, vy, headingDeg, fovDeg, aspect]
  )

  return (
    <div className={`relative overflow-hidden rounded-md border border-line ${className}`}>
      <Canvas
        dpr={[1, 2]}
        shadows="soft"
        camera={{
          up: [0, 0, 1],
          position: camera.position,
          fov: camera.fov,
          near: 0.1,
          // The metrics stop at 200 m; the render should not show what they did
          // not count, so the far plane matches the cast range.
          far: 220,
        }}
        onCreated={({ camera: cam }) => {
          cam.up.set(0, 0, 1)
          cam.lookAt(...camera.target)
          cam.updateProjectionMatrix()
        }}
        style={{ background: 'linear-gradient(to bottom, #dfe5e4 0%, #eeeade 62%, #f4f2ec 100%)' }}
      >
        <SceneCamera camera={camera} />
        <hemisphereLight args={['#fdfcf6', '#e2dccd', 0.9]} />
        <directionalLight
          position={[vantage.x + 90, vantage.y - 120, 160]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.5}
          shadow-camera-left={-160}
          shadow-camera-right={160}
          shadow-camera-top={160}
          shadow-camera-bottom={-160}
          shadow-camera-near={0.5}
          shadow-camera-far={600}
        />
        <directionalLight
          position={[vantage.x - 80, vantage.y + 70, 110]}
          intensity={0.28}
        />

        <Buildings buildings={geometry.buildings} />

        {/* Ground. Centred on the camera rather than on the plaza, so it always
            reaches the horizon whichever way the view faces. */}
        <mesh position={[vantage.x, vantage.y, 0]} receiveShadow>
          <planeGeometry args={[900, 900]} />
          <meshStandardMaterial color="#f4f2ec" roughness={1} />
        </mesh>
      </Canvas>

      {label && (
        <p className="absolute left-2 top-2 rounded bg-paper/85 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted backdrop-blur-sm">
          {label}
        </p>
      )}
    </div>
  )
}

// Keeps the camera aimed when the vantage or heading changes.
//
// The `camera` prop on <Canvas> is only read when the canvas is first created —
// changing it afterwards does nothing. Without this, clicking a different
// matched pair would leave both frames still showing the first one, which is
// the kind of bug that silently invalidates a comparison rather than breaking
// it visibly.
function SceneCamera({ camera }) {
  const cam = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const [px, py, pz] = camera.position
  const [tx, ty, tz] = camera.target

  useEffect(() => {
    cam.up.set(0, 0, 1)
    cam.position.set(px, py, pz)
    // The vertical FOV depends on the real aspect the canvas ended up with, not
    // the nominal one passed in, so the frame shows the measured 120° at
    // whatever width the layout gives it.
    cam.fov = size.height > 0 ? verticalFov(camera.fovDeg, size.width / size.height) : camera.fov
    cam.lookAt(new THREE.Vector3(tx, ty, tz))
    cam.updateProjectionMatrix()
  }, [cam, px, py, pz, tx, ty, tz, camera.fov, camera.fovDeg, size.width, size.height])

  return null
}
