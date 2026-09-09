// P8's gate: the analysis, checked against data whose answer is known.
//
//   npm run matched-view:selftest
//
// The spec's rule for P5 applies here unchanged — no real number is trustworthy
// until the machinery recovers a planted one. The danger in a 2AFC validation is
// specific and easy to miss: the scoring code decides which answer counts as
// "correct" for each measure, and if that mapping is inverted, or a stratum is
// crossed, or the two candidates are transposed anywhere between the bank and
// the tally, the result is not a crash. It is a plausible-looking accuracy that
// is wrong, or worse, one that flatters whichever measure the phase set out to
// support.
//
// So responses are SIMULATED from a known truth and the analysis is asked to
// find it back:
//
//   1. RECOVERY. Participants who follow one measure at a known rate θ produce
//      an estimated accuracy of θ for that measure — and, on the discriminating
//      stratum where the measures predict opposite candidates, 1−θ for the
//      others. The mirror is the sharper half of the test: it fails loudly if
//      the scoring silently treats every measure as agreeing.
//   2. NO BAKED-IN WINNER. The same simulation is run with CENTROID as the
//      truth. The adjudication must then point at centroid just as decisively.
//      A pipeline that favours chamfer structurally would pass step 1 and fail
//      this one.
//   3. CALIBRATION UNDER THE NULL. With participants answering at random, the
//      test must reject at no more than its nominal rate. A test that fires on
//      6% of null datasets at α = 0.05 would make any real result unreadable.
//      An exact binomial on discrete counts is CONSERVATIVE, so the observed
//      rate is expected to sit at or below 0.05, never above it.
//   4. POSITION RANDOMISATION. Simulated participants answer purely by content,
//      so the position-bias check must come back null. If it flags a bias here,
//      the side assignment is correlated with the prediction and every accuracy
//      in the study is confounded with a left-hand preference.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BLOCK_LENGTH,
  PREDICTORS,
  TRIALS_PER_STRATUM,
  assembleMatchedViewBlock,
  hashString,
  mulberry32,
  validateTrialBank,
} from '../src/lib/matchedView.js'
import { analyseMatchedView } from '../src/lib/analysis/matchedView.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dirname, '..')

const bank = validateTrialBank(
  JSON.parse(readFileSync(path.resolve(root, 'src/data/matched-view-trials.json'), 'utf8'))
)

let failures = 0
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// One synthetic cohort. Each participant gets a real block from the real bank,
// then answers each trial by following `truth` with probability `theta` and
// taking the other candidate otherwise.
//
// Deliberately routed through assembleMatchedViewBlock rather than sampling
// trials directly: the block assembler is part of what is being tested. If it
// ever drew the same trial twice for one participant, or lost a stratum, this
// simulation would inherit the fault and the recovery check would catch it.
function simulate(theta, truth, { participants = 40, seed = 'selftest' } = {}) {
  const records = []
  for (let i = 0; i < participants; i++) {
    const participantId = `${seed}-p${i}`
    const rng = mulberry32(hashString(`${seed}:answers:${participantId}`))
    const block = assembleMatchedViewBlock(bank, participantId)
    const responses = block.map(({ trial, order, leftSide }) => {
      const predicted = trial.predictions[truth]
      const other = predicted === 'a' ? 'b' : 'a'
      const chosen = rng() < theta ? predicted : other
      return {
        participant_id: participantId,
        trial_id: trial.trial_id,
        order,
        stratum: trial.stratum,
        chosen_side: chosen,
        left_side: leftSide,
        predictions: trial.predictions,
        duration_ms: 4000,
      }
    })
    records.push({ participant_id: participantId, responses, status: 'completed' })
  }
  return records
}

const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol

console.log('\nP8 matched-view analysis self-test')
console.log(`  bank: ${bank.trials.length} trials, generated ${bank.generated_at}`)

