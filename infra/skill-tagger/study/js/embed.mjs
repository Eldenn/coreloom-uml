// Re-measure in the deployed stack: the same model, revision, dtype and reading as
// apps/api/app/skills/services/skill-embedder.ts (transformers.js 4.3.2, left padding,
// max_length 1024, last token, L2-normalized). Only the prefixes differ: rules get the
// retrieval instruction, skills none (as in the PyTorch study). Writes embed-output.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers'

const ID = 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const REVISION = 'c25a394dd583836952667c12f008335071b3f43d'
env.cacheDir = new URL('./models/', import.meta.url).pathname
const input = JSON.parse(readFileSync(new URL('./embed-input.json', import.meta.url)))
const tokenizer = await AutoTokenizer.from_pretrained(ID, { revision: REVISION })
tokenizer.padding_side = 'left'
const model = await AutoModel.from_pretrained(ID, { revision: REVISION, dtype: process.argv[2] ?? 'q8', device: 'cpu' })

async function embed(texts, batch = 8) {
  const out = []
  for (let i = 0; i < texts.length; i += batch) {
    const inputs = tokenizer(texts.slice(i, i + batch), { padding: true, truncation: true, max_length: 1024 })
    const res = await model(inputs)
    for (const tokens of res.last_hidden_state.tolist()) {
      const v = tokens.at(-1)
      const n = Math.hypot(...v) || 1
      out.push(v.map((x) => x / n))
    }
    process.stderr.write(`${out.length}/${texts.length}\r`)
  }
  return out
}

const t0 = Date.now()
const docs = await embed(input.docs)
const t1 = Date.now()
const queries = await embed(input.queries)
writeFileSync(new URL(`./embed-output-${process.argv[2] ?? 'q8'}.json`, import.meta.url),
  JSON.stringify({ docs, queries, msPerDoc: (t1 - t0) / docs.length, msPerQuery: (Date.now() - t1) / queries.length }))
await model.dispose()
