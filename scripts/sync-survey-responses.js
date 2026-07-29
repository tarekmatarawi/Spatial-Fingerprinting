#!/usr/bin/env node
// Pulls every participant submission out of the Google Sheet (via the Apps
// Script Web App in google-apps-script/Code.gs) and overwrites
// src/data/survey-responses.json with it — the same file the dev-only
// /__save-survey endpoint appends to locally. Run after any batch of
// participants, then commit + push like any other data update:
//
//   npm run sync:survey
//
// Needs SURVEY_SHEET_URL and SURVEY_SHEET_TOKEN, either exported in your
// shell or placed in a git-ignored .env.local file (KEY=value per line) —
// see docs/survey-storage-setup.md.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dirname, '..')

// Minimal .env.local loader — the project has no dotenv dependency, and this
// is the only script that needs one, so a few lines beats a new package.
function loadEnvLocal() {
  const file = path.join(root, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()

  const url = process.env.SURVEY_SHEET_URL
  const token = process.env.SURVEY_SHEET_TOKEN
  if (!url || !token) {
    console.error(
      'Missing SURVEY_SHEET_URL and/or SURVEY_SHEET_TOKEN.\n' +
        'Set them in a .env.local file at the project root — see docs/survey-storage-setup.md.'
    )
    process.exit(1)
  }

  const endpoint = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
  const res = await fetch(endpoint)
  if (!res.ok) {
    console.error(`Sheet request failed: HTTP ${res.status}`)
    process.exit(1)
  }

  const records = await res.json()
  if (!Array.isArray(records)) {
    console.error('Expected the Sheet to return an array — got:', records)
    process.exit(1)
  }

  const dest = path.join(root, 'src/data/survey-responses.json')
  writeFileSync(dest, JSON.stringify(records, null, 2))
  console.log(`Synced ${records.length} response${records.length === 1 ? '' : 's'} to ${dest}`)
}

main()
