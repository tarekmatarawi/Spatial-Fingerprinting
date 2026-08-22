// Where a deployed survey submission is sent.
//
// GitHub Pages serves static files only, so there is no server here to receive
// a submission. This points at a Google Apps Script "Web App" acting as a free
// API in front of a Google Sheet. See docs/survey-360-storage-setup.md.
//
// This is the PANORAMIC survey's Web App — triplets plus semantic-differential
// ratings. The earlier static-photo study wrote to a different Sheet, which is
// now a closed archive: its 1,213 sessions are kept in
// src/data/survey-responses.json for the record and are not read by the app.
// Do not repoint this at that Sheet; the two instruments are not comparable and
// mixing them would spoil the archive.
export const SURVEY_ENDPOINT_URL =
  'https://script.google.com/macros/s/AKfycbwcbBUighRq9aooa49Zz8HHEPTilCt-jveQGur1purS60uYWMnbty7XWVNKeMbwH-kv/exec'
