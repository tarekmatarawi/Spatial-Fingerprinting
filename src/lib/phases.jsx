import { LuLandPlot, LuBox, LuUsersRound, LuChartColumn } from 'react-icons/lu'

// The single source of truth for the platform's workflow stations. Every place
// a phase is referenced — nav stepper, landing journey, page headers, empty
// states — pulls its icon, code, and name from here, so the same phase always
// looks the same everywhere.
//
// Codes follow the build spec's sheet numbering: the viewer carries P2 (3D
// scene) and P3 (ray-casting engine) on one surface; results will carry P5
// (weight fitting) and P6 (dashboard) once those phases are unblocked.
export const PHASES = [
  {
    id: 'sites',
    code: 'P1',
    icon: LuLandPlot,
    name: 'Site register',
    journey: 'Site setup',
    blurb: 'Enter each plaza: building footprints from OSM, heights, boundary, and a street-level photograph.',
  },
  {
    id: 'viewer',
    code: 'P2·3',
    icon: LuBox,
    name: '3D viewer',
    journey: '3D analysis',
    blurb: 'Walk the model, place a vantage point, and read the four isovist metrics from the live ray-casting engine.',
  },
  {
    id: 'survey',
    code: 'P4',
    icon: LuUsersRound,
    name: 'Survey',
    journey: 'Perceptual survey',
    blurb: 'Anonymous participants compare triplets of plazas by feel — the perceptual ground truth for the metrics.',
  },
  {
    id: 'results',
    code: 'P5·6',
    icon: LuChartColumn,
    name: 'Results',
    journey: 'Results & design application',
    blurb: 'Response quality today; fitted metric weights, hypothesis tests, and clustering as later phases land.',
  },
]

export const phaseById = new Map(PHASES.map((p) => [p.id, p]))
