import { writeFileSync, renameSync } from 'node:fs'

// A direct writeFileSync to the real path can be interrupted mid-write (the
// dev server killed, a terminal closed, the machine sleeping) and leaves a
// truncated or empty file behind -- exactly what happened to
// src/data/survey-responses.json once. Writing to a sibling temp file first
// and renaming it into place avoids that: a rename on the same filesystem is
// atomic, so the target is never observed half-written.
export function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}
