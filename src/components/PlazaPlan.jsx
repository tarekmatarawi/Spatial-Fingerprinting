import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'

// The base drawing every plaza plan in the platform is built on.
//
// P6's field maps, P7's placement editor and P9's diagnostic all draw the same
// thing underneath their own overlays: this plaza's building footprints and
// boundary, in local metres, inside the one fixed window the corpus is drawn
// at, with north up. Before this component existed each page redrew that base
// itself, and the results had already diverged — different centres, different
// stroke widths, the same idea drawn three ways. The platform has been bitten
// by exactly this twice (the figure type scale, the map scale), so the base is
// a component rather than a convention.
//
// WHAT IT OWNS: the window, the y-negation that puts north at the top, the
// footprints, the boundary, the decoration scale factor, and the conversion
// from a mouse event back to plaza-local metres.
//
// WHAT IT DOES NOT OWN: anything a phase is actually saying. Field points,
// markers, selections, sandbox massing and isovist wedges are all `children`,
// drawn in plaza-local coordinates on top.

// Decoration is sized in MAP UNITS, so a 1.4 m dot that reads well on a 60 m
// window is invisible on a 230 m one. Everything decorative multiplies by `k`;
// the geometry itself, of course, never does. 230 m is the reference window the
// existing sizes were chosen against.
const REFERENCE_WINDOW_M = 230

export const PlazaPlan = forwardRef(function PlazaPlan(
  {
    geometry,
    // The window's half-width in metres. Callers pass corpusWindowRadius() so
    // every plaza is drawn at one scale; a page may override it for placement
    // precision, and should say on screen when it has.
    windowRadius,
    // Where the window is centred. Defaults to the plaza's centroid. P6 centres
    // on the bounding box of its sampled points instead, which shifts the frame
    // slightly on plazas whose grid is lopsided — passed explicitly so that
    // difference is visible in the calling code rather than hidden here.
    centre,
    className = '',
    interactive = false,
    onPlanClick,
    onPlanMove,
    onPlanLeave,
    ariaLabel,
    // Indices of buildings the P9 sandbox has removed. Drawn as an outline
    // rather than omitted: a block that simply vanished would read as "there
    // was never anything here", when what happened is that a designer chose to
    // take it away — and they need to see what they took, and where to click to
    // put it back. Every other page passes nothing and is unaffected.
    demolished = null,
    children,
  },
  ref
) {
  const svgRef = useRef(null)

  const view = useMemo(() => {
    if (!geometry) return null
    const c = centre ?? geometry.centroid
    return {
      minX: c.x - windowRadius,
      minY: c.y - windowRadius,
      size: windowRadius * 2,
    }
  }, [geometry, centre, windowRadius])

  const k = view ? view.size / REFERENCE_WINDOW_M : 1

  // Client coordinates → plaza-local metres. Goes through the SVG's own screen
  // matrix rather than arithmetic on getBoundingClientRect: the viewBox may be
  // letterboxed inside the element, and only the matrix accounts for that.
  const toLocal = useCallback((event) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = pt.matrixTransform(ctm.inverse())
    // The drawing negates y so north is up; undo that on the way back in.
    return { x: p.x, y: -p.y }
  }, [])

  useImperativeHandle(ref, () => ({ toLocal, scale: k }), [toLocal, k])

  if (!geometry || !view) {
    return <p className="font-mono text-xs text-ink-faint">No geometry for this plaza.</p>
  }

  return (
    <svg
      ref={svgRef}
      // Marks this as THE drawing, for Figure's exporter. A plan usually shares
      // its panel with a toolbar, and react-icons renders icons as svg — without
      // a way to name the plan, an export would happily serialise a 16-pixel
      // chevron and look like a broken download button.
      data-plan="true"
      viewBox={`${view.minX} ${-(view.minY + view.size)} ${view.size} ${view.size}`}
      className={`w-full ${interactive ? 'cursor-crosshair' : ''} ${className}`}
      style={{ aspectRatio: '1 / 1' }}
      onClick={interactive && onPlanClick ? (e) => onPlanClick(toLocal(e), e) : undefined}
      onMouseMove={interactive && onPlanMove ? (e) => onPlanMove(toLocal(e), e) : undefined}
      onMouseLeave={interactive && onPlanLeave ? () => onPlanLeave() : undefined}
      role="img"
      aria-label={ariaLabel}
    >
      {/* y is negated throughout so north sits at the top, as on any map. */}
      {geometry.buildings.map((b, i) => {
        const gone = demolished?.has(i)
        return (
          <polygon
            key={i}
            points={b.footprint.map((p) => `${p.x},${-p.y}`).join(' ')}
            className={gone ? 'stroke-redline' : 'fill-surface stroke-line-strong'}
            fill={gone ? 'none' : undefined}
            strokeWidth={(gone ? 0.5 : 0.4) * k}
            strokeDasharray={gone ? `${2 * k} ${1.6 * k}` : undefined}
            opacity={gone ? 0.75 : undefined}
          />
        )
      })}
      {geometry.boundary && (
        <polygon
          points={geometry.boundary.map((p) => `${p.x},${-p.y}`).join(' ')}
          fill="none"
          className="stroke-redline"
          strokeWidth={0.8 * k}
          strokeDasharray={`${3 * k} ${2 * k}`}
        />
      )}
      {typeof children === 'function' ? children({ k, view }) : children}
    </svg>
  )
})
