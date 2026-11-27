// Re-measures the tagger on the tech watch's 106 hand-labelled articles for one dtype, with the
// protocol of infra/skill-tagger/README.md: (a) head fitted on the 224 seed skills only;
// (b) skills plus the other feeds' articles, each feed held out. Both instructions.
// Usage: node watch.mjs <dtype> <items.jsonl> <labels.json>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { trainTopicHead } from './topic-head.ts'

const require = createRequire(new URL('../js/package.json', import.meta.url))
const { AutoModel, AutoTokenizer, env } = await import(require.resolve('@huggingface/transformers'))
const [dtype, itemsPath, labelsPath] = process.argv.slice(2)
const ID = 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const REVISION = 'c25a394dd583836952667c12f008335071b3f43d'
env.cacheDir = new URL('../js/models/', import.meta.url).pathname

const skills = JSON.parse(readFileSync(new URL(`./seed-${dtype}.json`, import.meta.url), 'utf8'))
const labels = JSON.parse(readFileSync(labelsPath, 'utf8'))
const items = readFileSync(itemsPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((item) => labels[item.id])
const truth = items.map((item) => labels[item.id])
const texts = items.map((item) => `${item.title}\n${item.excerpt}`.slice(0, 2000))

const tokenizer = await AutoTokenizer.from_pretrained(ID, { revision: REVISION })
tokenizer.padding_side = 'left'
const model = await AutoModel.from_pretrained(ID, { revision: REVISION, dtype, device: 'cpu' })
async function embed(instruction) {
  const out = []
  for (let i = 0; i < texts.length; i += 2) {
    const inputs = tokenizer(texts.slice(i, i + 2).map((t) => `Instruct: ${instruction}\nQuery: ${t}`),
      { padding: true, truncation: true, max_length: 1024 })
    for (const tokens of (await model(inputs)).last_hidden_state.tolist()) {
      const v = tokens.at(-1); const n = Math.hypot(...v) || 1
      out.push(v.map((x) => x / n))
    }
  }
  return out
}
const top = (p) => Object.entries(p).sort((a, b) => b[1] - a[1])
const feeds = [...new Set(items.map((item) => item.feed))]
console.log(`${dtype}: ${skills.length} skills, ${items.length} articles, ${feeds.length} feeds`)
for (const instruction of [
  'Classify what this coding agent skill is mainly about',
  'Classify what this software engineering article is mainly about',
]) {
  const vectors = await embed(instruction)
  const head = trainTopicHead(skills)
  let a = 0, a2 = 0
  vectors.forEach((v, i) => {
    const r = top(head(v))
    if (r[0][0] === truth[i]) a++
    if (r.slice(0, 2).some(([t]) => t === truth[i])) a2++
  })
  let b = 0
  for (const feed of feeds) {
    const train = [...skills]
    vectors.forEach((v, i) => { if (items[i].feed !== feed) train.push({ vector: v, topic: truth[i] }) })
    const h = trainTopicHead(train)
    vectors.forEach((v, i) => { if (items[i].feed === feed && top(h(v))[0][0] === truth[i]) b++ })
  }
  const n = vectors.length
  console.log(`[${instruction}] (a) ${(a / n).toFixed(3)} (first two ${(a2 / n).toFixed(3)})  (b) ${(b / n).toFixed(3)}`)
}
await model.dispose()
