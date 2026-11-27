// Embeds the 224 seed skills exactly as SkillEmbedder does (classification instruction prefix,
// classificationText, batch size from argv), for one dtype. Also reports peak memory and time.
// Usage: node embed-seed.mjs <dtype> <batch> [--no-save]
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../js/package.json', import.meta.url))
const { AutoModel, AutoTokenizer, env } = await import(require.resolve('@huggingface/transformers'))
const [dtype = 'q8', batchArg = '8', flag] = process.argv.slice(2)
const BATCH = Number(batchArg)
const ID = 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const REVISION = 'c25a394dd583836952667c12f008335071b3f43d'
const INSTRUCTION = 'Classify what this coding agent skill is mainly about'
env.cacheDir = new URL('../js/models/', import.meta.url).pathname

const seed = new Map(readFileSync(new URL('./seed.tsv', import.meta.url), 'utf8').trim().split('\n')
  .map((line) => line.split('\t')).map(([id, topic]) => [id.toLowerCase(), topic]))
const rows = JSON.parse(readFileSync(new URL('./skills-db.json', import.meta.url), 'utf8'))
const items = rows
  .filter((s) => s.id && seed.has(s.id.toLowerCase()) && (s.en ?? '').trim().length >= 40)
  .map((s) => ({ id: s.id, topic: seed.get(s.id.toLowerCase()), text: `${s.name}\n${s.en ?? ''}`.slice(0, 2000) }))
  .sort((a, b) => a.id.localeCompare(b.id))

const rss0 = process.memoryUsage().rss
const tokenizer = await AutoTokenizer.from_pretrained(ID, { revision: REVISION })
tokenizer.padding_side = 'left'
const model = await AutoModel.from_pretrained(ID, { revision: REVISION, dtype, device: 'cpu' })
const rssLoaded = process.memoryUsage().rss
let peak = rssLoaded
const t0 = Date.now()
const vectors = []
for (let i = 0; i < items.length; i += BATCH) {
  const inputs = tokenizer(items.slice(i, i + BATCH).map((x) => `Instruct: ${INSTRUCTION}\nQuery: ${x.text}`),
    { padding: true, truncation: true, max_length: 1024 })
  const out = await model(inputs)
  for (const tokens of out.last_hidden_state.tolist()) {
    const v = tokens.at(-1); const n = Math.hypot(...v) || 1
    vectors.push(v.map((x) => x / n))
  }
  peak = Math.max(peak, process.memoryUsage().rss)
}
const ms = (Date.now() - t0) / items.length
await model.dispose()
const gb = (b) => (b / 2 ** 30).toFixed(2)
console.log(JSON.stringify({ dtype, batch: BATCH, n: items.length, msPerText: Math.round(ms),
  rssStartGB: gb(rss0), rssLoadedGB: gb(rssLoaded), rssPeakSampledGB: gb(peak) }))
if (flag !== '--no-save') writeFileSync(new URL(`./seed-${dtype}.json`, import.meta.url),
  JSON.stringify(items.map((x, i) => ({ id: x.id, topic: x.topic, vector: vectors[i] }))))
