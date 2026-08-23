// Guards a specific regression: the deployed build must not silently ship
// JavaScript syntax that a real phone's browser cannot even PARSE — not a
// runtime bug, a SyntaxError on the file itself, which manifests as a blank
// or "something went wrong" page for that one participant with nothing in
// the researcher's own testing (on a newer machine/browser) ever revealing
// it.
//
// This actually happened: Three.js's own minified output contained ES2022
// class static initialisation blocks, invisible in every check except a real
// parse against an old target — a naive text grep for suspicious tokens
// produces false positives (those characters can appear inside ordinary
// string literals) and gave false confidence the first two times this was
// investigated. This test builds the project for real and parses every
// resulting chunk with acorn, a spec-compliant parser, locked to the same
// floor the deploy targets — so a dependency bump that reintroduces newer
// syntax fails HERE, in CI, rather than on someone's phone mid-survey.
//
// import.meta is formally an ES2020 construct, and this project ships native
// ES modules regardless of build.target, so ES2020 is the correct floor to
// test against here — anything capable of loading a <script type="module">
// tag at all already supports it in practice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import { build } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ECMA_VERSION = 2020

test(
  'the production build parses at the same target it declares (no newer syntax slips through)',
  { timeout: 120_000 },
  async () => {
    const outDir = path.join(root, '.build-target-check')
    await build({
      root,
      configFile: path.join(root, 'vite.config.js'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    })

    try {
      const assetsDir = path.join(outDir, 'assets')
      const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
      assert.ok(files.length > 5, 'expected the usual spread of code-split chunks, something is off')

      const failures = []
      for (const f of files) {
        const code = fs.readFileSync(path.join(assetsDir, f), 'utf8')
        try {
          acorn.parse(code, { ecmaVersion: ECMA_VERSION, sourceType: 'module' })
        } catch (e) {
          const idx = e.pos ?? 0
          failures.push(`${f}: ${e.message}\n    near: …${code.slice(Math.max(0, idx - 60), idx + 60)}…`)
        }
      }

      assert.deepEqual(
        failures,
        [],
        `${failures.length} chunk(s) contain syntax newer than ES${ECMA_VERSION}:\n\n` +
          failures.join('\n\n') +
          '\n\nCheck vite.config.js\'s build.target, and whether a recently updated ' +
          'dependency (Three.js is the one that has bitten this project before) now ' +
          'ships syntax the bundler is not downleveling.'
      )
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  }
)
