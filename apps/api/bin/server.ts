import 'reflect-metadata'
import { Ignitor, prettyPrintError } from '@adonisjs/core'
// OpenTelemetry. In production `bin/server.js` is started with
// `node --import ./instrumentation.js`, so the SDK is already running by the
// time this file executes and this import just picks up the live instance for
// the shutdown flush below. Under `node ace serve` (dev) there is no
// `--import`, so this is also where the SDK gets started — best-effort, and a
// no-op anyway unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
import { telemetry } from '../instrumentation.js'

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })
    app.terminating(async () => {
      await telemetry?.shutdown()
    })
    app.listen('SIGTERM', () => app.terminate())
    app.listen('SIGINT', () => app.terminate())
  })
  .httpServer()
  .start()
  .catch(prettyPrintError)
