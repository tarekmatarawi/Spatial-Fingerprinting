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

// Where a deployed MATCHED-VIEW (P8) submission is sent.
//
// A SEPARATE Web App and a separate Sheet from the panoramic survey above, and
// deliberately so: P8 is a different instrument answering a different question,
// with a different record shape. Pointing it at P3's Sheet would interleave two
// incompatible row formats in one tab and put the live perceptual study at risk
// to save the trouble of a second deployment.
//
// Empty until the researcher deploys google-apps-script/MatchedView.gs and
// pastes the resulting /exec URL here. While it is empty the survey still runs
// end to end and says plainly that nothing was stored, rather than silently
// discarding a participant's answers.
export const MATCHED_VIEW_ENDPOINT_URL = ''
