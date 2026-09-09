// Google Apps Script for the P8 matched-view validation survey
// (?matched-view-survey).
//
// A SEPARATE spreadsheet and a separate Web App from the panoramic survey in
// Code.gs. The two instruments answer different questions and store different
// row shapes, and putting them in one tab would mean the live perceptual study
// and this one could break each other. Do not point this at the P3 Sheet.
//
// SETUP, once:
//   1. Create a new Google Sheet. Rename its first tab to "Responses".
//   2. Paste this row into row 1, one header per cell:
//        timestamp  participant_id  started_at  finished_at  status
//        background  answer_count  agreement_count  discriminating_count
//        chamfer_agreement  chamfer_discriminating  median_seconds
//        survey_version  bank_version  payload_json
//      Column ORDER does not matter — rows are written by header name, so you
//      can reorder or omit any of them except participant_id and payload_json.
//   3. Extensions → Apps Script, paste this file, and replace READ_TOKEN below
//      with a long random string of your own.
//   4. Deploy → New deployment → Web app. Execute as: Me. Who has access:
//      Anyone. Copy the /exec URL.
//   5. Paste that URL into MATCHED_VIEW_ENDPOINT_URL in
//      src/lib/surveyEndpoint.js, then rebuild and redeploy the site.
//
// Until step 5 is done the survey still runs end to end and tells participants
// plainly that nothing was stored, rather than silently discarding their work.

const SHEET_NAME = 'Responses'

// Readable dates in the researcher's own timezone, so the Sheet can be scanned
// at a glance. The untouched UTC originals stay inside payload_json — that is
// what the app and the analysis read, so durations and orderings stay on one
// absolute scale regardless of where a participant sat.
const DISPLAY_TIMEZONE = 'Europe/Berlin'
const DISPLAY_FORMAT = 'yyyy-MM-dd HH:mm:ss'

// A long random string only you and your own scripts know. Protects doGet,
// which returns every participant's data, from anyone who finds the URL.
// Generate one yourself — do not ship this placeholder.
const READ_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_SECRET'

function toLocal(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  return Utilities.formatDate(date, DISPLAY_TIMEZONE, DISPLAY_FORMAT)
}

// Called after EVERY trial, not only at the end, so a participant who closes
// the tab halfway still leaves their partial block behind. Each participant
// therefore owns exactly one row, found by participant_id and rewritten in
// place as their session grows.
function doPost(e) {
  // Answers arrive seconds apart and Apps Script runs requests concurrently;
  // without the lock two saves can read the same row number and one silently
  // overwrites the other.
  const lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    const payload = JSON.parse(e.postData.contents)
    const participantId = payload.participant_id || ''
    if (!participantId) return jsonOut({ ok: false, error: 'No participant_id' })

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    const rowNumber = findParticipantRow(sheet, header, participantId)

    // A save that arrives after a newer one (the network reordered them) must
    // not roll the session back to fewer answers.
    if (rowNumber > 0 && isStale(sheet, header, rowNumber, payload)) {
      return jsonOut({ ok: true, stale: true })
    }

    const responses = Array.isArray(payload.responses) ? payload.responses : []

    const values = {
      timestamp: toLocal(new Date().toISOString()),
      participant_id: participantId,
      started_at: toLocal(payload.started_at),
      finished_at: toLocal(payload.finished_at),
      // 'in_progress' until the participant reaches the thank-you screen. A row
      // left at 'in_progress' is an abandoned session.
      status: payload.status || '',
      background: payload.background || '',
      answer_count: responses.length,
      agreement_count: countStratum(responses, 'agreement'),
      discriminating_count: countStratum(responses, 'discriminating'),
      // The share of answers matching the chamfer prediction, per stratum, so
      // the study's headline can be watched filling up without leaving the
      // Sheet. These are a convenience only — the app recomputes everything
      // from payload_json against the committed trial bank, which is the
      // authority, and does so with the exclusions and tests these cannot
      // apply.
      chamfer_agreement: chamferShare(responses, 'agreement'),
      chamfer_discriminating: chamferShare(responses, 'discriminating'),
      median_seconds: medianSeconds(responses),
      survey_version: payload.survey_version || '',
      // Which frozen trial bank these answers were given against. If the bank
      // is ever rebuilt, this is what separates the waves.
      bank_version: payload.bank_version || '',
      payload_json: JSON.stringify(payload),
    }

    // Written by header name rather than by position, so the column order in
    // the Sheet is free and a column you haven't added is simply skipped.
    const row = []
    for (var i = 0; i < header.length; i++) {
      const name = String(header[i]).trim()
      row.push(Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '')
    }

    if (rowNumber > 0) {
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row])
    } else {
      sheet.appendRow(row)
    }

    return jsonOut({ ok: true })
  } finally {
    lock.releaseLock()
  }
}

function countStratum(responses, stratum) {
  var n = 0
  for (var i = 0; i < responses.length; i++) {
    if (responses[i] && responses[i].stratum === stratum) n++
  }
  return n
}

// Share of that stratum's answers that matched the chamfer prediction, to three
// decimals. Blank when the stratum has no answers yet, rather than 0 — an empty
// stratum and a stratum answered entirely wrongly are not the same thing.
function chamferShare(responses, stratum) {
  var hit = 0
  var n = 0
  for (var i = 0; i < responses.length; i++) {
    const r = responses[i]
    if (!r || r.stratum !== stratum || !r.predictions) continue
    n++
    if (r.chosen_side === r.predictions.chamfer) hit++
  }
  return n ? Math.round((hit / n) * 1000) / 1000 : ''
}

// Median of duration_ms across a session's answers, in seconds to one decimal,
// so burden is visible in the Sheet without opening payload_json.
function medianSeconds(responses) {
  if (!Array.isArray(responses)) return ''
  const ds = responses
    .map(function (r) { return r && r.duration_ms })
    .filter(function (d) { return typeof d === 'number' && isFinite(d) })
    .sort(function (a, b) { return a - b })
  if (!ds.length) return ''
  const mid = Math.floor(ds.length / 2)
  const ms = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2
  return Math.round(ms / 100) / 10
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  )
}

// 1-based sheet row for this participant, or -1 if they have no row yet.
function findParticipantRow(sheet, header, participantId) {
  const col = header.indexOf('participant_id')
  if (col === -1 || sheet.getLastRow() < 2) return -1
  const ids = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues()
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === participantId) return i + 2
  }
  return -1
}

// True when the stored row already holds a newer save than the incoming one.
function isStale(sheet, header, rowNumber, payload) {
  const col = header.indexOf('payload_json')
  if (col === -1) return false
  const stored = sheet.getRange(rowNumber, col + 1).getValue()
  if (!stored) return false
  try {
    return (JSON.parse(stored).revision || 0) > (payload.revision || 0)
  } catch (err) {
    return false
  }
}

// Pulls every submission back out in exactly the shape
// src/data/matched-view-responses.json expects, so the collected study can be
// dropped into the repo and read by the P8 page.
//
//   curl "https://script.google.com/.../exec?token=YOUR_TOKEN" \
//     -o src/data/matched-view-responses.json
function doGet(e) {
  if (!e.parameter.token || e.parameter.token !== READ_TOKEN) {
    return jsonOut({ ok: false, error: 'Unauthorized' })
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  const rows = sheet.getDataRange().getValues()
  const header = rows[0]
  const data = rows.slice(1)
  const payloadCol = header.indexOf('payload_json')

  const records = data
    .filter(function (row) { return row[payloadCol] })
    .map(function (row) { return JSON.parse(row[payloadCol]) })

  return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(
    ContentService.MimeType.JSON
  )
}
