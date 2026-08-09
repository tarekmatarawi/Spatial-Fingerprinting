import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev-only endpoint: lets the admin page and the 3D viewer save site data
// back into src/data/sites.json while running `npm run dev`. It does not
// exist on the deployed static site, so the published admin page can't
// modify anything. GET returns the current file straight from disk — both
// pages read it right before saving to merge in whatever the other one wrote
// since they last synced, instead of overwriting it with a stale copy.
function sitesSaveEndpoint() {
  return {
    name: 'sites-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-sites', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(fs.readFileSync(path.resolve(dirname, 'src/data/sites.json'), 'utf8'))
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const sites = JSON.parse(body)
            if (!Array.isArray(sites)) throw new Error('Expected an array of sites')
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/sites.json'),
              JSON.stringify(sites, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: lets the viewer save computed isovist results back into
// src/data/results.json while running `npm run dev`. Mirrors sitesSaveEndpoint
// above — it does not exist on the deployed static site, so saving there fails
// gracefully and the viewer falls back to an inline "local only" message.
function resultsSaveEndpoint() {
  return {
    name: 'results-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const results = JSON.parse(body)
            if (!Array.isArray(results)) throw new Error('Expected an array of results')
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/results.json'),
              JSON.stringify(results, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: persists the live viewer state (selected plaza + current
// vantage point/direction) to src/data/viewer-state.json while running
// `npm run dev`, so a fresh tab reopens where the researcher left off. Like the
// other two it doesn't exist on the deployed static site (there the URL query
// keeps carrying the state instead).
function viewerStateSaveEndpoint() {
  return {
    name: 'viewer-state-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-viewer-state', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const state = JSON.parse(body)
            if (state === null || typeof state !== 'object' || Array.isArray(state)) {
              throw new Error('Expected a viewer-state object')
            }
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/viewer-state.json'),
              JSON.stringify(state, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: stores one participant's survey session in
// src/data/survey-responses.json. The survey saves after every answer rather
// than once at the end, so this is an upsert keyed on participant_id — the
// first answer creates the record and each later save replaces it in place,
// leaving exactly one row per participant however far they got. A save whose
// `revision` is older than the stored one is ignored, so an out-of-order
// arrival can't roll a session backwards. On the deployed site this endpoint is
// absent; the Google Apps Script Web App takes its place (same upsert rules).
function surveySaveEndpoint() {
  return {
    name: 'survey-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-survey', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const submission = JSON.parse(body)
            if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
              throw new Error('Expected a submission object')
            }
            if (!submission.participant_id) throw new Error('Submission has no participant_id')

            const file = path.resolve(dirname, 'src/data/survey-responses.json')
            const existing = JSON.parse(fs.readFileSync(file, 'utf8') || '[]')
            const at = existing.findIndex((r) => r.participant_id === submission.participant_id)

            if (at === -1) {
              existing.push(submission)
            } else if ((submission.revision ?? 0) >= (existing[at].revision ?? 0)) {
              existing[at] = submission
            } else {
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ ok: true, stale: true, total: existing.length }))
            }

            fs.writeFileSync(file, JSON.stringify(existing, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, total: existing.length }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: reads src/data/survey-responses.json back out. The Results
// page imports that file at build time, so without this a researcher watching
// coverage build up would have to reload the whole page after every participant
// (or after `npm run sync:survey`) to see it move. Absent on the deployed static
// site, where the bundled snapshot is all there is — the Refresh button says so
// rather than silently doing nothing.
function surveyReadEndpoint() {
  return {
    name: 'survey-read-endpoint',
    configureServer(server) {
      server.middlewares.use('/__survey-responses', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        try {
          const file = path.resolve(dirname, 'src/data/survey-responses.json')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(fs.readFileSync(file, 'utf8') || '[]')
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
        }
      })
    },
  }
}

const IMAGES_DIR = path.resolve(dirname, 'public/images')
const SAFE_IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/

// Dev-only endpoint: lets the admin page upload a site's Street View screenshot
// straight from disk instead of the researcher manually copying files into
// public/images/. The filename travels in the `x-filename` header (sanitized
// against a strict allowlist — this writes to disk from a request, so anything
// resembling a path is rejected outright, not just stripped); the raw image
// bytes are the request body. Absent on the deployed static site.
function uploadImageEndpoint() {
  return {
    name: 'upload-image-endpoint',
    configureServer(server) {
      server.middlewares.use('/__upload-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const name = req.headers['x-filename']
        if (typeof name !== 'string' || !SAFE_IMAGE_NAME.test(name)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(
            JSON.stringify({
              ok: false,
              error: 'Filename must be lowercase letters/numbers/dashes, ending in .jpg/.jpeg/.png/.webp',
            })
          )
        }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          try {
            fs.mkdirSync(IMAGES_DIR, { recursive: true })
            const dest = path.join(IMAGES_DIR, name)
            fs.writeFileSync(dest, Buffer.concat(chunks))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: `/images/${name}` }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/Spatial-Fingerprinting/',
  plugins: [
    react(),
    tailwindcss(),
    sitesSaveEndpoint(),
    resultsSaveEndpoint(),
    viewerStateSaveEndpoint(),
    surveySaveEndpoint(),
    surveyReadEndpoint(),
    uploadImageEndpoint(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
