import { Component, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { Buildings } from '@/components/Buildings'
import { GROUND_STOREY_M, partBlocks, recessedGroundRing } from '@/lib/presets'
import { allParts } from '@/lib/sandbox'
import { zoneColour } from '@/lib/zones'

// P9 Tier B — the intervention in three dimensions.
//
// ONE ENVELOPE, DRAWN PROPERLY.
//
// Every object here is built from the same footprint, base and top that
// lib/presets.js generates and lib/sandbox.js casts against. What this file
// adds is ARTICULATION INSIDE that envelope: a trunk is drawn as a cylinder
// inscribed in the square the engine measured, a canopy as a faceted sphere
// inscribed in its octagon, a colonnade's columns as cylinders inside their
// squares. Nothing rendered ever exceeds the measured envelope, so the picture
// cannot show a reader more building than the numbers counted — which is the
// specific dishonesty a prettier 3D view invites.
//
// Where a part is invisible to the measurement anyway — a pergola roof four
// metres up, a canopy above the slice — the articulation is freer, because
// there is no measurement for it to misrepresent. The pergola's slats are the
// clearest case: openness is a real design parameter that a plan-level cast has
// no way to register, so it shapes the drawing and nothing else.
//
// THE PLAN REMAINS WHERE THINGS ARE PLACED. A plan shows the whole
// distribution at once and a click lands where you meant it. This view is for
// judging what was placed: whether a canopy clears the ground, whether a screen
// reads as a wall or a fence, whether a loggia looks like a loggia.

/* ------------------------------------------------------------- model palette */

// A painted architectural model, not a photoreal render. The platform already
// draws surveyed buildings as museum board; interventions are the same model in
// materials, so the two read as one object rather than two graphic languages.
//
// KEYED TO THE PROJECT'S OWN TOKENS, not to a separate idea of what materials
// look like. The cream masonry is the `surface` token the whole platform draws
// panels in; the accent is the technical-pen orange from charts/tokens.js;
// greens are muted towards the `ok` token rather than borrowed from a garden
// centre. An earlier pass invented bronze and granite, which looked like a
// different application had been pasted into this one.
const MATERIALS = {
  masonry: { color: '#eae6db', roughness: 0.9, metalness: 0 },
  masonryDeep: { color: '#d4c9b4', roughness: 0.88, metalness: 0 },
  timber: { color: '#b98a57', roughness: 0.82, metalness: 0 },
  foliage: { color: '#62805a', roughness: 1, metalness: 0 },
  foliageDeep: { color: '#4f6b49', roughness: 1, metalness: 0 },
  bark: { color: '#6e5a45', roughness: 0.95, metalness: 0 },
  // The technical-pen orange. Reserved for the one object in the library whose
  // whole job is to be looked at.
  accent: { color: '#c2410c', roughness: 0.62, metalness: 0.08 },
  canvas: { color: '#f2eadc', roughness: 0.95, metalness: 0 },
  // Freestanding walls and screens, one value deeper than the surveyed board.
  //
  // They were drawn in the same cream as the buildings, and a 300 mm slab in
  // the same colour as everything behind it reads as a blank card rather than
  // as masonry — the one element in the library whose whole job is to be a
  // surface had the least surface of any of them. Still inside the platform's
  // palette, so an intervention is recognisably the same model; separated by
  // value rather than by hue, so it does not become a different graphic
  // language.
  stone: { color: '#ded5c2', roughness: 0.87, metalness: 0 },
  // Copings, cornices and parapet caps. Dark enough to draw the line that
  // separates a wall from a slab at model scale.
  coping: { color: '#b3a68d', roughness: 0.8, metalness: 0 },
}

const ROLE_MATERIAL = {
  trunk: 'bark',
  canopy: 'foliage',
  column: 'masonry',
  roof: 'timber',
  post: 'timber',
  stall: 'masonryDeep',
  screen: 'stone',
  wall: 'stone',
  plinth: 'masonry',
  step: 'masonry',
  solid: 'masonryDeep',
  freeform: 'masonryDeep',
}

const EDGE_COLOUR = '#8a3c18'

// How solid an intervention outside the 1.6 m slice is drawn.
//
// It still has to read as "the metrics did not count this", but at 0.5 a
// stepped plinth and a low wall dissolved into the ground and stopped
// conveying their own design idea at all. Ghosting is a caption, not a licence
// to make the object unreadable — and the hollow, dashed treatment on the PLAN
// already carries the same signal without costing legibility there.
const UNMEASURED_OPACITY = 0.88

// Shared unit primitives, pre-oriented to this project's Z-up world and reused
// by every mesh through scaling. Building geometry per part per frame would
// allocate on every slider tick; scaling a shared buffer costs nothing.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2)
const UNIT_BLOB = new THREE.IcosahedronGeometry(0.5, 1)
// A four-sided tapering shaft and its pyramidal cap — an obelisk in two pieces.
// Four radial segments put the corners on the diagonals, so both are turned an
// extra 45° at use to square them with their own footprint.
const UNIT_SHAFT = new THREE.CylinderGeometry(0.34, 0.5, 1, 4).rotateX(Math.PI / 2)
const UNIT_PYRAMID = new THREE.CylinderGeometry(0, 0.5, 1, 4).rotateX(Math.PI / 2)

/* ------------------------------------------------------------------- frames */

// The oriented box a part's footprint describes: centre, the two side lengths,
// and the angle of its first edge. Preset parts are all rotated rectangles or
// regular polygons, so this recovers exactly the frame the generator laid them
// out in — which is what lets a cylinder sit squarely inside its own square
// rather than inside an axis-aligned bounding box that ignores rotation.
function frameOf(footprint) {
  const n = footprint.length
  let cx = 0
  let cy = 0
  for (const p of footprint) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n

  if (n === 4) {
    const [a, b, , d] = footprint
    return {
      cx,
      cy,
      w: Math.hypot(b.x - a.x, b.y - a.y),
      d: Math.hypot(d.x - a.x, d.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }

  // Regular polygons (a tree canopy) have no meaningful first edge; the
  // circumscribed extent is the honest frame.
  let maxX = -Infinity
  let minX = Infinity
  let maxY = -Infinity
  let minY = Infinity
  for (const p of footprint) {
    if (p.x > maxX) maxX = p.x
    if (p.x < minX) minX = p.x
    if (p.y > maxY) maxY = p.y
    if (p.y < minY) minY = p.y
  }
  return { cx, cy, w: maxX - minX, d: maxY - minY, angle: 0 }
}

/* -------------------------------------------------------------- the objects */

// One material, applied consistently: selection tint, ghosting for anything
// outside the measured slice, and the material's own finish otherwise. Written
// once so an assembly of six meshes cannot drift into six slightly different
// treatments of the same state.
function Surface({ material, dimmed, selected }) {
  return (
    <meshStandardMaterial
      color={selected ? '#e2632f' : material.color}
      roughness={material.roughness}
      metalness={material.metalness ?? 0}
      transparent={dimmed}
      opacity={dimmed ? UNMEASURED_OPACITY : 1}
      emissive={selected ? '#7a2d10' : '#000000'}
      emissiveIntensity={selected ? 0.22 : 0}
    />
  )
}

// One part, drawn as the thing it is.
function PartMesh({ part, dimmed, selected }) {
  const f = useMemo(() => frameOf(part.footprint), [part.footprint])
  const h = Math.max(0.05, part.top - part.base)
  const material = MATERIALS[ROLE_MATERIAL[part.role] ?? 'masonryDeep']

  const common = {
    castShadow: true,
    receiveShadow: !dimmed,
  }
  const colour = selected ? '#e2632f' : material.color
  const surface = (
    <meshStandardMaterial
      color={colour}
      roughness={material.roughness}
      metalness={material.metalness}
      transparent={dimmed}
      opacity={dimmed ? UNMEASURED_OPACITY : 1}
      emissive={selected ? '#7a2d10' : '#000000'}
      emissiveIntensity={selected ? 0.22 : 0}
    />
  )

  // Round things are round. A tree trunk, an arcade column and a pergola post
  // are all cylinders in the world and all squares in the measurement, because
  // the cast works from footprints; drawing them square was the single biggest
  // reason the model read as a diagram rather than a place.
  if (part.role === 'trunk' || part.role === 'column' || part.role === 'post') {
    const diameter = Math.min(f.w, f.d)
    return (
      <mesh
        {...common}
        geometry={UNIT_CYLINDER}
        position={[f.cx, f.cy, part.base + h / 2]}
        scale={[diameter, diameter, h]}
      >
        {surface}
      </mesh>
    )
  }

  // A faceted blob rather than a smooth sphere: this is a painted model, and a
  // model tree is carved, not photographed.
  if (part.role === 'canopy') {
    // Alternating greens, keyed off position so the variation is stable rather
    // than reshuffling on every render. A row of identical blobs reads as a
    // hedge; a row of slightly different ones reads as trees.
    const deep = (Math.round(f.cx + f.cy) % 2 + 2) % 2 === 0
    return (
      <mesh {...common} position={[f.cx, f.cy, part.base + h / 2]} geometry={UNIT_BLOB} scale={[f.w, f.d, h]}>
        <Surface material={deep ? MATERIALS.foliageDeep : MATERIALS.foliage} dimmed={dimmed} selected={selected} />
      </mesh>
    )
  }

  // A stall is a box under a shallow pitched awning; the awning stays inside
  // the measured footprint rather than oversailing it.
  if (part.role === 'stall') {
    const body = h * 0.72
    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        <mesh {...common} geometry={UNIT_BOX} position={[0, 0, body / 2]} scale={[f.w, f.d, body]}>
          {surface}
        </mesh>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, body + (h - body) / 2]}
          rotation={[0.16, 0, 0]}
          scale={[f.w, f.d * 0.98, (h - body) * 0.5]}
        >
          <Surface material={MATERIALS.canvas} dimmed={dimmed} selected={selected} />
        </mesh>
      </group>
    )
  }

  // A pergola roof is a frame of slats. Openness has no effect on any metric —
  // the roof sits well above the measured slice — so it shapes the drawing
  // alone, which is exactly where a parameter the instrument cannot see belongs.
  if (part.role === 'roof' && Number.isFinite(part.openness)) {
    const slats = 11
    const open = Math.min(0.85, Math.max(0, part.openness / 100))
    const slatWidth = (f.d / slats) * (1 - open)
    return (
      <group position={[f.cx, f.cy, part.base + h / 2]} rotation={[0, 0, f.angle]}>
        {Array.from({ length: slats }, (_, i) => (
          <mesh
            key={i}
            {...common}
            geometry={UNIT_BOX}
            position={[0, -f.d / 2 + (f.d / slats) * (i + 0.5), 0]}
            scale={[f.w, Math.max(0.05, slatWidth), h]}
          >
            {surface}
          </mesh>
        ))}
        {/* The two beams the slats sit on, so the roof reads as built rather
            than as a set of floating bars. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            {...common}
            geometry={UNIT_BOX}
            position={[(side * f.w) / 2, 0, 0]}
            scale={[0.2, f.d, h]}
          >
            {surface}
          </mesh>
        ))}
      </group>
    )
  }

  // A LANDMARK IS A MONUMENT, drawn as an obelisk: a low stepped base, a
  // tapering shaft, and a pyramidal cap.
  //
  // ABSTRACT ON PURPOSE. An earlier version modelled a figure — torso, head,
  // raised arm — and at model scale a raised arm does not read as civic
  // sculpture, it reads as a gallows. A tapering shaft carries the same
  // meaning (something placed here to be looked at and navigated by) without
  // depicting anything, which also makes it honest: the preset is a generic
  // landmark, so it should not commit to what the landmark depicts.
  //
  // The assembly is inscribed in the measured envelope — the base fills the
  // footprint, the shaft is slender and centred, the cap finishes at exactly
  //  — so what obstructs the isovist is still the footprint the engine
  // was handed.
  if (part.role === 'solid') {
    const stepH = Math.min(0.3, h * 0.05)
    const baseH = stepH * 2
    const capH = (h - baseH) * 0.16
    const shaftH = h - baseH - capH
    const shaftW = Math.min(f.w, f.d) * 0.38

    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        <mesh {...common} geometry={UNIT_BOX} position={[0, 0, part.base + stepH / 2]} scale={[f.w, f.d, stepH]}>
          <Surface material={MATERIALS.masonryDeep} dimmed={dimmed} selected={selected} />
        </mesh>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + stepH * 1.5]}
          scale={[f.w * 0.74, f.d * 0.74, stepH]}
        >
          <Surface material={MATERIALS.masonryDeep} dimmed={dimmed} selected={selected} />
        </mesh>

        <mesh
          {...common}
          geometry={UNIT_SHAFT}
          position={[0, 0, part.base + baseH + shaftH / 2]}
          rotation={[0, 0, Math.PI / 4]}
          scale={[shaftW, shaftW, shaftH]}
        >
          <Surface material={MATERIALS.accent} dimmed={dimmed} selected={selected} />
        </mesh>
        <mesh
          {...common}
          geometry={UNIT_PYRAMID}
          position={[0, 0, part.base + baseH + shaftH + capH / 2]}
          rotation={[0, 0, Math.PI / 4]}
          scale={[shaftW * 0.68, shaftW * 0.68, capH]}
        >
          <Surface material={MATERIALS.accent} dimmed={dimmed} selected={selected} />
        </mesh>
      </group>
    )
  }

  // A PLINTH IS A FLIGHT OF STEPS, so it is drawn as a stack of them rather
  // than as one slab. It sits below the measured slice and is ghosted for it,
  // but ghosting a featureless block left nothing to recognise; a stepped stack
  // still reads as somewhere to sit.
  if (part.role === 'plinth') {
    const treads = Math.max(2, Math.min(4, Math.round(h / 0.35)))
    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        {Array.from({ length: treads }, (_, i) => {
          const inset = 1 - (i / treads) * 0.22
          const zH = h / treads
          return (
            <mesh
              key={i}
              {...common}
              geometry={UNIT_BOX}
              position={[0, 0, part.base + zH * i + zH / 2]}
              scale={[f.w * inset, f.d * inset, zH]}
            >
              <Surface material={MATERIALS.masonry} dimmed={dimmed} selected={selected} />
            </mesh>
          )
        })}
      </group>
    )
  }

  // A WALL IS PIERS, A RECESSED FIELD, A BASE COURSE AND A COPING.
  //
  // It used to be a slab with a cap, which at 300 mm thick and up to 6 m tall
  // is a card standing on edge — the least convincing object in the library,
  // and the one whose entire purpose is to be a surface you read as built.
  //
  // The articulation costs nothing in honesty because it all happens INSIDE the
  // measured footprint: the piers are the full 300 mm the engine was handed and
  // the field between them is set BACK from it, so every surface the isovist
  // stopped at is still there or behind. Nothing oversails except the coping,
  // by 25 mm a side, which is the one place a model needs a shadow line to
  // separate a wall from a slab.
  if (part.role === 'wall' || part.role === 'screen') {
    const cap = Math.min(0.22, h * 0.11)
    const plinth = Math.min(0.3, h * 0.09)
    const field = h - cap - plinth
    // Piers at the ends, and intermediate ones on a long run so a 40 m screen
    // reads as a built wall rather than as an extruded line. Sized off height,
    // not length, because a pier is a proportion of the thing it holds up.
    const pierW = Math.min(0.75, Math.max(0.35, h * 0.13))
    const bays = Math.max(1, Math.round(f.w / Math.max(4, h * 1.6)))
    const piers = Array.from({ length: bays + 1 }, (_, i) =>
      -f.w / 2 + pierW / 2 + (i * (f.w - pierW)) / bays
    )

    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        {/* Base course, full thickness. */}
        <mesh {...common} geometry={UNIT_BOX} position={[0, 0, part.base + plinth / 2]} scale={[f.w, f.d, plinth]}>
          <Surface material={MATERIALS.coping} dimmed={dimmed} selected={selected} />
        </mesh>

        {/* The field, set back from the measured face on both sides. */}
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + plinth + field / 2]}
          scale={[f.w, f.d * 0.72, field]}
        >
          {surface}
        </mesh>

        {/* Piers, at the full measured thickness. */}
        {piers.map((u, i) => (
          <mesh
            key={i}
            {...common}
            geometry={UNIT_BOX}
            position={[u, 0, part.base + plinth + field / 2]}
            scale={[pierW, f.d, field]}
          >
            {surface}
          </mesh>
        ))}

        {/* Coping. The only thing that leaves the envelope, by 25 mm a side. */}
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + h - cap / 2]}
          scale={[f.w, f.d + 0.05, cap]}
        >
          <Surface material={MATERIALS.coping} dimmed={dimmed} selected={selected} />
        </mesh>
      </group>
    )
  }

  // A COLONNADE ROOF IS AN ENTABLATURE, not a slab: a deeper architrave with a
  // shallower cornice above it. Both stay inside the measured footprint — the
  // cornice is the full depth and the architrave is set back — so the
  // projection reads without anything oversailing.
  if (part.role === 'roof') {
    const cornice = Math.max(0.12, h * 0.34)
    const architrave = h - cornice
    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + architrave / 2]}
          scale={[f.w * 0.985, f.d * 0.82, architrave]}
        >
          {surface}
        </mesh>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + architrave + cornice / 2]}
          scale={[f.w, f.d, cornice]}
        >
          <Surface material={MATERIALS.coping} dimmed={dimmed} selected={selected} />
        </mesh>
      </group>
    )
  }

  // A FREEHAND MASS GETS A PARAPET. It is the one element with no design
  // intent behind its shape, so it should not pretend to detail it does not
  // have — but a bare extrusion reads as a placeholder, and a parapet band is
  // enough to say "this is a building" without inventing a facade.
  if (part.role === 'freeform') {
    const parapet = Math.min(0.7, h * 0.06)
    return (
      <group position={[f.cx, f.cy, 0]} rotation={[0, 0, f.angle]}>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + (h - parapet) / 2]}
          scale={[f.w * 0.97, f.d * 0.97, h - parapet]}
        >
          {surface}
        </mesh>
        <mesh
          {...common}
          geometry={UNIT_BOX}
          position={[0, 0, part.base + h - parapet / 2]}
          scale={[f.w, f.d, parapet]}
        >
          <Surface material={MATERIALS.coping} dimmed={dimmed} selected={selected} />
        </mesh>
      </group>
    )
  }

  // Only `step` reaches here now, and it is a box because it IS one: a 150 mm
  // tread 800 mm wide around a plinth. Articulating it further would be
  // inventing detail the preset does not have, which is the failure this file
  // spends most of its length avoiding. It shares the plinth's material because
  // it is part of the same object.
  return (
    <mesh
      {...common}
      geometry={UNIT_BOX}
      position={[f.cx, f.cy, part.base + h / 2]}
      rotation={[0, 0, f.angle]}
      scale={[f.w, f.d, h]}
    >
      {surface}
    </mesh>
  )
}

