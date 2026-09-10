// P9 Tier B — where a sandbox lives between one visit and the next.
//
// TO BE CLEAR ABOUT WHAT THIS IS NOT. The phase's gate is that nothing
// persists to sites.json, and nothing here does: the site register is never
// read, never written, and never consulted. What this saves is the list of
// things the researcher drew ON TOP of it — a few hundred bytes of parameters
// in the browser's own storage, belonging to that browser and nothing else.
//
// It exists because losing an afternoon's design work to a stray click is not
// an acceptable property of a design tool. The sandbox is deliberately
// throwaway with respect to the DATA; it should not be throwaway with respect
// to the WORK.
//
// Browser storage only. Nothing leaves the machine, nothing reaches the repo,
// and clearing it restores Konstablerwache exactly as surveyed.

import { elementParts } from './presets.js'

const KEY = 'sf-p9-sandbox-v1'

// Every write is wrapped, because storage throws rather than returning false in
// private windows and wherever site data is blocked — and a design tool that
// crashes on a save it never needed is worse than one that quietly cannot save.
export function saveSandbox(elements) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, elements }))
    return true
  } catch {
    return false
  }
}

// Restore, discarding anything that will not survive being drawn.
//
// A stored element is untrusted input: it may come from an older build whose
// generators took different parameters, or from a preset that no longer exists.
// Anything elementParts() refuses is dropped here, on load, rather than being
// allowed to throw on the first render — which is precisely the failure that
// would make the restore worse than no restore at all.
export function loadSandbox() {
  let raw = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return { elements: [], dropped: 0 }
  }
  if (!raw) return { elements: [], dropped: 0 }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { elements: [], dropped: 0 }
  }

  const stored = Array.isArray(parsed?.elements) ? parsed.elements : []
  const elements = []
  let dropped = 0
  for (const element of stored) {
    if (!element || typeof element !== 'object' || !element.id) {
      dropped++
      continue
    }
    try {
      // A recess legitimately yields no parts; what matters is that the call
      // completes rather than what it returns.
      elementParts(element)
      elements.push(element)
    } catch {
      dropped++
    }
  }
  return { elements, dropped }
}

export function clearSandbox() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
