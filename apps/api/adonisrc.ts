import { indexEntities } from '@adonisjs/core'
import { defineConfig } from '@adonisjs/core/app'
import { generateRegistry } from '@tuyau/core/hooks'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Assembler hooks
  |--------------------------------------------------------------------------
  |
  | On `node ace serve` (and `pnpm dev`), these regenerate the Tuyau typed
  | API client that `apps/web` consumes via the `@coreloom-uml/api` package
  | `exports`:
  |   - `indexEntities` writes `.adonisjs/client/manifest.d.ts` (referenced by
  |     the generated registry to pull controller + response types into scope).
  |   - `generateRegistry` writes `.adonisjs/client/registry/*` from the scanned
  |     routes, their Vine input validators, and the controller return types.
  */
  hooks: {
    init: [indexEntities({ manifest: { enabled: true } }), generateRegistry()],
  },

  /*
  |--------------------------------------------------------------------------
  | Ace commands
  |--------------------------------------------------------------------------
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/mail/commands'),
    () => import('@nemoventures/adonis-jobs/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/limiter/limiter_provider'),
    () => import('@adonisjs/session/session_provider'),
    () => import('@adonisjs/shield/shield_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@adonisjs/mail/mail_provider'),
    () => import('@adonisjs/drive/drive_provider'),
    () => import('@adonisjs/redis/redis_provider'),
    () => import('@nemoventures/adonis-jobs/queue_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads — loaded before the HTTP server starts
  |--------------------------------------------------------------------------
  */
  preloads: [
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/mail'),
    () => import('#start/skills'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Directories
  |--------------------------------------------------------------------------
  |
  | `jobs` is where `node ace make:job` writes and where the queue worker
  | discovers job classes (@nemoventures/adonis-jobs).
  */
  directories: {
    jobs: 'app/jobs',
  },

  /*
  |--------------------------------------------------------------------------
  | Test suites (Japa)
  |--------------------------------------------------------------------------
  */
  tests: {
    suites: [
      {
        name: 'functional',
        files: ['tests/functional/**/*.spec.{ts,js}'],
        timeout: 30000,
      },
      {
        name: 'unit',
        files: ['tests/unit/**/*.spec.{ts,js}'],
        timeout: 5000,
      },
    ],
  },
})