function InterventionMasses({ masses, selectedId }) {
  const parts = useMemo(() => allParts(masses), [masses])
  return (
    <group>
      {parts.map((part, i) => (
        <PartMesh
          key={`${part.elementId}-${i}`}
          part={part}
          // Outside the measured slice: drawn, and drawn as uncounted.
          dimmed={!partBlocks(part)}
          selected={part.elementId === selectedId}
        />
      ))}
    </group>
  )
}

/* ---------------------------------------------------------- recessed hosts */

// A building with a loggia cut into its ground storey.
//
// Two extrusions, not one: the ground band uses the NOTCHED ring, the storeys
// above use the original. That is a true void — you can see into the recess and
// the piers stand in front of it — reached without a CSG library, because a
// recess along one facade leaves the outline a simple polygon.
function RecessedHost({ host, edgeIndex, cut, selected }) {
  const geom = useMemo(() => {
    if (!host?.footprint || !cut?.opening) return { fill: null, edges: null }
    try {
      const ground = Math.min(GROUND_STOREY_M, host.height)
      const notched = recessedGroundRing(host.footprint, edgeIndex, cut)
      const parts = [{ footprint: notched, base: 0, top: ground }]
      if (host.height > ground) {
        parts.push({ footprint: host.footprint, base: ground, top: host.height })
      }
      for (const pier of cut.piers) parts.push({ footprint: pier, base: 0, top: ground })
      return mergeParts(parts)
    } catch {
      // A host that cannot be triangulated is not worth taking the whole page
      // down for; the plan and the measurement are unaffected either way.
      return { fill: null, edges: null }
    }
  }, [host, edgeIndex, cut])

  if (!geom.fill) return null
  return (
    <group>
      <mesh geometry={geom.fill} castShadow receiveShadow>
        <meshStandardMaterial color={selected ? '#f3e7dc' : '#faf8f2'} roughness={0.92} metalness={0} />
      </mesh>
      {geom.edges && (
        <lineSegments geometry={geom.edges}>
          <lineBasicMaterial color={selected ? EDGE_COLOUR : '#44403c'} />
        </lineSegments>
      )}
    </group>
  )
}

