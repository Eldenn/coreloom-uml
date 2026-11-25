import app from '@adonisjs/core/services/app'
import { SKILL_EMBEDDING_MODEL } from '#app/skills/constants/skill-topics'
import env from '#start/env'

type Loaded = {
  tokenizer: (
    texts: string[],
    options: Record<string, unknown>,
  ) => Record<string, unknown> & { attention_mask: unknown }
  model: ((inputs: Record<string, unknown>) => Promise<{
    last_hidden_state: { tolist(): number[][][] }
  }>) & { dispose(): Promise<unknown> }
}

/**
 * Reads texts into vectors with `SKILL_EMBEDDING_MODEL`, through transformers.js on the CPU
 * (onnxruntime). The model is pinned to a commit, downloaded on first use into
 * `SKILL_TAGGER_CACHE` and loaded once per run; `close()` frees it (about 1.5 GB). Each vector is
 * the last token's state, normalized, as Qwen3-Embedding is meant to be read.
 *
 * transformers.js loads onnxruntime's glibc binary, which Alpine cannot load: it is imported here
 * only, when a run starts, so the API and the other workers never load it. Only the
 * `skill-tagger` image (Debian) runs this. Resolved from the container: tests swap it for a fake.
 */
export default class SkillEmbedder {
  #loaded: Promise<Loaded> | null = null

  async embed(texts: string[]): Promise<number[][]> {
    const { tokenizer, model } = await this.#load()
    const prefix = `Instruct: ${SKILL_EMBEDDING_MODEL.instruction}\nQuery: `
    const inputs = tokenizer(
      texts.map((text) => prefix + text),
      { padding: true, truncation: true, max_length: 1024 },
    )
    const out = await model(inputs)
    return out.last_hidden_state.tolist().map((tokens) => normalize(tokens.at(-1) ?? []))
  }

  async close(): Promise<void> {
    const loaded = this.#loaded
    this.#loaded = null
    if (loaded) await (await loaded).model.dispose()
  }

  #load(): Promise<Loaded> {
    this.#loaded ??= (async () => {
      const transformers = await import('@huggingface/transformers')
      transformers.env.cacheDir = env.get('SKILL_TAGGER_CACHE') ?? app.tmpPath('skill-tagger')
      const options = { revision: SKILL_EMBEDDING_MODEL.revision }
      const tokenizer = await transformers.AutoTokenizer.from_pretrained(
        SKILL_EMBEDDING_MODEL.id,
        options,
      )
      // The last token is read: padding goes on the left so it is always the text's own.
      tokenizer.padding_side = 'left'
      const model = await transformers.AutoModel.from_pretrained(SKILL_EMBEDDING_MODEL.id, {
        ...options,
        dtype: SKILL_EMBEDDING_MODEL.dtype,
        device: 'cpu',
      })
      return { tokenizer, model } as unknown as Loaded
    })()
    return this.#loaded
  }
}

function normalize(vector: number[]): number[] {
  const norm = Math.hypot(...vector) || 1
  return vector.map((value) => value / norm)
}
