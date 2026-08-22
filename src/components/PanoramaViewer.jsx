import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { LuMove, LuTriangleAlert } from 'react-icons/lu'
import { PANORAMA_SETTINGS } from '@/lib/survey360'

// Equirectangular panorama viewer for the perceptual survey.
//
// Hand-rolled on Three.js — already a core dependency — rather than pulling in a
// panorama library, because every constraint this survey needs is a hard
// requirement rather than a preference, and here each one is structural:
//
//   • YAW is free — looking all the way round is the point of the stimulus.
//   • PITCH is clamped, asymmetrically, so nobody spends the comparison
//     staring at sky or pavement — trimmed a little further downward than
//     upward, since the ground carries less of what this study measures.
//   • HORIZONTAL FOV is a module constant, identical for all 18 plazas, and no
//     code path changes it. Zoom cannot drift because zoom does not exist:
//     no wheel handler, no pinch handler, no fov state.
//   • NO AUTOROTATE — the image is still until dragged.
//
// The camera sits at the centre of a sphere with the image mapped on the inside.

const { PITCH_LIMIT_UP_DEG, PITCH_LIMIT_DOWN_DEG, HFOV_DEG } = PANORAMA_SETTINGS
const SPHERE_RADIUS = 500

// Sphere tessellation. Deliberately high.
//
// The texture is interpolated linearly across each triangle, so a coarse sphere
// makes straight horizontal lines — cornices, parapets, the horizon itself —
// visibly swim up and down as the view turns. It reads as the image flickering,
// and it is worst on wide plazas with long unbroken facade lines. At this
// density the error falls below a pixel and the swimming disappears. A few
// thousand extra triangles costs nothing next to a 4096-wide texture.
const SPHERE_SEGMENTS_H = 192
const SPHERE_SEGMENTS_V = 128

// Ceiling on texture width, applied on load.
//
// Three panoramas are on screen at once, each in its own WebGL context. At
// 4096x2048 with mipmaps that is roughly 130 MB of texture memory together,
// which pushes browsers into evicting and re-uploading textures mid-drag — seen
// as the image flickering while the view moves.
//
// The resolution is unusable anyway: with HFOV fixed at 75°, a ~520 px panel
// shows 75° of the full 360°, so it can resolve about 520 x (360/75) ≈ 2500 px
// around. Detail beyond that cannot reach the screen. Capping here keeps the
// source files at full quality on disk while the GPU holds a sane copy.
const MAX_TEXTURE_WIDTH = 2560

// Vertical FOV is what Three's PerspectiveCamera takes, so the fixed horizontal
// FOV has to be converted through the element's aspect ratio.
function verticalFovDeg(hFovDeg, aspect) {
  const h = (hFovDeg * Math.PI) / 180
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 0.0001))
  return (v * 180) / Math.PI
}

// The view angle of a point that sits `offsetPx` from the centre of a frame
// `halfSpanPx` wide, under a perspective projection of half-angle `halfFov`.
//
// This is what makes dragging feel right. A fixed degrees-per-pixel rate cannot
// track the cursor: how much angle a pixel is worth depends on the panel's size
// AND on where in the frame you are, because a rectilinear projection spreads
// the edges of the view over more pixels than the centre (the tan term).
//
// With a fixed rate the image slides relative to your hand — it lagged 22% on
// the narrow triplet panels and ran 32% ahead on the wide rating panel — and
// the brain reads that as the world revolving underneath rather than as turning
// your own head. Inverting the projection instead pins the grabbed point to the
// cursor exactly, at any panel size, which is how a photo viewer should feel.
function viewAngle(offsetPx, halfSpanPx, halfFov) {
  return Math.atan((offsetPx / Math.max(halfSpanPx, 1)) * Math.tan(halfFov))
}

