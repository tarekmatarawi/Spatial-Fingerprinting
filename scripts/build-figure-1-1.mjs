// Fig. 1.1 — Research approach. A standalone thesis figure.
//
// This is NOT a page. It is not in the phase registry, not routed, and nothing
// in src/ imports it. The app's figures are exported from the live DOM by
// src/components/Figure.jsx so that a download cannot disagree with what is on
// screen. Fig. 1.1 has no on-screen original — it is an argument diagram, not a
// result — so it is drawn straight to file here, but in the SAME house
// conventions: the tokens below are copied from src/components/charts/tokens.js
// and the canvas is CANVAS_W wide, so a font size means what it means in every
// other figure in the thesis.
//
//   node scripts/build-figure-1-1.mjs
//
// Writes docs/figures/fig-1-1-research-approach.svg and .png.
//
// Every quantity is sourced from docs/handoff/ and cited in NUMBERS below, so
// the figure can be re-checked without reading the drawing code.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs', 'figures')
const BASENAME = 'fig-1-1-research-approach'

// ---------------------------------------------------------------------------
// The numbers, and where each was verified.
// ---------------------------------------------------------------------------
const NUMBERS = {
  plazas: 18,            // 02_results_data.md §1.1
  participants: 46,      // 02_results_data.md §4.1 — 46 retained, 0 dropped
  tripletsEach: 12,      // 02_results_data.md §4.1 — exactly 12 for all 46
  metrics: 4,            // 01_methods_implementation.md §0 — metric order
  spacing: '2.5 m',      // 01_methods_implementation.md §6 — fields/index.json
  fieldPoints: '11,719', // 01_methods_implementation.md §6 — live, 18 sites
  zones: 5,              // 01_methods_implementation.md §6 — zones.json, k = 5
  konstPoints: 967,      // 02_results_data.md §8 — 988 inside, 21 rejected
  scenarios: 7,          // 01_methods_implementation.md §8 — scenarios.json
}

// ---------------------------------------------------------------------------
// House conventions — copied from src/components/charts/tokens.js.
// ---------------------------------------------------------------------------
const INK = '#17191D'
const MUTED = '#5C6169'
const FAINT = '#9AA0A8'
const RULE = '#DCDCD5'
const PAPER = '#FDFDFB'
const WASH = '#FBEDE4'
const COOL = '#1F5FAE'
const ACCENT = '#C2410C'
const SANS = 'Inter, system-ui, sans-serif'
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const CANVAS_W = 900

