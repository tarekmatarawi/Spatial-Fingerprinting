// Where a deployed (GitHub Pages) survey submission is sent. GitHub Pages only
// serves static files, so there is no server here to receive it — this points
// instead at a Google Apps Script "Web App" acting as a free API in front of a
// Google Sheet. See docs/survey-storage-setup.md for how to create one.
//
// Paste the deployment URL below once it exists (it ends in /exec). Leave it
// null until then — SurveyPage shows a clear "not yet configured" message
// instead of silently losing responses.
export const SURVEY_ENDPOINT_URL =
  'https://script.google.com/macros/s/AKfycbztWkMMOVViDzudNVZuzYwfNyPb-Xb2KHw_EUXeI8UUqNYUjgGMZAxpl3kpSjNMt7ec/exec'
