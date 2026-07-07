// Center of the viewer: Marktplatz, Weimar
export const CENTER_LAT = 50.9799
export const CENTER_LON = 11.3286

// The viewer covers a 2km x 2km area, i.e. 1km in every direction from the center
export const HALF_EXTENT_METERS = 1000

// Overpass API endpoint used to fetch OpenStreetMap data
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Isovist settings
export const ISOVIST_MAX_RADIUS = 150 // meters
export const ISOVIST_RAY_COUNT = 360 // one ray per degree

// Default building height (meters) when OSM has no height/levels tag
export const DEFAULT_BUILDING_HEIGHT = 9
export const LEVEL_HEIGHT = 3.2

// Width used to draw street ribbons (meters)
export const STREET_WIDTH = 5
