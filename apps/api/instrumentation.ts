/*
|--------------------------------------------------------------------------
| OpenTelemetry instrumentation (SigNoz)
|--------------------------------------------------------------------------
|
| Imported as the very first thing in `bin/server.ts`, before `@adonisjs/core`
| and any instrumented library, so the auto-instrumentations can patch `http`,
| `pg`, `pino`, etc. as they load.
|
| It is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so local dev, the
| test suite and CI are unaffected. Point that variable at a SigNoz OTLP
| endpoint to turn tracing on:
|
|   - self-hosted collector:  OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-otel-collector:4318
|   - SigNoz Cloud:           OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.<region>.signoz.cloud:443
|                             OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>
|
| `OTEL_SERVICE_NAME` names the service in SigNoz (defaults to APP_NAME, then
| "coreloom-uml-api"). All other knobs are the standard OTEL_* environment
| variables read directly by the SDK — they are deliberately not routed
| through `start/env.ts`, which loads later than this file.
|
| `bin/server.ts` flushes pending spans on shutdown via `app.terminating()`.
*/
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

function startTelemetry(): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  if (!endpoint) {
    console.info('[otel] OTEL_EXPORTER_OTLP_ENDPOINT is not set — tracing disabled')
    return null
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? process.env.APP_NAME ?? 'coreloom-uml-api'

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem spans are pure noise for a web service.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  })

  sdk.start()
  console.info(`[otel] tracing enabled — exporting "${serviceName}" spans to ${endpoint}`)

  return sdk
}

/**
 * The running SDK, or `null` when tracing is disabled. `bin/server.ts` awaits
 * `telemetry?.shutdown()` from `app.terminating()` to flush spans on exit.
 */
export const telemetry = startTelemetry()
