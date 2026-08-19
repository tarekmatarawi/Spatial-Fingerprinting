// Worker thread for the P5 permutation test.
//
// The null distribution needs 1000 replicates × 18 folds ≈ 18,000 model fits —
// about a quarter of an hour on one core. Each replicate is independent and
// seeded by its own index, so spreading them across cores changes nothing about
// the result, only how long it takes.
//
// Typed arrays survive the structured clone into `workerData`, so the prepared
// triplets arrive ready to fit with no re-derivation here.

import { parentPort, workerData } from 'node:worker_threads'
import { permutationReplicate } from '../src/lib/analysis/crossval.js'

const { triplets, siteIds, indices, seed } = workerData

// Float64Array survives the clone, but plain-object triplets come back with
// their delta as an ArrayBuffer view — rewrap defensively so downstream code
// sees exactly what it saw in the main thread.
const prepared = triplets.map((t) => ({
  ...t,
  delta: t.delta instanceof Float64Array ? t.delta : new Float64Array(t.delta),
}))

const accuracies = indices.map((index) =>
  permutationReplicate(prepared, siteIds, index, seed)
)

parentPort.postMessage({ indices, accuracies })
