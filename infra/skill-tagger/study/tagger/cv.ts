// README protocol: main tag right in 10-fold cross-validation on the 224 seed skills, with the
// production regression (trainTopicHead). Same folds for q8 and fp32 (paired); 10 repeats of
// the 10 folds with seeded shuffles, plus a paired bootstrap over skills on the repeat means.
// Usage: node cv.ts
import { readFileSync } from 'node:fs'
import { trainTopicHead } from './topic-head.ts'

type Row = { id: string; topic: string; vector: number[] }
const load = (d: string): Row[] => JSON.parse(readFileSync(new URL(`./seed-${d}.json`, import.meta.url), 'utf8'))
const sets = { q8: load('q8'), fp32: load('fp32') }
const n = sets.q8.length

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
function folds(seed: number): number[] {
  const order = [...Array(n).keys()]
  const r = rng(seed)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const fold = new Array(n)
  order.forEach((idx, k) => (fold[idx] = k % 10))
  return fold
}
function right(rows: Row[], fold: number[]): boolean[] {
  const out = new Array<boolean>(n)
  for (let f = 0; f < 10; f++) {
    const head = trainTopicHead(rows.filter((_, i) => fold[i] !== f))
    rows.forEach((row, i) => {
      if (fold[i] !== f) return
      const p = head(row.vector)
      out[i] = Object.entries(p).sort((a, b) => b[1] - a[1])[0][0] === row.topic
    })
  }
  return out
}

const REPEATS = 10
const perSkill = { q8: new Array(n).fill(0), fp32: new Array(n).fill(0) }
for (let r = 0; r < REPEATS; r++) {
  const fold = folds(r + 1)
  const line: string[] = []
  for (const d of ['q8', 'fp32'] as const) {
    const ok = right(sets[d], fold)
    ok.forEach((v, i) => (perSkill[d][i] += Number(v) / REPEATS))
    line.push(`${d} ${(ok.filter(Boolean).length / n).toFixed(3)}`)
  }
  console.log(`repeat ${r + 1}: ${line.join('  ')}`)
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const diff = perSkill.fp32.map((v, i) => v - perSkill.q8[i])
const r = rng(1)
const boots: number[] = []
for (let b = 0; b < 5000; b++) { let s = 0; for (let k = 0; k < n; k++) s += diff[Math.floor(r() * n)]; boots.push(s / n) }
boots.sort((a, b) => a - b)
console.log(`n ${n}  q8 ${mean(perSkill.q8).toFixed(3)}  fp32 ${mean(perSkill.fp32).toFixed(3)}  ` +
  `fp32 - q8 ${mean(diff).toFixed(3)} [${boots[124].toFixed(3)}, ${boots[4874].toFixed(3)}]`)