// The two sampling layers are told apart by colour and fill, not by position:
// a reader should see at a glance which boxes rest on one hand-placed reading
// per plaza and which rest on a swept grid. COOL and ACCENT are the palette's
// validated pair — they separate under protanopia and in greyscale print.
const LAYER = {
  point: { stroke: COOL, fill: '#EDF3FB' }, // perceptual_360 / perceptual_120
  field: { stroke: ACCENT, fill: WASH },    // field_360
  plain: { stroke: RULE, fill: PAPER },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const parts = []
const add = (s) => parts.push(s)

function text(x, y, s, opts = {}) {
  const { size = 10, fill = MUTED, family = SANS, weight = 400, anchor = 'start', spacing } = opts
  const ls = spacing ? ' letter-spacing="' + spacing + '"' : ''
  add('<text x="' + x + '" y="' + y + '" font-family="' + family + '" font-size="' + size +
      '" font-weight="' + weight + '" fill="' + fill + '" text-anchor="' + anchor + '"' + ls + '>' + esc(s) + '</text>')
}

function rect(x, y, w, h, opts = {}) {
  const { fill = PAPER, stroke = RULE, width = 1, rx = 3 } = opts
  add('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx +
      '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + width + '"/>')
}

function arrowDown(x, y0, y1, colour = FAINT) {
  add('<path d="M ' + x + ' ' + y0 + ' L ' + x + ' ' + (y1 - 7) + '" stroke="' + colour + '" stroke-width="1.4" fill="none"/>')
  add('<path d="M ' + (x - 5) + ' ' + (y1 - 8) + ' L ' + x + ' ' + y1 + ' L ' + (x + 5) + ' ' + (y1 - 8) + ' Z" fill="' + colour + '"/>')
}

// A labelled box. Lines are broken by hand: a figure read in three seconds
// cannot afford a bad wrap.
function box(x, y, w, spec) {
  const { title, lines = [], layer = 'plain', emphasis = false } = spec
  const style = LAYER[layer]
  const h = 30 + lines.length * 13
  rect(x, y, w, h, {
    fill: style.fill,
    stroke: emphasis ? INK : style.stroke,
    width: emphasis ? 1.6 : layer === 'plain' ? 1 : 1.25,
  })
  text(x + 12, y + 19, title, { size: 11, fill: INK, weight: 600 })
  lines.forEach((line, i) => text(x + 12, y + 34 + i * 13, line, { size: 9.5, fill: MUTED }))
  return h
}

// ---------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------
const M = 26                // page margin
const RAIL = M + 6          // the weights rail, in a gutter of its own
const PX0 = M + 92          // stage panel left edge
const PX1 = CANVAS_W - M    // stage panel right edge
const IX0 = PX0 + 18        // content left
const IX1 = PX1 - 18        // content right
const IW = IX1 - IX0
const MID = (PX0 + PX1) / 2

let y = 0
const panels = []

// --- Title -----------------------------------------------------------------
y = 32
text(M, y, 'FIG. 1.1', { size: 9.5, family: MONO, fill: FAINT, spacing: 1.2 })
text(M + 78, y, 'Research approach', { size: 15, fill: INK, weight: 600 })
y += 12
add('<line x1="' + M + '" y1="' + y + '" x2="' + PX1 + '" y2="' + y + '" stroke="' + RULE + '" stroke-width="1"/>')

// --- Stage 1: Perceptual weighting -----------------------------------------
y += 30
const s1Top = y
y += 20

const w3 = Math.round((IW - 36) / 3)
const h1 = Math.max(
  box(IX0, y, w3, {
    layer: 'point',
    title: 'Isovist metrics',
    lines: [
      'Area · compactness ·',
      'closed perimeter · enclosure',
      'One hand-placed 360° reading per plaza,',
      NUMBERS.plazas + ' plazas',
    ],
  }),
  box(IX0 + w3 + 18, y, w3, {
    title: 'Panoramic triplet survey',
    lines: [
      NUMBERS.participants + ' participants × ' + NUMBERS.tripletsEach + ' triplets each',
      'Choose the most similar pair',
    ],
  }),
  box(IX0 + 2 * (w3 + 18), y, w3, {
    title: 'Semantic differential',
    lines: [
      'Rating block on the same four',
      'qualities, after the triplets',
    ],
  }),
)
y += h1
// All three inputs feed one fit, so they merge into a single arrow rather than
// leaving the reader to infer which of them the weights came from.
{
  const cs = [0, 1, 2].map((i) => IX0 + i * (w3 + 18) + w3 / 2)
  const yBar = y + 16
  for (const cx of cs) add('<path d="M ' + cx + ' ' + (y + 6) + ' L ' + cx + ' ' + yBar + '" stroke="' + FAINT + '" stroke-width="1.4" fill="none"/>')
  add('<path d="M ' + cs[0] + ' ' + yBar + ' L ' + cs[2] + ' ' + yBar + '" stroke="' + FAINT + '" stroke-width="1.4" fill="none"/>')
  arrowDown(MID, yBar, y + 34)
}
y += 42

const wWeights = 340
const yWeightsBox = y
y += box(MID - wWeights / 2, y, wWeights, {
  emphasis: true,
  title: 'Fitted weight vector',
  lines: ['One weight per metric, across the ' + NUMBERS.metrics + ' metrics'],
})
const railFrom = yWeightsBox + 22
y += 20
panels.push({ y: s1Top, h: y - s1Top, n: 1, name: 'Perceptual weighting' })

// --- Stage 2: Plaza-level representation -----------------------------------
y += 36
const s2Top = y
const rail2 = y + 54
y += 20

y += box(IX0 + 96, y, IW - 96, {
  layer: 'field',
  title: 'Isovist field',
  lines: [
    NUMBERS.spacing + ' grid cast across each plaza — ' + NUMBERS.fieldPoints + ' points, ' + NUMBERS.plazas + ' plazas,',
    'every point scored with the fitted weights',
  ],
})

// Two parallel readings of one field. Drawn as a fork, not as two more steps.
const forkTop = y + 6
const wHalf = Math.round((IW - 18) / 2)
const cL = IX0 + wHalf / 2
const cR = IX0 + wHalf + 18 + wHalf / 2
add('<path d="M ' + MID + ' ' + forkTop + ' L ' + MID + ' ' + (forkTop + 14) +
    ' M ' + cL + ' ' + (forkTop + 14) + ' L ' + cR + ' ' + (forkTop + 14) +
    '" stroke="' + FAINT + '" stroke-width="1.4" fill="none"/>')
for (const cx of [cL, cR]) arrowDown(cx, forkTop + 14, forkTop + 34)
y = forkTop + 40

const h2 = Math.max(
  box(IX0, y, wHalf, {
    layer: 'field',
    title: 'Shared ' + NUMBERS.zones + '-zone typology',
    lines: [
      'Clustered once over all ' + NUMBERS.fieldPoints + ' points,',
      'giving each plaza a zone composition',
    ],
  }),
  box(IX0 + wHalf + 18, y, wHalf, {
    layer: 'point',
    title: 'View-cloud comparison',
    lines: [
      'Plaza against plaza, on hand-placed views',
      'Validation instrument: which distance',
      'measure matches human judgement',
    ],
  }),
)
y += h2 + 20
panels.push({ y: s2Top, h: y - s2Top, n: 2, name: 'Plaza-level representation' })

// --- Stage 3: Design application -------------------------------------------
y += 36
const s3Top = y
const rail3 = y + 54
y += 20

y += box(IX0 + 96, y, IW - 96, {
  layer: 'field',
  title: 'Konstablerwache',
  lines: ['Zone composition over ' + NUMBERS.konstPoints + ' field points, on the same weights'],
})
arrowDown(MID, y + 6, y + 26)
y += 34

// The design move itself, as four beats on one line.
const steps = ['Select a region', 'Name a target zone', 'Measure the distance', 'Place interventions']
const gap = 28
const wStep = Math.round((IW - 3 * gap) / 4)
steps.forEach((label, i) => {
  const x = IX0 + i * (wStep + gap)
  rect(x, y, wStep, 30, { fill: PAPER, stroke: RULE })
  text(x + wStep / 2, y + 19, label, { size: 10, fill: INK, weight: 500, anchor: 'middle' })
  if (i < steps.length - 1) {
    const ax = x + wStep + 6
    add('<path d="M ' + ax + ' ' + (y + 15) + ' L ' + (ax + 10) + ' ' + (y + 15) + '" stroke="' + FAINT + '" stroke-width="1.4"/>')
    add('<path d="M ' + (ax + 9) + ' ' + (y + 10) + ' L ' + (ax + 17) + ' ' + (y + 15) + ' L ' + (ax + 9) + ' ' + (y + 20) + ' Z" fill="' + FAINT + '"/>')
  }
})
y += 30
arrowDown(MID, y + 8, y + 30)
y += 38

y += box(IX0 + 48, y, IW - 96, {
  emphasis: true,
  title: 'Recomputed field',
  lines: ['Predicted change in zone composition and metrics, across ' + NUMBERS.scenarios + ' scenarios'],
})
y += 20
panels.push({ y: s3Top, h: y - s3Top, n: 3, name: 'Design application' })

// --- Key -------------------------------------------------------------------
y += 34
const keyY = y
text(M, keyY, 'KEY', { size: 9, family: MONO, fill: FAINT, spacing: 1.2 })
let kx = M + 42
function keyItem(style, label) {
  rect(kx, keyY - 9, 22, 12, { fill: style.fill, stroke: style.stroke, width: 1.25, rx: 2 })
  text(kx + 30, keyY, label, { size: 9.5, fill: MUTED })
  kx += 30 + label.length * 4.9 + 34
}
keyItem(LAYER.point, 'One hand-placed reading per plaza')
keyItem(LAYER.field, 'Grid-sampled field points')
add('<path d="M ' + kx + ' ' + (keyY - 4) + ' L ' + (kx + 24) + ' ' + (keyY - 4) +
    '" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="7 4"/>')
add('<path d="M ' + (kx + 22) + ' ' + (keyY - 9.5) + ' L ' + (kx + 33) + ' ' + (keyY - 4) +
    ' L ' + (kx + 22) + ' ' + (keyY + 1.5) + ' Z" fill="' + INK + '"/>')
text(kx + 41, keyY, 'Fitted weights carried forward', { size: 9.5, fill: MUTED })

const H = y + 20

// ---------------------------------------------------------------------------
// Assemble. Frames and the weights rail sit UNDER the content.
// ---------------------------------------------------------------------------
const under = []
for (const p of panels) {
  under.push('<rect x="' + PX0 + '" y="' + p.y + '" width="' + (PX1 - PX0) + '" height="' + p.h +
             '" rx="4" fill="none" stroke="' + RULE + '" stroke-width="1"/>')
  // Stage number and name run up the left edge, drafting-plan fashion.
  const cy = p.y + p.h / 2
  under.push('<text transform="translate(' + (PX0 - 15) + ' ' + cy + ') rotate(-90)" text-anchor="middle" font-family="' +
             SANS + '" font-size="10.5" font-weight="600" fill="' + INK + '">' + esc(p.name) + '</text>')
  under.push('<text transform="translate(' + (PX0 - 29) + ' ' + cy + ') rotate(-90)" text-anchor="middle" font-family="' +
             MONO + '" font-size="9.5" fill="' + FAINT + '" letter-spacing="1">STAGE ' + p.n + '</text>')
}

// Sequential stage-to-stage arrows, in the gaps between panels. Thin and grey,
// deliberately quiet, so the weights rail reads as a different kind of link.
for (let i = 1; i < panels.length; i++) {
  const prev = panels[i - 1]
  const yTo = panels[i].y
  under.push('<path d="M ' + MID + ' ' + (prev.y + prev.h + 8) + ' L ' + MID + ' ' + (yTo - 10) +
             '" stroke="' + FAINT + '" stroke-width="1.4" fill="none"/>')
  under.push('<path d="M ' + (MID - 5) + ' ' + (yTo - 10) + ' L ' + MID + ' ' + (yTo - 2) + ' L ' + (MID + 5) + ' ' + (yTo - 10) +
             ' Z" fill="' + FAINT + '"/>')
}

// The weights rail: heavy, dashed, in ink, down the left gutter and turning
// into Stage 2 and Stage 3. One fitted vector carried into both later stages is
// the argument of the chapter, so it is drawn as its own object rather than as
// another step in the sequence.
const rail = []
const railTargets = [rail2, rail3]
rail.push('<path d="M ' + RAIL + ' ' + railFrom + ' L ' + RAIL + ' ' + railTargets[railTargets.length - 1] +
          '" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="7 4" fill="none" stroke-linecap="round"/>')
rail.push('<circle cx="' + RAIL + '" cy="' + railFrom + '" r="3.2" fill="' + INK + '"/>')
rail.push('<path d="M ' + (MID - wWeights / 2) + ' ' + railFrom + ' L ' + RAIL + ' ' + railFrom +
          '" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="7 4" fill="none"/>')
for (const ty of railTargets) {
  // Stop short of the rotated stage labels rather than running through them.
  const tip = PX0 - 42
  rail.push('<path d="M ' + RAIL + ' ' + ty + ' L ' + (tip - 10) + ' ' + ty +
            '" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="7 4" fill="none"/>')
  rail.push('<path d="M ' + (tip - 12) + ' ' + (ty - 5.5) + ' L ' + tip + ' ' + ty + ' L ' + (tip - 12) + ' ' + (ty + 5.5) +
            ' Z" fill="' + INK + '"/>')
}

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CANVAS_W + ' ' + H + '" width="' + CANVAS_W + '" height="' + H + '">',
  '<rect x="0" y="0" width="' + CANVAS_W + '" height="' + H + '" fill="#ffffff"/>',
  ...under,
  ...rail,
  ...parts,
  '</svg>',
].join('\n')

mkdirSync(OUT_DIR, { recursive: true })
const svgPath = join(OUT_DIR, BASENAME + '.svg')
writeFileSync(svgPath, svg + '\n', 'utf8')
console.log('SVG  ' + svgPath + '  (' + CANVAS_W + ' × ' + H + ' user units)')

// ---------------------------------------------------------------------------
// PNG at 300 dpi, at the thesis text-block width.
// ---------------------------------------------------------------------------
const TEXT_BLOCK_MM = 160   // A4 with 25 mm side margins — the thesis text block
const DPI = 300
const pxWidth = Math.round((TEXT_BLOCK_MM / 25.4) * DPI)

// resvg has no browser font stack, and the fonts this project ships are WOFF,
// which its font database cannot read — left alone it substitutes a system face
// silently and the PNG stops matching the SVG. WOFF is only an sfnt with each
// table zlib-deflated, so unwrap it back to a TTF that resvg will load. The
// TTFs are build artefacts and go to the system temp directory, not the repo.
function woffToTtf(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF file')
  const numTables = woff.readUInt16BE(12)
  const tables = []
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20
    tables.push({
      tag: woff.subarray(o, o + 4),
      offset: woff.readUInt32BE(o + 4),
      compLength: woff.readUInt32BE(o + 8),
      origLength: woff.readUInt32BE(o + 12),
      checksum: woff.readUInt32BE(o + 16),
    })
  }
  const pad = (n) => (4 - (n % 4)) % 4
  const headerLen = 12 + numTables * 16
  const bodies = tables.map((t) => {
    const raw = woff.subarray(t.offset, t.offset + t.compLength)
    return t.compLength < t.origLength ? inflateSync(raw) : raw
  })

  const header = Buffer.alloc(headerLen)
  header.writeUInt32BE(woff.readUInt32BE(4), 0) // sfnt flavour
  header.writeUInt16BE(numTables, 4)
  const maxPow2 = Math.floor(Math.log2(numTables))
  header.writeUInt16BE(16 * 2 ** maxPow2, 6)
  header.writeUInt16BE(maxPow2, 8)
  header.writeUInt16BE(numTables * 16 - 16 * 2 ** maxPow2, 10)

  let cursor = headerLen
  tables.forEach((t, i) => {
    const o = 12 + i * 16
    t.tag.copy(header, o)
    header.writeUInt32BE(t.checksum, o + 4)
    header.writeUInt32BE(cursor, o + 8)
    header.writeUInt32BE(t.origLength, o + 12)
    cursor += bodies[i].length + pad(bodies[i].length)
  })

  const out = [header]
  bodies.forEach((b) => {
    out.push(b)
    if (pad(b.length)) out.push(Buffer.alloc(pad(b.length)))
  })
  return Buffer.concat(out)
}

