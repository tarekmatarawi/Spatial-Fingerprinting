// The drawing conventions every figure in the platform shares.
//
// These were defined inside FingerprintCharts.jsx when P5 was the only phase
// with figures. P6 and P7 then re-picked their own sizes by eye, and the result
// was exactly what you would expect: axis titles at 10 px on one page and 11.5
// on another, tick labels in three different greys, the same idea drawn three
// ways. Pulling them out here makes the house style a thing that exists rather
// than a thing each page remembers.
//
// COLOURS are hex, not the CSS custom properties the rest of the app uses,
// because Figure.jsx exports a figure by serialising the live SVG — a var()
// reference means nothing once the file is open in Illustrator, and the export
// would come out black. The values are the design tokens' hex equivalents.

export const INK = '#17191D'
export const MUTED = '#5C6169'
export const FAINT = '#9AA0A8'
export const RULE = '#DCDCD5'
export const GRID = '#ECEAE1'
export const PAPER = '#FDFDFB'
export const WASH = '#FBEDE4'

// Series blue and selection orange. Checked with the palette validator against
// the paper surface: both sit inside the lightness band, clear the chroma
// floor, and separate by ΔE 22.9 under protanopia — so the pairing survives
// colour-blind readers and a greyscale thesis print alike.
export const COOL = '#1F5FAE'
export const ACCENT = '#C2410C'
export const NEG = '#A2382A'
export const OK = '#2C6A4C'

export const SANS = 'Inter, system-ui, sans-serif'
export const MONO = "'JetBrains Mono', ui-monospace, monospace"

// One scale for text in figures. An axis title is not the same kind of thing as
// a tick label, and the sizes are what say so — so they are named by their role
// rather than chosen per chart.
export const TYPE = {
  // "Dimension 1 (Relative Similarity)" — what the axis measures.
  axisTitle: { fontSize: 11.5, fill: INK, fontFamily: SANS, fontWeight: 500 },
  // The numbers along the axis.
  tick: { fontSize: 9.5, fill: FAINT, fontFamily: MONO },
  // A mark's own label — a plaza name beside its dot.
  markLabel: { fontSize: 10, fill: MUTED, fontFamily: SANS },
  // Row and column headers on a matrix.
  matrixLabel: { fontSize: 9.5, fill: MUTED, fontFamily: SANS },
  // A note inside the plot area, like a scale caption.
  annotation: { fontSize: 9.5, fill: FAINT, fontFamily: MONO },
  // A title drawn inside the SVG itself (rather than by Figure's chrome).
  panelTitle: { fontSize: 11.5, fill: INK, fontFamily: SANS, fontWeight: 600 },
}

// Axis titles read as sentences with the unit in parentheses, so a reader never
// has to hunt the caption to learn what the numbers are in.
export function axisTitle(name, unit) {
  return unit ? `${name} (${unit})` : name
}

// THE CANVAS WIDTH IS PART OF THE TYPE SCALE.
//
// An SVG with a viewBox and no fixed width renders scaled to its container, so
// the size text ACTUALLY appears at is fontSize × (container ÷ viewBox width).
// Two figures in the same column with different canvas widths therefore show
// the same fontSize at different sizes — which is how P7 ended up with axis
// labels twice the size of P5's while both said 11.5.
//
// So every full-width figure is drawn on a canvas about this wide, and sizes
// from TYPE then mean the same thing everywhere. Half-width figures use half of
// it. A figure that needs more room grows its HEIGHT, never its width.
export const CANVAS_W = 900
