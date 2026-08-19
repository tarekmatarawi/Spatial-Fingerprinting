// Where a deployed panoramic-pilot submission is sent.
//
// DELIBERATELY SEPARATE from SURVEY_ENDPOINT_URL. The pilot must not merge into
// the primary 1,213-response dataset, and the cleanest guarantee of that is a
// different Web App writing to a different Sheet — not a filter applied after
// the fact, which is one forgotten WHERE clause away from contaminating the
// main analysis.
//
// Setup steps: docs/pilot-360-storage-setup.md — a second Google Apps Script
// Web App pointed at a NEW spreadsheet. Paste its /exec URL below. Until then
// the pilot survey says plainly that it is not configured rather than silently
// dropping responses.
//
// Local development needs none of this: npm run dev writes straight to
// src/data/pilot-360-responses.json.
export const PILOT_360_ENDPOINT_URL =
  'https://script.google.com/macros/s/AKfycbwcbBUighRq9aooa49Zz8HHEPTilCt-jveQGur1purS60uYWMnbty7XWVNKeMbwH-kv/exec'
