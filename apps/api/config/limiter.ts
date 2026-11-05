import { defineConfig, stores } from '@adonisjs/limiter'
import env from '#start/env'

const limiterConfig = defineConfig({
  // Defaults to in-memory — no Redis needed for the MVP. Set LIMITER_STORE
  // to a shared store before running more than one API instance.
  default: env.get('LIMITER_STORE', 'memory'),

  stores: {
    memory: stores.memory({}),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}
