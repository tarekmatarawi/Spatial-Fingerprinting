# Survey storage setup (Google Sheets)

GitHub Pages only serves files — it can't run a server to receive survey
submissions. This wires the deployed survey (`?survey`) to a free Google
Sheet instead, using a small script Google runs for you. Nothing about the
GitHub Pages deployment changes.

**Time needed:** ~15 minutes, done once.

---

### Step 1: Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new, blank sheet.
2. Rename the sheet tab at the bottom from "Sheet1" to `Responses` (exact spelling, capital R).
3. In row 1, add these column headers exactly, one per cell, left to right:

   ```
   timestamp | participant_id | started_at | finished_at | background | age_group | response_count | payload_json
   ```

That's it for the spreadsheet itself — the script fills in every row below automatically.

---

### Step 2: Add the script

1. In the Sheet, go to **Extensions → Apps Script**. A new tab opens with an empty `Code.gs`.
2. Delete anything in the editor and paste in the full contents of [google-apps-script/Code.gs](../google-apps-script/Code.gs) from this repo.
3. Near the top, replace:

   ```js
   const READ_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_SECRET'
   ```

   with a long random string of your own — this is a password that protects your participants' data from being read by anyone who guesses the URL. Anything long and hard to guess works (e.g. mash the keyboard for 30 characters). Keep it somewhere safe; you'll need it again in Step 4.

4. Save the project (the disk icon, or Ctrl/Cmd+S). Any name is fine.

---

### Step 3: Publish it as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
   
   ("Anyone" is required — participants filling out the survey aren't logged into Google, so a more restrictive setting would reject their submissions.)
4. Click **Deploy**. Google will ask you to authorize the script — approve it (it's your own script, running under your own account).
5. Copy the **Web app URL** shown after deploying. It looks like:

   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

   Keep this tab open — you need this URL twice, in Steps 4 and 5.

---

### Step 4: Point the sync script at it (for pulling data back)

In the project root, create a file named `.env.local` (this file is already git-ignored — it will never be committed) with:

```
SURVEY_SHEET_URL=https://script.google.com/macros/s/AKfycb.../exec
SURVEY_SHEET_TOKEN=the-same-long-random-string-from-step-2
```

This lets `npm run sync:survey` (see Step 6) fetch responses back into the app.

---

### Step 5: Point the live survey at it (for saving submissions)

Open [src/lib/surveyEndpoint.js](../src/lib/surveyEndpoint.js) and change:

```js
export const SURVEY_ENDPOINT_URL = null
```

to:

```js
export const SURVEY_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycb.../exec'
```

(Same URL as Step 3 — no token here, since submitting a survey doesn't need one; only reading everyone's data back does.)

Commit and push this change. The next GitHub Pages deploy will carry it, and from then on every finished survey at your published link is appended as a new row in the Sheet.

---

### Step 6: Bring responses back into the app

Whenever you want the site's Results page (and later Phases 5/6) to reflect the latest submissions:

```
npm run sync:survey
```

This overwrites `src/data/survey-responses.json` with everything currently in the Sheet. Review the diff, then commit and push as usual — that push triggers the normal GitHub Pages rebuild, same as any other data change in this project.

---

## Notes

- **Local testing is unaffected.** Running `npm run dev` still saves survey submissions straight to `src/data/survey-responses.json` via Vite's own dev-only endpoint — it never touches the real Sheet, so you can test the survey freely without polluting participant data.
- **The Sheet is the source of truth once real participants start.** After your first `sync:survey`, don't hand-edit `survey-responses.json` directly — edits will be overwritten by the next sync. Fix mistakes in the Sheet, then re-sync.
- **Data isn't live on the published site.** A submission lands in the Sheet immediately, but the researcher-facing Results page only sees it after you run `sync:survey` and push. That's a deliberate trade-off: it keeps this in step with how every other page in the app reads its data (a plain, build-time `import` of a JSON file) instead of adding a live network fetch just for this one page.