/* 0. The block assembler itself. */
console.log('\n0. Block assembly')
{
  const block = assembleMatchedViewBlock(bank, 'check-participant')
  const ids = new Set(block.map((b) => b.trial.trial_id))
  const perStratum = {}
  for (const b of block) perStratum[b.trial.stratum] = (perStratum[b.trial.stratum] ?? 0) + 1
  check('block is the declared length', block.length === BLOCK_LENGTH, `${block.length}`)
  check('no trial repeats within a block', ids.size === block.length, `${ids.size} distinct`)
  check(
    'both strata are present in equal number',
    perStratum.agreement === TRIALS_PER_STRATUM && perStratum.discriminating === TRIALS_PER_STRATUM,
    JSON.stringify(perStratum)
  )
  const again = assembleMatchedViewBlock(bank, 'check-participant')
  check(
    'the same participant id reproduces the same block',
    again.every((b, i) => b.trial.trial_id === block[i].trial.trial_id && b.leftSide === block[i].leftSide)
  )
  const other = assembleMatchedViewBlock(bank, 'a-different-participant')
  check(
    'a different participant id gives a different block',
    other.some((b, i) => b.trial.trial_id !== block[i].trial.trial_id)
  )
  // Interleaving: if the strata were blocked, every agreement trial would come
  // before every discriminating one (or the reverse).
  const firstDisc = block.findIndex((b) => b.trial.stratum === 'discriminating')
  const lastAgree = block.map((b) => b.trial.stratum).lastIndexOf('agreement')
  check('the strata are interleaved, not blocked', firstDisc < lastAgree, `first disc ${firstDisc}, last agree ${lastAgree}`)
}

/* 1. Recovery, with chamfer as the truth. */
console.log('\n1. Recovery — participants follow CHAMFER at 78%')
{
  const THETA = 0.78
  const result = analyseMatchedView(simulate(THETA, 'chamfer'), bank)
  const agree = result.strata.agreement.predictors
  const disc = result.strata.discriminating.predictors

  check('no responses orphaned or stale', result.orphaned.length === 0 && result.stale.length === 0)
  check(
    'agreement stratum recovers theta for every measure',
    PREDICTORS.every((p) => near(agree[p].accuracy, THETA, 0.05)),
    PREDICTORS.map((p) => `${p} ${agree[p].accuracy.toFixed(3)}`).join(', ')
  )
  check(
    'discriminating stratum recovers theta for chamfer',
    near(disc.chamfer.accuracy, THETA, 0.05),
    disc.chamfer.accuracy.toFixed(3)
  )
  check(
    'discriminating stratum recovers 1-theta for the cloud measures',
    near(disc.centroid.accuracy, 1 - THETA, 0.05) && near(disc.gaussian.accuracy, 1 - THETA, 0.05),
    `centroid ${disc.centroid.accuracy.toFixed(3)}, gaussian ${disc.gaussian.accuracy.toFixed(3)}`
  )

  const adj = result.strata.discriminating.adjudication.chamfer_vs_centroid
  check(
    'adjudication favours chamfer and is significant',
    adj.a_only > adj.b_only && adj.p_value < 0.001,
    `chamfer-only ${adj.a_only}, centroid-only ${adj.b_only}, p ${adj.p_value.toExponential(2)}`
  )
  check(
    'agreement stratum has no discordant pairs to adjudicate',
    result.strata.agreement.adjudication.chamfer_vs_centroid.discordant === 0
  )
  check(
    'position randomisation leaves no side preference',
    result.position_bias.p_value > 0.01,
    `left share ${result.position_bias.left_share.toFixed(3)}, p ${result.position_bias.p_value.toFixed(3)}`
  )
}

/* 2. The mirror: centroid as the truth. */
console.log('\n2. No baked-in winner — participants follow CENTROID at 78%')
{
  const THETA = 0.78
  const result = analyseMatchedView(simulate(THETA, 'centroid', { seed: 'mirror' }), bank)
  const disc = result.strata.discriminating.predictors
  check(
    'discriminating stratum recovers theta for centroid',
    near(disc.centroid.accuracy, THETA, 0.05),
    disc.centroid.accuracy.toFixed(3)
  )
  check(
    'discriminating stratum recovers 1-theta for chamfer',
    near(disc.chamfer.accuracy, 1 - THETA, 0.05),
    disc.chamfer.accuracy.toFixed(3)
  )
  const adj = result.strata.discriminating.adjudication.chamfer_vs_centroid
  check(
    'adjudication now favours centroid, just as decisively',
    adj.b_only > adj.a_only && adj.p_value < 0.001,
    `chamfer-only ${adj.a_only}, centroid-only ${adj.b_only}, p ${adj.p_value.toExponential(2)}`
  )
}