function mergeParts(parts) {
  const fills = []
  const edges = []
  for (const part of parts) {
    const depth = part.top - part.base
    if (!(depth > 0) || !Array.isArray(part.footprint) || part.footprint.length < 3) continue

    let ring = part.footprint
    if (signedArea(ring) < 0) ring = ring.slice().reverse()

    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)))
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    if (part.base) geometry.translate(0, 0, part.base)
    fills.push(geometry)
    edges.push(new THREE.EdgesGeometry(geometry, 25))
  }

  if (!fills.length) return { fill: null, edges: null }
  const fill = mergeGeometries(fills, false)
  const edgeGeometry = mergeGeometries(edges, false)
  fills.forEach((g) => g.dispose())
  edges.forEach((g) => g.dispose())
  return { fill, edges: edgeGeometry }
}

function signedArea(ring) {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

// The plaza boundary as a ground ribbon.
//
// Drawn as geometry rather than as a dashed line: THREE.LineDashedMaterial
// needs computeLineDistances() to have been called, and without it the shader
// has no lineDistance attribute to read — which is a WebGL failure, not a
// cosmetic one. A thin ribbon needs no such contract.
// The zone map, laid on the ground under the model.
//
// ADDED 2026-09-10. The plan and the model were showing two different things
// about the same plaza: the plan carried the measurement (every sampled point
// coloured by its type) and the model carried the design. Judging whether an
// intervention did what you wanted meant flipping between them and holding one
// in your head, which is exactly the comparison-by-memory the before/after
// toggle exists to avoid elsewhere.
//
// This puts the measurement under the design. A carpet of small squares, one
// per sampled point, on the ground where the reading was taken.
//
// DRAWN AS ONE INSTANCED MESH. Konstablerwache samples 967 points; 967 separate
// meshes would cost 967 draw calls a frame and make orbiting stutter on the
// laptop this is used on. One instanced mesh with a per-instance colour is a
// single call and does not care how many points there are.
//
// meshBasicMaterial, not standard: these are DATA, not ground. Letting the
// scene's key light shade them would make the same zone read as two colours
// across the square depending on where the sun fell, which for a categorical
// palette is simply wrong. Unlit keeps a colour meaning one thing everywhere.
//
// It sits at z = 0.03 — above the ground plane at −0.02 and below the boundary
// ribbon at 0.06, so the ribbon still reads on top of it. Nothing casts or
// receives a shadow: a shadow falling across a category would be read as a
// different category.
function ZoneCarpet({ cells, spacing, opacity }) {
  const mesh = useRef(null)

  // Slightly under the sample spacing, so the squares read as a lattice of
  // readings rather than as a continuous painted surface. A continuous field
  // would imply the plaza was measured everywhere; it was measured at these
  // points, and the plan draws them the same way.
  //
  // PlaneGeometry already lies in the XY plane facing +Z, which is flat on the
  // ground in this Z-up world — no rotation needed, and adding one would tip
  // every square on edge.
  const geometry = useMemo(() => new THREE.PlaneGeometry(spacing * 0.78, spacing * 0.78), [spacing])

  // Position AND colour are set per instance here.
  //
  // COLOUR GOES THROUGH setColorAt, NOT a geometry colour attribute. A colour
  // attribute on the geometry is per-VERTEX and an InstancedMesh shares one
  // geometry across every instance, so it would paint all 967 squares the same
  // colour — a zone map that looks like a working zone map and shows one zone.
  // `instanceColor` is the per-instance channel, and three.js switches the
  // shader onto it automatically once setColorAt has allocated it.
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    cells.forEach((cell, i) => {
      dummy.position.set(cell.p.x, cell.p.y, 0.03)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // A point a mass now stands on is drawn grey: it left the sample, and
      // painting it with the type it used to have would show a reading taken
      // from inside a building.
      colour.set(cell.state === 'dropped' ? '#9AA0A8' : zoneColour(cell.zone))
      m.setColorAt(i, colour)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cells])

  // Keyed on the count so the instanced mesh is rebuilt when the number of
  // cells changes. three.js fixes an InstancedMesh's count at construction, and
  // reusing one across a change would leave stale instances drawn at the end of
  // the buffer — points no longer in the sample, still lit on the ground.
  return (
    <instancedMesh
      key={cells.length}
      ref={mesh}
      args={[geometry, undefined, cells.length]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

// The selected area, on the ground in the model.
//
// The same markup red the plan uses for it, and for the same reason: it is
// something the researcher put there, not something measured. Without it the
// model gives no way to tell where the numbers in the readout are coming from,
// so you can be looking at a colonnade while reading a diagnosis of a corner
// twenty metres behind you.
function SelectionRing({ centre, radius }) {
  const geometry = useMemo(
    () => new THREE.RingGeometry(Math.max(0.1, radius - 0.45), radius, 96),
    [radius]
  )
  return (
    <mesh geometry={geometry} position={[centre.x, centre.y, 0.05]}>
      <meshBasicMaterial
        color="#a2382a"
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function BoundaryRibbon({ boundary }) {
  const geometry = useMemo(() => {
    const width = 0.35
    const positions = []
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i]
      const b = boundary[(i + 1) % boundary.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) continue
      const nx = (-dy / len) * width
      const ny = (dx / len) * width
      positions.push(
        a.x + nx, a.y + ny, 0.06, a.x - nx, a.y - ny, 0.06, b.x + nx, b.y + ny, 0.06,
        b.x - nx, b.y - ny, 0.06, b.x + nx, b.y + ny, 0.06, a.x - nx, a.y - ny, 0.06
      )
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.computeVertexNormals()
    return g
  }, [boundary])

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#b45309" transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ---------------------------------------------------------------- the scene */

export function SandboxScene({
  geometry,
  masses,
  recesses,
  selectedElementId = null,
  active = true,
  className = '',
  // The measurement, laid under the design. Off by default: the model is for
  // judging what was placed, and a permanent carpet of colour under it would
  // compete with the thing being judged.
  zoneCells = null,
  zoneSpacing = 2.5,
  zoneOpacity = 0.72,
  selection = null,
  selectionRadius = 0,
  demolished = null,
}) {
  const camera = useMemo(() => {
    const { x, y } = geometry.centroid
    const r = Math.max(40, geometry.boundaryRadius)
    return {
      position: [x + r * 1.15, y - r * 1.5, r * 1.05],
      target: [x, y, 0],
      far: r * 12,
    }
  }, [geometry])

  const recessedHosts = useMemo(
    () => new Set(recesses.map((r) => r.element.building)),
    [recesses]
  )
  // A demolished building is simply not built. Unlike the plan, which outlines
  // it so the designer can see what they removed, the model has to show the
  // square as it would actually stand — a ghosted volume in three dimensions
  // would read as a real one from most angles, which is the specific
  // dishonesty this whole file is written to avoid.
  const untouched = useMemo(
    () => geometry.buildings.filter((_, i) => !recessedHosts.has(i) && !demolished?.has(i)),
    [geometry, recessedHosts, demolished]
  )
  const liveRecesses = useMemo(
    () => recesses.filter((r) => !demolished?.has(r.element.building)),
    [recesses, demolished]
  )

  return (
    <SceneBoundary className={className}>
      <div className={`relative overflow-hidden rounded-lg border border-line ${className}`}>
        <Canvas
          dpr={[1, 2]}
          shadows="soft"
          // Paused while the plan is on screen: the canvas stays alive so its
          // WebGL context is never torn down, but it stops drawing frames
          // nobody is looking at.
          frameloop={active ? 'always' : 'never'}
          camera={{
            up: [0, 0, 1],
            position: camera.position,
            fov: 38,
            near: 0.5,
            far: camera.far,
          }}
          onCreated={({ camera: cam }) => {
            cam.up.set(0, 0, 1)
            cam.lookAt(...camera.target)
            cam.updateProjectionMatrix()
          }}
          style={{ background: 'linear-gradient(to bottom, #dfe5e4 0%, #eeeade 62%, #f4f2ec 100%)' }}
        >
          <OrbitControls
            target={camera.target}
            enablePan
            maxPolarAngle={Math.PI / 2.05}
            minDistance={15}
            maxDistance={camera.far / 2}
            makeDefault
          />

          <hemisphereLight args={['#fdfcf6', '#e2dccd', 0.85]} />
          <directionalLight
            position={[camera.target[0] + 120, camera.target[1] - 160, 200]}
            intensity={1.15}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.5}
            shadow-camera-left={-250}
            shadow-camera-right={250}
            shadow-camera-top={250}
            shadow-camera-bottom={-250}
            shadow-camera-near={0.5}
            shadow-camera-far={900}
          />
          <directionalLight
            position={[camera.target[0] - 100, camera.target[1] + 90, 140]}
            intensity={0.28}
          />

          <Buildings buildings={untouched} />

          {liveRecesses.map(({ element, cut }) => (
            <RecessedHost
              key={element.id}
              host={geometry.buildings[element.building]}
              edgeIndex={element.edge}
              cut={cut}
              selected={element.id === selectedElementId}
            />
          ))}

          <InterventionMasses masses={masses} selectedId={selectedElementId} />

          {/* Drawn AFTER the buildings so its transparency composites over the
              ground rather than under it, and before the boundary ribbon so the
              ribbon still reads on top. */}
          {zoneCells?.length > 0 && (
            <ZoneCarpet cells={zoneCells} spacing={zoneSpacing} opacity={zoneOpacity} />
          )}

          {selection && selectionRadius > 0 && (
            <SelectionRing centre={selection} radius={selectionRadius} />
          )}

          {geometry.boundary && <BoundaryRibbon boundary={geometry.boundary} />}

          <mesh position={[camera.target[0], camera.target[1], -0.02]} receiveShadow>
            <planeGeometry args={[1600, 1600]} />
            <meshStandardMaterial color="#f0ede4" roughness={1} />
          </mesh>
        </Canvas>
      </div>
    </SceneBoundary>
  )
}

// A WebGL or geometry failure must not take the page down with it.
//
// Before this existed, anything the scene threw — a shader that would not
// compile, a polygon that would not triangulate — unmounted the whole app and
// left "Something went wrong" with no way back. The plan and the measurement do
// not depend on this panel at all, so its failure should cost the panel and
// nothing else.
class SceneBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[SandboxScene]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface p-6 text-center ${this.props.className}`}
        >
          <p className="text-sm font-medium text-ink">The model could not be drawn.</p>
          <p className="max-w-sm font-mono text-[11px] break-words text-ink-muted">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <p className="max-w-sm text-[11px] text-ink-faint">
            The plan and every measured number are unaffected — switch back to the plan to carry on.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-1 rounded-full border border-line-strong px-3 py-1 font-mono text-[11px] text-ink-muted transition-colors hover:border-primary hover:text-primary"
          >
            try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
