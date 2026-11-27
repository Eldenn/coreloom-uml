// Usage: node score.mjs <repo> <revision> <dtype> <prompts.json> ; scores each formatted prompt by p(yes).
import { readFileSync } from 'node:fs'
import { env, AutoTokenizer, AutoModelForCausalLM } from '@huggingface/transformers'
const [repo, revision, dtype, file, subfolder = 'onnx'] = process.argv.slice(2)
env.cacheDir = new URL('./models/', import.meta.url).pathname
const prompts = JSON.parse(readFileSync(file, 'utf8'))
const tok = await AutoTokenizer.from_pretrained(repo, { revision })
const model = await AutoModelForCausalLM.from_pretrained(repo, { revision, dtype, subfolder, device: 'cpu',
  session_options: { intraOpNumThreads: 8 } })
const rssLoaded = process.memoryUsage().rss / 1e6
const yes = tok.convert_tokens_to_ids('yes'), no = tok.convert_tokens_to_ids('no')
const out = []
const t = process.hrtime.bigint()
const cpu0 = process.cpuUsage()
for (const p of prompts) {
  const { logits } = await model(tok(p))
  const [, n, v] = logits.dims
  const y = logits.data[(n - 1) * v + yes], o = logits.data[(n - 1) * v + no]
  out.push(1 / (1 + Math.exp(o - y)))
}
const c = process.cpuUsage(cpu0)
console.log(JSON.stringify({ scores: out, wall_ms_per_pair: Number(process.hrtime.bigint() - t) / 1e6 / prompts.length,
  cpu_ms_per_pair: (c.user + c.system) / 1000 / prompts.length, rss_mb_loaded: rssLoaded,
  rss_mb_end: process.memoryUsage().rss / 1e6 }))