export function PanoramaViewer({ url, label, openingYawDeg = 0, className = '', onError }) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | failed
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let disposed = false
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const el = renderer.domElement
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    el.style.touchAction = 'none'
    el.style.cursor = 'grab'
    mount.appendChild(el)

    let mesh = null
    let texture = null
    let geometry = null

    let yaw = (openingYawDeg * Math.PI) / 180
    let pitch = 0
    // Positive pitch looks up (sky), negative looks down (ground) — see
    // applyCamera below, where y = sin(pitch). The two bounds are therefore
    // independent: up stays generous, down is trimmed slightly.
    const pitchLimitUp = (PITCH_LIMIT_UP_DEG * Math.PI) / 180
    const pitchLimitDown = (PITCH_LIMIT_DOWN_DEG * Math.PI) / 180

    function applyCamera() {
      const rect = mount.getBoundingClientRect()
      const aspect = rect.width / Math.max(rect.height, 1)
      camera.aspect = aspect
      camera.fov = verticalFovDeg(HFOV_DEG, aspect)
      camera.updateProjectionMatrix()
      camera.lookAt(
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw)
      )
    }

    function render() {
      if (!disposed && mesh) renderer.render(scene, camera)
    }

    function resize() {
      const rect = mount.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      renderer.setSize(rect.width, rect.height, false)
      applyCamera()
      render()
    }

    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        if (disposed) {
          tex.dispose()
          return
        }
        // Downsample before upload if the source is larger than the view can
        // resolve. Aspect ratio is preserved, so the coverage maths below is
        // unaffected.
        if (tex.image.width > MAX_TEXTURE_WIDTH) {
          const scale = MAX_TEXTURE_WIDTH / tex.image.width
          const canvas = document.createElement('canvas')
          canvas.width = MAX_TEXTURE_WIDTH
          canvas.height = Math.round(tex.image.height * scale)
          const ctx = canvas.getContext('2d')
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(tex.image, 0, 0, canvas.width, canvas.height)
          tex.image = canvas
        }

        texture = tex
        texture.colorSpace = THREE.SRGBColorSpace
        // The sphere's texture wraps at u=0/u=1 — that seam is where the
        // panorama's 360° sweep closes on itself, and yaw is free, so every
        // survey participant crosses it. Mipmapping and anisotropic filtering
        // (below) sample neighbouring texels on BOTH sides of that seam to
        // build each mip level; the default ClampToEdgeWrapping tells the GPU
        // the texture stops at the edge instead of continuing round, so it
        // smears the edge pixel rather than reaching across. That is the
        // visible seam some panoramas show — worse wherever that column has
        // real detail, which is why it varies by image rather than by which
        // panel shows it. RepeatWrapping on U fixes it by sampling correctly
        // across the wrap. V is left at the default: top and bottom are the
        // zenith and nadir, not a seam, and must not wrap.
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        // A 4096-wide image shown in a ~500 px panel is minified ~8×, and the
        // steepest minification is at grazing angles. Max anisotropy is what
        // keeps facade detail from shimmering as the view moves.
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture.generateMipmaps = true
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.needsUpdate = true

        // A true equirectangular image is 2:1 and covers the full sphere: 360°
        // around, 180° top to bottom. Some sources ship a vertically cropped
        // panorama instead — still 360° around, but less than 180° tall. Mapping
        // one of those onto a full sphere would stretch it and put the horizon
        // in the wrong place, which would silently break the survey's premise
        // that all 18 plazas are framed identically.
        //
        // So the geometry is cut to the band the image actually covers:
        // vertical coverage = 360° / aspect, centred on the horizon. At 2:1 this
        // is exactly a full sphere, so the common case is unchanged.
        const aspect = tex.image.width / tex.image.height
        const coverage = Math.min(Math.PI, (2 * Math.PI) / aspect)
        const thetaStart = (Math.PI - coverage) / 2

        geometry = new THREE.SphereGeometry(
          SPHERE_RADIUS,
          SPHERE_SEGMENTS_H,
          SPHERE_SEGMENTS_V,
          0,
          Math.PI * 2,
          thetaStart,
          coverage
        )
        // Flipped inside-out so the texture faces the camera at its centre.
        geometry.scale(-1, 1, 1)

        mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }))
        scene.add(mesh)
        setStatus('ready')
        resize()
      },
      undefined,
      () => {
        if (disposed) return
        setStatus('failed')
        if (onError) onError(url)
      }
    )

    // --- drag to look around (yaw free, pitch clamped) ---------------------
    //
    // The point under the cursor when the drag began stays under the cursor for
    // the whole drag: the photo sticks to the finger, as in any map or panorama
    // viewer. Angles are recovered by inverting the projection rather than by a
    // per-pixel rate — see viewAngle above.
    let pointerId = null
    let grab = null

    function frame() {
      const rect = mount.getBoundingClientRect()
      const aspect = rect.width / Math.max(rect.height, 1)
      return {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        halfW: rect.width / 2,
        halfH: rect.height / 2,
        halfH_fov: (verticalFovDeg(HFOV_DEG, aspect) * Math.PI) / 360,
        halfW_fov: (HFOV_DEG * Math.PI) / 360,
      }
    }

    function onPointerDown(e) {
      pointerId = e.pointerId
      const f = frame()
      grab = {
        f,
        yaw,
        pitch,
        ax: viewAngle(e.clientX - f.cx, f.halfW, f.halfW_fov),
        ay: viewAngle(e.clientY - f.cy, f.halfH, f.halfH_fov),
      }
      el.setPointerCapture(pointerId)
      el.style.cursor = 'grabbing'
      setDragging(true)
    }

    function onPointerMove(e) {
      if (pointerId === null || e.pointerId !== pointerId || !grab) return
      const { f } = grab

      const ax = viewAngle(e.clientX - f.cx, f.halfW, f.halfW_fov)
      const ay = viewAngle(e.clientY - f.cy, f.halfH, f.halfH_fov)

      // Yaw wraps freely; pitch is hard-clamped, so the horizon can never leave
      // the frame however far someone drags.
      yaw = grab.yaw - (ax - grab.ax)
      pitch = Math.max(-pitchLimitDown, Math.min(pitchLimitUp, grab.pitch + (ay - grab.ay)))

      applyCamera()
      render()
    }

    function endDrag(e) {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return
      try {
        el.releasePointerCapture(pointerId)
      } catch {
        // Capture may already be gone; nothing to release.
      }
      pointerId = null
      grab = null
      el.style.cursor = 'grab'
      setDragging(false)
    }

    // Zoom is not merely unbound — it is actively refused, so a trackpad pinch
    // can neither change the framing nor scroll the page out from under the
    // participant mid-comparison.
    function blockZoom(e) {
      e.preventDefault()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('wheel', blockZoom, { passive: false })
    el.addEventListener('gesturestart', blockZoom)
    el.addEventListener('gesturechange', blockZoom)

    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    return () => {
      disposed = true
      observer.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('wheel', blockZoom)
      el.removeEventListener('gesturestart', blockZoom)
      el.removeEventListener('gesturechange', blockZoom)
      if (geometry) geometry.dispose()
      if (texture) texture.dispose()
      if (mesh) mesh.material.dispose()
      renderer.dispose()
      if (el.parentNode === mount) mount.removeChild(el)
    }
  }, [url, openingYawDeg, onError])

  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xs text-ink-faint">Loading panorama…</span>
        </div>
      )}

      {status === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <LuTriangleAlert aria-hidden className="h-5 w-5 text-redline" />
          <span className="text-sm font-medium text-ink">{label}</span>
          <span className="font-mono text-xs text-ink-faint">panorama missing</span>
        </div>
      )}

      {status === 'ready' && !dragging && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 font-mono text-xs text-paper">
          <LuMove aria-hidden className="h-3 w-3" />
          drag to look around
        </div>
      )}
    </div>
  )
}
