// Google Apps Script "Web App" acting as a free API in front of a Google
// Sheet, so the GitHub Pages survey (which cannot run its own server) has
// somewhere to send participant responses. See docs/survey-storage-setup.md
// for the full setup walkthrough — this file is not run automatically; it is
// meant to be copied into the Sheet's Extensions > Apps Script editor.
//
// This is not part of the Vite build — it never ships to the browser.

const SHEET_NAME = 'Responses'

// The readable date columns are written in the researcher's own timezone so the
// Sheet can be scanned at a glance. Utilities.formatDate resolves DST for the
// actual date, so summer rows read +02:00 and winter rows +01:00 automatically.
// The untouched UTC originals stay inside payload_json — that is what the app
// and the thesis analysis read, so comparisons and durations remain on one
// absolute scale regardless of where a participant sat.
const DISPLAY_TIMEZONE = 'Europe/Berlin'
const DISPLAY_FORMAT = 'yyyy-MM-dd HH:mm:ss'

function toLocal(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  return Utilities.formatDate(date, DISPLAY_TIMEZONE, DISPLAY_FORMAT)
}

// A long random string only you and the sync script know. Protects doGet
// (which returns every participant's data) from being readable by anyone who
// finds the URL. Generate one yourself — do not reuse this placeholder.
const READ_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_SECRET'

// Called when the survey page POSTs the session — which it now does after
// every single answer, not just at the end, so a participant who closes the tab
// halfway still leaves their partial answers behind. Each participant therefore
// owns exactly one row, found by participant_id and rewritten in place as their
// session grows. The full submission JSON is kept verbatim in payload_json so
// the sync script can reconstruct it exactly.
function doPost(e) {
  // Answers arrive seconds apart and Apps Script happily runs requests
  // concurrently; without the lock two saves can read the same row number and
  // one silently overwrites the other.
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

    const values = {
      timestamp: toLocal(new Date().toISOString()),
      participant_id: participantId,
      started_at: toLocal(payload.started_at),
      finished_at: toLocal(payload.finished_at),
      // 'in_progress' until the participant reaches the thank-you screen. A row
      // left at 'in_progress' is an abandoned session — the app treats one as
      // abandoned once it has been quiet for 30 minutes.
      status: payload.status || '',
      // TRUE/FALSE (blank until the mid-survey attention check is answered), so
      // it can be filtered on directly without opening payload_json.
      attention_check_passed:
        typeof payload.attention_check_passed === 'boolean' ? payload.attention_check_passed : '',
      background: payload.background || '',
      age_group: payload.age_group || '',
      response_count: Array.isArray(payload.responses) ? payload.responses.length : 0,
      payload_json: JSON.stringify(payload),
    }

    // Written by header name rather than by position, so the column order in
    // the Sheet is free and a column you haven't added yet is simply skipped.
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