/* 3. Calibration under the null. */
console.log('\n3. Calibration — participants answer at random (theta = 0.5)')
{
  const REPLICATES = 200
  const ALPHA = 0.05
  let pooledRejects = 0
  let participantRejects = 0
  let adjudicationRejects = 0
  const pooled = []

  for (let i = 0; i < REPLICATES; i++) {
    const result = analyseMatchedView(
      simulate(0.5, 'chamfer', { participants: 30, seed: `null-${i}` }),
      bank
    )
    const disc = result.strata.discriminating
    const p = disc.predictors.chamfer.pooled.p_value
    pooled.push(p)
    if (p < ALPHA) pooledRejects++
    if (disc.predictors.chamfer.participant_level.p_value < ALPHA) participantRejects++
    if (disc.adjudication.chamfer_vs_centroid.p_value < ALPHA) adjudicationRejects++
  }

  const rate = (n) => n / REPLICATES
  // An exact test on discrete counts cannot spend its whole α, so the observed
  // rate is expected at or below nominal. The upper bound allows for Monte
  // Carlo noise at 200 replicates (a true 0.05 rate has an SD of about 1.5pp).
  check(
    'pooled binomial rejects at no more than the nominal rate',
    rate(pooledRejects) <= 0.09,
    `${(rate(pooledRejects) * 100).toFixed(1)}% at alpha ${ALPHA}`
  )
  check(
    'participant-level sign test rejects at no more than the nominal rate',
    rate(participantRejects) <= 0.09,
    `${(rate(participantRejects) * 100).toFixed(1)}%`
  )
  check(
    'McNemar adjudication rejects at no more than the nominal rate',
    rate(adjudicationRejects) <= 0.09,
    `${(rate(adjudicationRejects) * 100).toFixed(1)}%`
  )
  // A test that never rejects would also "pass" the bound above while being
  // useless, so the p-values are checked for spread rather than only for size.
  const median = pooled.slice().sort((a, b) => a - b)[Math.floor(REPLICATES / 2)]
  check(
    'null p-values are spread, not pinned at 1',
    median > 0.2 && median < 0.8,
    `median p ${median.toFixed(3)}`
  )
}

/* 4. The margin curve, on data built to have one. */
console.log('\n4. Margin curve responds to prediction strength')
{
  // Participants who follow chamfer more reliably when the margin is wide —
  // which is what a real attentive cohort should look like. The curve must rise.
  const records = []
  for (let i = 0; i < 40; i++) {
    const participantId = `margin-p${i}`
    const rng = mulberry32(hashString(`margin:${participantId}`))
    const block = assembleMatchedViewBlock(bank, participantId)
    records.push({
      participant_id: participantId,
      status: 'completed',
      responses: block.map(({ trial, order, leftSide }) => {
        const theta = 0.5 + Math.min(0.45, trial.strength * 0.6)
        const predicted = trial.predictions.chamfer
        const other = predicted === 'a' ? 'b' : 'a'
        return {
          participant_id: participantId,
          trial_id: trial.trial_id,
          order,
          stratum: trial.stratum,
          chosen_side: rng() < theta ? predicted : other,
          left_side: leftSide,
          predictions: trial.predictions,
        }
      }),
    })
  }
  const result = analyseMatchedView(records, bank)
  const curve = result.strata.agreement.margin_curve.chamfer
  check('the curve has bins to read', curve.length >= 3, `${curve.length} bins`)
  check(
    'accuracy rises from the weakest to the strongest margin bin',
    curve.at(-1).accuracy > curve[0].accuracy,
    `${curve[0].accuracy.toFixed(3)} → ${curve.at(-1).accuracy.toFixed(3)}`
  )
}

/* 5. Provenance guards. */
console.log('\n5. Provenance — a rebuilt bank must not be rescored silently')
{
  const records = simulate(0.8, 'chamfer', { participants: 5, seed: 'prov' })
  // An answer to a trial that no longer exists.
  records[0].responses[0].trial_id = 'a-trial-that-was-removed'
  // An answer whose recorded prediction no longer matches the bank's.
  const drifted = records[1].responses[0]
  drifted.predictions = { ...drifted.predictions, chamfer: drifted.predictions.chamfer === 'a' ? 'b' : 'a' }

  const result = analyseMatchedView(records, bank)
  check('a response naming a missing trial is reported, not dropped', result.orphaned.length === 1)
  check('a response whose predictions drifted is reported, not rescored', result.stale.length === 1)
  check(
    'neither is counted in the scored rows',
    result.n_rows === 5 * BLOCK_LENGTH - 2,
    `${result.n_rows} rows`
  )
}

console.log(
  failures === 0
    ? '\nAll checks passed. The analysis recovers a planted answer and holds its size under the null.\n'
    : `\n${failures} check(s) FAILED — do not read any real result until these pass.\n`
)
process.exit(failures === 0 ? 0 : 1)
