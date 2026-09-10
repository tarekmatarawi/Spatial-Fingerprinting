import { useCallback, useEffect, useState } from 'react'
import { LuFolderOpen, LuSave, LuTrash2 } from 'react-icons/lu'

import {
  EMPTY_SCENARIO_FILE,
  makeScenario,
  removeScenario,
  scenarioDrift,
  upsertScenario,
  validateScenarioFile,
} from '@/lib/scenarios'

// P9 — saving an intervention under a name.
//
// The sandbox already survives a reload (lib/sandboxStore.js). This is the
// other thing a thesis needs: three named alternatives, side by side, reopenable
// next week and citable in a chapter. The distinction is worth keeping clear on
// screen too, which is why this panel says where each kind of work lives rather
// than presenting one "save" that means two different things.
//
// DEV-ONLY WRITES, AND IT SAYS SO. The endpoint exists under `npm run dev` and
// not on the deployed static site, exactly like the view-cloud and survey
// writers. On the deployed build the list still loads from the file bundled at
// build time — scenarios written locally and committed are readable by anyone —
// and the save control explains that it cannot write, rather than appearing to
// work and dropping the scenario. A control that silently does nothing is worse
// than one that is absent.
//
// NOTHING HERE TOUCHES sites.json. What is written is the list of things drawn
// on top of it; the plaza is always as surveyed. See lib/scenarios.js.

export function ScenarioPanel({
  siteId,
  elements,
  selection,
  radiusM,
  targetZone,
  provenance,
  bundled,
  onLoad,
}) {
  const [file, setFile] = useState(bundled ?? EMPTY_SCENARIO_FILE)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  // Which saved scenario the sandbox currently came from, so saving again
  // updates it rather than making a near-duplicate under the same name.
  const [openId, setOpenId] = useState(null)

  const canWrite = import.meta.env.DEV

  // Read the file from disk on arrival while running locally. The bundled copy
  // is a build-time snapshot; a scenario saved in another tab five minutes ago
  // is not in it, and a list quietly missing a scenario someone just saved is
  // the fastest way to make them save it twice.
  const refresh = useCallback(async () => {
    if (!canWrite) return
    try {
      const res = await fetch('/__scenarios', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setFile(validateScenarioFile(data))
    } catch {
      // Keep whatever is already loaded. The panel labels its own source below.
    }
  }, [canWrite])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function persist(next, message) {
    setBusy(true)
    setStatus(null)
    try {
      validateScenarioFile(next)
      const res = await fetch('/__save-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`)
      setFile(next)
      setStatus({ kind: 'ok', message })
    } catch (err) {
      // Shown, never swallowed. A failed save that looks like a successful one
      // is how an afternoon's work disappears.
      setStatus({ kind: 'error', message: String(err.message || err) })
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Give the scenario a name first.' })
      return
    }
    if (!elements.length) {
      setStatus({
        kind: 'error',
        message: 'Nothing is drawn — an empty scenario would record no decision.',
      })
      return
    }
    const scenario = makeScenario({
      id: openId ?? undefined,
      name: trimmed,
      note,
      siteId,
      elements,
      selection,
      radiusM: selection ? radiusM : null,
      targetZone,
      provenance,
    })
    setOpenId(scenario.id)
    persist(upsertScenario(file, scenario), `Saved “${trimmed}”.`)
  }

  function load(scenario) {
    onLoad(scenario)
    setOpenId(scenario.id)
    setName(scenario.name)
    setNote(scenario.note ?? '')
    setStatus({ kind: 'ok', message: `Opened “${scenario.name}”.` })
  }

  function remove(scenario) {
    if (openId === scenario.id) setOpenId(null)
    persist(removeScenario(file, scenario.id), `Deleted “${scenario.name}”.`)
  }

  const mine = (file.scenarios ?? []).filter((s) => s.site_id === siteId)

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between border-b border-line pb-1.5">
        <h3 className="text-xs font-semibold text-ink">Saved scenarios</h3>
        <span className="font-mono text-[10px] text-ink-faint">
          {mine.length} for this plaza
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
        A scenario stores what you <span className="text-ink">drew</span>, the area you selected
        and the character you diagnosed it against — nothing measured. Everything else is computed
        again when you open it, so a scenario cannot go quietly out of date with the plaza.
      </p>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Colonnade on the north edge"
            className="mt-0.5 w-full rounded border border-line bg-paper px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What this was testing, and what it showed."
            className="mt-0.5 w-full resize-y rounded border border-line bg-paper px-2 py-1 text-[12px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={save}
          disabled={!canWrite || busy}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-line-strong bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
        >
          <LuSave className="size-3" />
          {busy ? 'saving…' : openId ? 'update this scenario' : 'save scenario'}
        </button>
      </div>

      {!canWrite && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          Saving works while the site is running locally (<span className="font-mono">npm run
          dev</span>), because it writes a file into the repository. On the published site the
          list below is read-only — scenarios saved locally and committed appear here for
          everyone.
        </p>
      )}

      {status && (
        <p
          className={`mt-2 text-[11px] leading-relaxed ${
            status.kind === 'error' ? 'text-redline' : 'text-ok'
          }`}
        >
          {status.message}
        </p>
      )}

      {mine.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-2">
          {mine.map((s) => {
            const drift = scenarioDrift(s, provenance)
            return (
              <li key={s.id} className="group">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[12px] ${
                        openId === s.id ? 'font-medium text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {s.name}
                    </p>
                    <p className="font-mono text-[10px] text-ink-faint">
                      {s.elements.length} element{s.elements.length === 1 ? '' : 's'}
                      {s.target_zone != null ? ` · zone ${s.target_zone}` : ''}
                      {' · '}
                      {(s.updated_at ?? s.created_at ?? '').slice(0, 10)}
                    </p>
                    {s.note && (
                      <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{s.note}</p>
                    )}
                    {/* Drift is stated on the scenario that has it, not in a
                        footnote. A scenario saved against a typology that has
                        since been recomputed still opens and still measures —
                        but its numbers are answers to a slightly different
                        question, and the only place that warning is any use is
                        next to the button that opens it. */}
                    {drift.length > 0 && (
                      <p className="mt-0.5 text-[10px] leading-snug text-warn">
                        Saved before {drift.join(' and ')} — it will reopen and re-measure, but the
                        numbers will not be the ones it was named for.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => load(s)}
                    title="Open this scenario in the sandbox"
                    className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:text-primary"
                  >
                    <LuFolderOpen className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s)}
                    disabled={!canWrite || busy}
                    title="Delete this scenario"
                    className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:text-redline disabled:opacity-40"
                  >
                    <LuTrash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-2 border-t border-line pt-2 font-mono text-[10px] leading-relaxed text-ink-faint">
        written to src/data/scenarios.json · never to the site register
      </p>
    </div>
  )
}
