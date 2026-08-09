// The Admin page and the 3D viewer each keep their own full copy of
// sites.json in React state and can save independently while the dev server
// is running. A plain "POST my whole array" would let a stale save from one
// page silently erase a change the other just made (e.g. a building drawn in
// the viewer, then wiped out by a boundary edit saved from the admin page
// that never knew the building existed).
//
// saveSitesMerged() re-reads the live file right before saving and does a
// three-way merge, per site and per field: this page's value wins only if it
// actually changed since `baseline` (the array as last synced with the
// server); otherwise the live file's value wins, so a change made elsewhere
// survives.

export async function fetchLiveSites() {
  const response = await fetch('/__save-sites')
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
  return response.json()
}

export function mergeSites(fresh, local, baseline) {
  const freshIds = new Set(fresh.map((s) => s.id))
  const baselineIds = new Set(baseline.map((s) => s.id))
  const localById = new Map(local.map((s) => [s.id, s]))
  const baselineById = new Map(baseline.map((s) => [s.id, s]))

  const merged = []
  for (const f of fresh) {
    const l = localById.get(f.id)
    if (!l) {
      if (!baselineIds.has(f.id)) merged.push(f) // added elsewhere since our baseline
      // else: we deleted it locally — honor the deletion, drop it
      continue
    }
    const b = baselineById.get(f.id)
    if (!b) {
      merged.push(l) // no baseline to diff against — trust the local copy
      continue
    }
    const keys = new Set([...Object.keys(f), ...Object.keys(l)])
    const site = {}
    for (const key of keys) {
      site[key] = l[key] !== b[key] ? l[key] : f[key]
    }
    merged.push(site)
  }
  // Sites added locally since baseline (not on disk, not in baseline either).
  for (const l of local) {
    if (!freshIds.has(l.id) && !baselineIds.has(l.id)) merged.push(l)
  }
  return merged
}

// Fetches the live file, merges this page's pending edits onto it, saves the
// result, and returns the merged array so the caller can adopt it as its new
// local state *and* its new baseline.
export async function saveSitesMerged(local, baseline) {
  const fresh = await fetchLiveSites()
  const merged = mergeSites(fresh, local, baseline)
  const response = await fetch('/__save-sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  })
  if (!response.ok) throw new Error(`save endpoint returned ${response.status}`)
  return merged
}
