import { RedisCheck, RedisMemoryUsageCheck } from '@adonisjs/redis'
import { defineConfig } from '@nemoventures/adonis-jobs'
import { CODE_MAPS_QUEUE } from '#app/code-maps/constants/code-map'
import { SKILL_SCANS_QUEUE } from '#app/skills/constants/skill-scan'
import { SKILL_TOPICS_QUEUE } from '#app/skills/constants/skill-topics'

const queueConfig = defineConfig({
  /**
   * The default connection to use. The connection
   * should be defined in the "config/redis.ts" file.
   */
  connection: { connectionName: 'main' },

  /**
   * When enabled, all queues will use the same Redis connection instance.
   * This is the recommended setting for most applications.
   */
  useSharedConnection: true,

  /**
   * Health check configuration for your workers.
   */
  healthCheck: {
    enabled: true,
    endpoint: '/internal/healthz',
    checks: ({ connection }) => [
      new RedisCheck(connection),
      new RedisMemoryUsageCheck(connection).warnWhenExceeds('100MB').failWhenExceeds('200MB'),
    ],
  },

  /**
   * Workers metrics configuration. @julr/adonisjs-prometheus needs to be installed
   * to use this feature.
   */
  // metrics: {
  //   enabled: false,
  //   endpoint: '/internal/metrics',
  // },

  /**
   * OpenTelemetry configuration
   */
  // otel: {
  //   /**
  //    * Additional default attributes for the span created within each job.
  //    * Internally, we already add an attribute 'bullmq.job.name' with the job name.
  //    */
  //   defaultJobAttributes: (jobInstance) => ({
  //     ['apm.root_name']: jobInstance.job.name,
  //   }),
  // },

  /**
   * The name of the queue to use when no queue is explicitly specified
   * during job dispatching.
   */
  defaultQueue: 'default',

  /**
   * Configure your queues here. Each queue can have its own connection,
   * worker options, and job options
   */
  queues: {
    /**
     * The default queue for processing jobs
     */
    default: {},

    /**
     * GitHub code map extractions (`ImportGithubCodeMapJob`): one at a time across workers.
     * Each runs in a sandbox of its own, so this may be raised when imports queue up.
     */
    [CODE_MAPS_QUEUE]: { globalConcurrency: 1 },

    /**
     * Scans of the skills' copies with SkillSpector (`ScanSkillVersionJob`): listened to by the
     * `skill-scanner` worker only (`queue:work --queues=skill-scans`), the one image holding the
     * binary. Every other worker names its queues without this one (`queue:work` script, the
     * `queue-worker` services). One scan at a time.
     */
    [SKILL_SCANS_QUEUE]: { globalConcurrency: 1 },

    /**
     * The skill tagger (`ClassifySkillTopicsJob`): listened to by the `skill-tagger` worker only
     * (`queue:work --queues=skill-topics`), the one image that can load the embedding model. One
     * run at a time.
     */
    [SKILL_TOPICS_QUEUE]: { globalConcurrency: 1 },

    /**
     * Example of a queue with specific connection and options
     */
    // priority: {
    //   connection: { connectionName: 'priority' },
    //   globalConcurrency: 5,
    // },
  },
})

export default queueConfig

declare module '@nemoventures/adonis-jobs/types' {
  interface Queues extends InferQueues<typeof queueConfig> {}
}
