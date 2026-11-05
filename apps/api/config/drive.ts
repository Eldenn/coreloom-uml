import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'
import env from '#start/env'

/**
 * Object storage for @adonisjs/drive. The active disk is `DRIVE_DISK`
 * (defaults to `s3`); see `start/env.ts` for the S3_* variables.
 */
const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK', 's3'),

  services: {
    /**
     * Local filesystem — the zero-config default for the test suite and for
     * dev without Docker. Writes under `tmp/uploads`.
     */
    fs: services.fs({
      location: app.tmpPath('uploads'),
      visibility: 'private',
    }),

    /**
     * S3-compatible object storage. `forcePathStyle` + an explicit `endpoint`
     * make it work against the local MinIO container (infra/docker-compose.yml);
     * point `S3_ENDPOINT` / credentials at a real bucket for S3 / R2 / Spaces in
     * production. `S3_PUBLIC_URL` is an optional CDN / public base URL.
     */
    s3: services.s3({
      endpoint: env.get('S3_ENDPOINT'),
      region: env.get('S3_REGION'),
      bucket: env.get('S3_BUCKET', ''),
      credentials: {
        accessKeyId: env.get('S3_ACCESS_KEY_ID', ''),
        secretAccessKey: env.get('S3_SECRET_ACCESS_KEY', ''),
      },
      forcePathStyle: true,
      cdnUrl: env.get('S3_PUBLIC_URL'),
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
