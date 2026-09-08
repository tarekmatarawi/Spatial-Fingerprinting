// Camera geometry for rendering a measured view.
//
// Kept out of the component for the same reason every other calculation in this
// project is: so it can be tested. A camera that shows the wrong amount of the
// world produces a picture that looks perfectly fine and disagrees with the
// numbers printed under it, which is not a bug anyone catches by looking.

// Standing eye height, metres.
//
// The isovist is a plan-level cast and has no height of its own; 1.6 m is the
// standing eye height the enclosure metric's vertical angles already assume, so
// the render stands where the measurement implicitly did.
export const EYE_HEIGHT_M = 1.6

// The vertical field of view a camera needs in order to show a given HORIZONTAL
// field at a given aspect ratio.
//
//   tan(vFov / 2) = tan(hFov / 2) / aspect
//
// The metrics sweep 120° horizontally. Three.js cameras are specified by their
// vertical field, and the horizontal extent that produces depends on the shape
// of the canvas — so handing three.js the 120 directly shows about 150° on a
// 16:9 frame. The render would then contain a third more of the world than the
// isovist ever counted.
export function verticalFov(horizontalDeg, aspect) {
  const h = (horizontalDeg * Math.PI) / 180
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect)
  return (v * 180) / Math.PI
}

// The inverse — the horizontal field a camera with this vertical FOV actually
// shows. Used by the tests to check the conversion by round trip, and useful
// anywhere a frame's real coverage has to be reported.
export function horizontalFov(verticalDeg, aspect) {
  const v = (verticalDeg * Math.PI) / 180
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect)
  return (h * 180) / Math.PI
}

// Where the camera looks: a point far along the heading, at eye height.
//
// Heading is a compass bearing — 0° is north (+Y), increasing clockwise — and
// the world is Z-up, so the ground-plane direction is (sin, cos), matching
// bearingTo() in isovist.js. Getting this pair the wrong way round mirrors every
// view east-for-west, which again looks entirely plausible on screen.
export function lookTarget(vantage, headingDeg, distance = 100, height = EYE_HEIGHT_M) {
  const rad = (headingDeg * Math.PI) / 180
  return [
    vantage.x + Math.sin(rad) * distance,
    vantage.y + Math.cos(rad) * distance,
    height,
  ]
}
