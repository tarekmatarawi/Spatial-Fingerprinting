# Survey storage setup (Google Sheets)

The perceptual survey (`?survey`) stores its responses **in its own spreadsheet**,
separate from the main survey. That separation is deliberate: the survey must
never merge into the primary dataset, and two different Sheets guarantee that in
a way a filter applied afterwards does not.

This mirrors [survey-storage-setup.md](survey-storage-setup.md) exactly. If you
have already done that once, this is the same 15 minutes again with three
things changed — a new spreadsheet, a different tab name, and two extra columns.

**You do not need this to test locally.** Running `npm run dev` saves survey
responses straight to `src/data/survey-responses-360.json` through Vite's dev-only
endpoint. You only need a Sheet for participants who are **not** at your machine.

---

### Step 1: Create a NEW Sheet

Do not reuse the main survey's spreadsheet.

1. Go to [sheets.google.com](https://sheets.google.com) and create a new, blank sheet.
   Name the file something like `Spatial Fingerprinting — 360 Survey`.
2. Rename the tab at the bottom from "Sheet1" to `Responses`
   (exact spelling, capital P and R).
3. In row 1, add these headers, one per cell, left to right:

   ```
   timestamp | participant_id | started_at | finished_at | status | survey_version | response_count | median_seconds | background | age_group | payload_json
   ```

Two of these do not exist in the main survey's Sheet:

- **`survey_version`** — `panoramic_v1`, so a row is self-identifying
  even if the file is ever exported and mixed with other data.
- **`median_seconds`** — the participant's median time per comparison. The whole
  point of the survey is measuring burden, so it is worth having in the Sheet at
  a glance rather than buried in `payload_json`.

There is no `attention_check_passed` column, because the survey has no attention
check. Add it if you like — the script simply leaves unknown columns blank.

---

### Step 2: Add the script

1. In the new Sheet, go to **Extensions → Apps Script**.
2. Delete whatever is in `Code.gs` and paste the full contents of
   [google-apps-script/Code.gs](../google-apps-script/Code.gs).
   (This is the survey version — *not* the main `Code.gs`.)
3. Replace `READ_TOKEN` with a long random string. Use a **different** one from
   the main survey's, so a leak of one does not expose the other. Keep it safe;
   you need it again in Step 4.
4. Save the project.

---

### Step 3: Publish it as a Web App

1. **Deploy → New deployment**.
2. Gear icon next to "Select type" → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
   ("Anyone" is required — participants are not logged into Google.)
4. **Deploy**, then authorize when prompted.
5. Copy the **Web app URL** (ends in `/exec`). You need it twice, in Steps 4 and 5.

> This URL is different from your main survey's. Keep them straight — pasting the
> main survey's URL here would write survey responses into your primary dataset,
> which is the one thing this whole arrangement exists to prevent.

---

### Step 4: Point the sync script at it

Add to `.env.local` in the project root (already git-ignored), **alongside** your
existing survey variables — don't replace them:

```
SURVEY_SHEET_URL=https://script.google.com/macros/s/AKfycb.../exec
SURVEY_SHEET_TOKEN=the-long-random-string-from-step-2
```

---

### Step 5: Point the live survey at it

Open [src/lib/surveyEndpoint.js](../src/lib/surveyEndpoint.js) and change:

```js
export const SURVEY_ENDPOINT_URL = null
```

to your URL from Step 3:

```js
export const SURVEY_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycb.../exec'
```

Commit and push. Until you do this, a participant opening the deployed survey link
is told plainly that storage is not configured rather than having their answers
silently dropped.

---

### Step 6: Bring survey responses back

```
npm run sync:survey
```

This overwrites `src/data/survey-responses-360.json` — and only that file. The
main survey's `npm run sync:survey` is untouched and writes only
`src/data/survey-responses.json`. The two never cross.

Then open `#/survey-360-review` to see timings and drop-off.

---

## Notes

- **One row per participant, growing as they answer.** The survey saves after
  every comparison and the script updates that participant's row in place, so
  someone who stops halfway has already left their answers — and their timings —
  in the Sheet.
- **`status`** reads `in_progress` until the thank-you screen, then `completed`.
  A row still on `in_progress` long after its `timestamp` is a drop-off, which is
  exactly what a feasibility survey is trying to observe.
- **Times in the Sheet are Berlin time** for readability; the original UTC values
  are preserved inside `payload_json`, and `duration_ms` per answer is there too.
- **Ten participants is a feasibility sample, not a powered one.** The review page
  deliberately reports only timing and drop-off. Don't read weights or accuracy
  out of this data.
