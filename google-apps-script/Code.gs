// Google Apps Script "Web App" acting as a free API in front of a Google
// Sheet, so the GitHub Pages survey (which cannot run its own server) has
// somewhere to send participant responses. See docs/survey-storage-setup.md
// for the full setup walkthrough — this file is not run automatically; it is
// meant to be copied into the Sheet's Extensions > Apps Script editor.
//
// This is not part of the Vite build — it never ships to the browser.

const SHEET_NAME = 'Responses'

// A long random string only you and the sync script know. Protects doGet
// (which returns every participant's data) from being readable by anyone who
// finds the URL. Generate one yourself — do not reuse this placeholder.
const READ_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_SECRET'

// Called when the survey page POSTs a finished submission. Appends one row
// per participant, with the full submission JSON kept verbatim in the last
// column so the sync script can reconstruct it exactly.
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  const payload = JSON.parse(e.postData.contents)
  const responseCount = Array.isArray(payload.responses) ? payload.responses.length : 0

  sheet.appendRow([
    new Date().toISOString(),
    payload.participant_id || '',
    payload.started_at || '',
    payload.finished_at || '',
    payload.background || '',
    payload.age_group || '',
    responseCount,
    JSON.stringify(payload),
  ])

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  )
}

// Called by the researcher's sync script (npm run sync:survey) to pull every
// submission back out, in the same shape the app already expects for
// src/data/survey-responses.json.
function doGet(e) {
  if (!e.parameter.token || e.parameter.token !== READ_TOKEN) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Unauthorized' })
    ).setMimeType(ContentService.MimeType.JSON)
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  const rows = sheet.getDataRange().getValues()
  const [header, ...data] = rows
  const payloadCol = header.indexOf('payload_json')

  const records = data
    .filter((row) => row[payloadCol])
    .map((row) => JSON.parse(row[payloadCol]))

  return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(
    ContentService.MimeType.JSON
  )
}
