import { defineConfig, targets } from '@adonisjs/core/logger'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

const loggerConfig = defineConfig({
  default: 'app',
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME', 'coreloom-uml-api'),
      level: env.get('LOG_LEVEL', 'info'),
      // A provider key travels in request bodies (rule proposals, connection test): should one
      // ever reach a log line, it is censored. The code never logs it on purpose.
      redact: {
        paths: [
          'apiKey',
          '*.apiKey',
          '*.*.apiKey',
          'headers.authorization',
          '*.headers.authorization',
        ],
        censor: '[redacted]',
      },
      transport: {
        targets: targets()
          .pushIf(!app.inProduction, targets.pretty())
          .pushIf(app.inProduction, targets.file({ destination: 1 }))
          .toArray(),
      },
    },
  },
})

export default loggerConfig

declare module '@adonisjs/core/types' {
  interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