const FACES = [
  ['@fontsource/inter/files/inter-latin-400-normal.woff', 'inter-400.ttf'],
  ['@fontsource/inter/files/inter-latin-500-normal.woff', 'inter-500.ttf'],
  ['@fontsource/inter/files/inter-latin-600-normal.woff', 'inter-600.ttf'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff', 'mono-400.ttf'],
]
const fontCache = join(tmpdir(), 'spatial-fingerprinting-figure-fonts')
mkdirSync(fontCache, { recursive: true })
const fontFiles = []
for (const [src, name] of FACES) {
  const from = join(ROOT, 'node_modules', src)
  if (!existsSync(from)) {
    console.warn('  font missing, will be substituted: ' + src)
    continue
  }
  const to = join(fontCache, name)
  writeFileSync(to, woffToTtf(readFileSync(from)))
  fontFiles.push(to)
}

let Resvg
try {
  ({ Resvg } = await import('@resvg/resvg-js'))
} catch {
  console.error('PNG skipped: @resvg/resvg-js is not installed. Run `npm install -D @resvg/resvg-js`.')
  process.exit(0)
}

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: pxWidth },
  background: '#ffffff',
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
})
const pngPath = join(OUT_DIR, BASENAME + '.png')
writeFileSync(pngPath, resvg.render().asPng())
console.log('PNG  ' + pngPath + '  (' + pxWidth + ' px wide = ' + TEXT_BLOCK_MM + ' mm at ' + DPI + ' dpi)')
