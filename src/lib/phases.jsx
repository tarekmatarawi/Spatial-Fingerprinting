import {
  LuLandPlot,
  LuBox,
  LuUsersRound,
  LuChartColumn,
  LuScale,
  LuGrid3X3,
  LuGitCompareArrows,
  LuSquareCheckBig,
  LuDraftingCompass,
} from 'react-icons/lu'

// The single source of truth for the platform's workflow stations. Every place
// a phase is referenced — nav stepper, landing journey, page headers, empty
// states — pulls its icon, code, and name from here, so the same phase always
// looks the same everywhere.
//
// Codes are the P1–P9 numbering from the final implementation plan. The order
// of this array IS the plan's sequence and must not be reordered; the groups
// below are a navigation convenience layered on top of it, never a resequencing.
//
// `status` is 'built' or 'planned'. A planned phase still gets a station and a
// route so the workflow reads as a whole, but lands on a placeholder rather
// than pretending to have results.

export const GROUPS = [
  {
    id: 'setup',
    name: 'Setup',
    blurb: 'Build the corpus, measure it, and collect perceptual judgements.',
  },
  {
    id: 'analysis',
    name: 'Analysis',
    blurb: 'Calibrate the metrics against human judgement, then map and compare spatial character.',
  },
  {
    id: 'design',
    name: 'Design Tool',
    blurb: 'Apply the calibrated model to diagnose and test a real design intervention.',
  },
]

export const PHASES = [
  {
    id: 'sites',
    code: 'P1',
    group: 'setup',
    status: 'built',
    icon: LuLandPlot,
    name: 'Site Register',
    journey: 'Site setup',
    blurb:
      'Enter each plaza: building footprints from OSM, heights, boundary, and a street-level photograph.',
  },
  {
    id: 'viewer',
    code: 'P2',
    group: 'setup',
    status: 'built',
    icon: LuBox,
    name: 'Spatial Analysis',
    longName: 'Spatial Analysis — 3D Viewer',
    journey: '3D analysis',
    blurb:
      'Walk the model, place a vantage point, and read the four isovist metrics from the live ray-casting engine.',
  },
  {
    id: 'survey',
    code: 'P3',
    group: 'setup',
    status: 'built',
    icon: LuUsersRound,
    name: 'Perceptual Survey',
    longName: 'Perceptual Survey — Panoramic',
    journey: 'Perceptual survey',
    blurb:
      'Anonymous participants compare triplets of 360° panoramas by feel, then rate each plaza on four plain-language scales.',
  },
  {
    id: 'results',
    code: 'P4',
    group: 'setup',
    status: 'built',
    icon: LuChartColumn,
    name: 'Survey Results',
    longName: 'Survey Results Dashboard',
    journey: 'Survey results',
    blurb:
      'Who answered, how completely, and whether pooled pair coverage supports the sampling assumption.',
  },
  {
    id: 'weights',
    code: 'P5',
    group: 'analysis',
    status: 'planned',
    icon: LuScale,
    name: 'Weight Fitting',
    longName: 'Weight Fitting & Hypothesis Testing',
    journey: 'Weight fitting',
    blurb:
      'Fit the four perceptual weights from the survey by maximum likelihood, with bootstrap CIs, cross-validation, ablation, and the H1–H3 tests.',
  },
  {
    id: 'field',
    code: 'P6',
    group: 'analysis',
    status: 'planned',
    icon: LuGrid3X3,
    name: 'Field Mapping',
    longName: 'Isovist Field Mapping & Zone Typology',
    journey: 'Field mapping',
    blurb:
      'Sample every plaza on a regular grid at 360°, then cluster the pooled points into zone types shared across all 18 sites.',
  },
  {
    id: 'cloud-comparison',
    code: 'P7',
    group: 'analysis',
    status: 'planned',
    icon: LuGitCompareArrows,
    name: 'View-Cloud Comparison',
    journey: 'View clouds',
    blurb:
      'Compare plazas as sets of 120° views rather than single points, using centroid, Gaussian, and Chamfer distances.',
  },
  {
    id: 'matched-view',
    code: 'P8',
    group: 'analysis',
    status: 'planned',
    icon: LuSquareCheckBig,
    name: 'Matched-View Validation',
    longName: 'Matched-View Validation Survey',
    journey: 'Matched-view validation',
    blurb:
      'A second survey testing whether the matched view pairs Chamfer predicts are the ones people actually agree with.',
    // Participants reach this survey through its own chrome-free link, not
    // through the researcher shell — same arrangement as P3.
    publicParam: 'matched-view-survey',
  },
  {
    id: 'diagnose',
    code: 'P9',
    group: 'design',
    status: 'planned',
    icon: LuDraftingCompass,
    name: 'Design Diagnostic',
    longName: 'Design Diagnostic & Intervention',
    journey: 'Design application',
    blurb:
      'Diagnose a plaza zone against its intended character, then test interventions and watch the zone map change.',
  },
]

export const phaseById = new Map(PHASES.map((p) => [p.id, p]))

// Phases in plan order, bucketed by group. Grouping is presentational only —
// within each group the phases stay in their P-number sequence.
export const groupedPhases = GROUPS.map((group) => ({
  ...group,
  phases: PHASES.filter((p) => p.group === group.id),
}))

// The full display name where there is room for it ("Spatial Analysis — 3D
// Viewer"); `name` is the short form used in the nav stepper.
export function phaseTitle(phase) {
  return phase?.longName ?? phase?.name ?? ''
}
