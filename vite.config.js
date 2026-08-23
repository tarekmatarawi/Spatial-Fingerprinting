import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { writeJsonAtomic } from './scripts/writeJsonAtomic.js'

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
            writeJsonAtomic(path.resolve(dirname, 'src/data/sites.json'), sites)
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
            writeJsonAtomic(path.resolve(dirname, 'src/data/results.json'), results)
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
            writeJsonAtomic(path.resolve(dirname, 'src/data/viewer-state.json'), state)
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



// Dev-only endpoints for the panoramic survey. Deliberately a SEPARATE file from
// the archived static-photo dataset: the two instruments are not comparable,
// and separate storage is a stronger guarantee of that than a filter applied
// later. Same upsert-on-participant_id and stale-revision rules as the main
// survey.
function survey360Endpoints() {
  const FILE = 'src/data/survey-responses-360.json'
  return {
    name: 'survey-360-endpoints',
    configureServer(server) {
      server.middlewares.use('/__save-survey-360', (req, res) => {
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

            const file = path.resolve(dirname, FILE)
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

            writeJsonAtomic(file, existing)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, total: existing.length }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })

      server.middlewares.use('/__survey-360-responses', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          return res.end()
        }
        try {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(fs.readFileSync(path.resolve(dirname, FILE), 'utf8') || '[]')
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
        }
      })
    },
  }
}

const UPLOAD_DIRS = {
  images: path.resolve(dirname, 'public/images'),
  panoramas: path.resolve(dirname, 'public/panoramas'),
}
const SAFE_IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/

// Dev-only endpoint: lets the admin page upload a site's Street View screenshot
// or its 360° panorama straight from disk, instead of the researcher copying
// files into public/images/ or public/panoramas/ by hand. The filename travels in the `x-filename` header (sanitized
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
        // The destination folder is an allowlist lookup, never a path from the
        // request — an unknown value falls back to images rather than resolving
        // anywhere the caller names.
        const folder = req.headers['x-folder']
        const dir = UPLOAD_DIRS[folder] ?? UPLOAD_DIRS.images
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
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks))
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: true,
                path: `/${folder === 'panoramas' ? 'panoramas' : 'images'}/${name}`,
              })
            )
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
  // A conservative baseline rather than the bundler's own default. Verified
  // (test/build-target.test.js, and check-syntax.mjs used while diagnosing
  // this) that without an explicit target, third-party code — Three.js in
  // particular — ships syntax as new as ES2022 class static blocks
  // untouched, which a phone on Safari older than 16.4 cannot even PARSE:
  // not a runtime error, a SyntaxError on the file itself, silently failing
  // exactly where a participant is most likely to be — on their own phone,
  // mid-survey. es2020 is deliberately conservative; nothing here depends on
  // anything newer, and the cost of targeting lower is a few bytes, not a
  // feature.
  build: {
    target: 'es2020',
  },
  plugins: [
    react(),
    tailwindcss(),
    sitesSaveEndpoint(),
    resultsSaveEndpoint(),
    viewerStateSaveEndpoint(),
    survey360Endpoints(),
    uploadImageEndpoint(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
