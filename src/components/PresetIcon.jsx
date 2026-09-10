import {
  LuBrickWall,
  LuColumns3,
  LuDoorOpen,
  LuEraser,
  LuFlag,
  LuLayers,
  LuMinus,
  LuPentagon,
  LuStore,
  LuTrees,
  LuUmbrella,
} from 'react-icons/lu'

// One glyph per kind of intervention.
//
// The list of what is standing in the sandbox was a column of identical text
// rows, and by the fifth element it read as a log rather than as a set of
// design decisions. A glyph makes the list scannable — you find the tree row
// without reading, and you can see at a glance that a scenario is four
// colonnades and a plinth.
//
// LIVES IN ITS OWN FILE, keyed by preset id, and deliberately NOT inside
// lib/presets.js. That module is imported by scripts/validate-presets.mjs and
// by the tests, which run in Node with no React and no JSX — putting a
// component map there would drag a renderer into the geometry library for the
// sake of a picture.
//
// The map is exhaustive over the library, and `fallback` covers freeform masses
// (which have no preset) and anything added later before its glyph is chosen. A
// missing icon must never be a blank space: an element you cannot see is an
// element you cannot delete.
const ICONS = {
  colonnade: LuColumns3,
  pergola: LuUmbrella,
  landmark: LuFlag,
  treeRow: LuTrees,
  lowWall: LuMinus,
  marketRow: LuStore,
  plinth: LuLayers,
  screenWall: LuBrickWall,
  recessedArcade: LuDoorOpen,
}

export function PresetIcon({ preset, className = 'h-3.5 w-3.5' }) {
  const Icon = ICONS[preset] ?? LuPentagon
  return <Icon aria-hidden className={className} />
}

// The glyph for a placed element, which may be a preset, a freehand mass, or a
// demolition.
//
// A demolition has no preset to key on and is the one destructive entry in the
// list, so it gets its own glyph rather than falling through to the freehand
// pentagon — the row that removes a real building should not look like the row
// that adds an invented one.
export function ElementIcon({ element, className }) {
  if (element?.kind === 'demolish') return <LuEraser aria-hidden className={className} />
  return <PresetIcon preset={element?.preset} className={className} />
}
