import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev-only endpoint: lets the admin page save site data back into
// src/data/sites.json while running `npm run dev`. It does not exist on the
// deployed static site, so the published admin page can't modify anything.
function sitesSaveEndpoint() {
  return {
    name: 'sites-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-sites', (req, res) => {
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

// https://vite.dev/config/
export default defineConfig({
  base: '/Spatial-Fingerprinting-/',
  plugins: [react(), tailwindcss(), sitesSaveEndpoint()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
