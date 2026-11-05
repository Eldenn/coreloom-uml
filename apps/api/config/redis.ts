import { defineConfig } from '@adonisjs/redis'
import env from '#start/env'

/**
 * Redis backs the BullMQ job queue (see `config/queue.ts`). A single `main`
 * connection is enough; `@nemoventures/adonis-jobs` shares it across queues
 * (`useSharedConnection: true`). `maxRetriesPerRequest: null` is required by
 * BullMQ for its blocking commands.
 */
const redisConfig = defineConfig({
  connection: 'main',

  connections: {
    main: {
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      password: env.get('REDIS_PASSWORD', ''),
      db: 0,
      keyPrefix: '',
      retryStrategy(times) {
        return times > 10 ? null : times * 50
      },
      maxRetriesPerRequest: null,
    },
  },
})

export default redisConfig

declare module '@adonisjs/redis/types' {
  export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
