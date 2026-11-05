/**
 * The object-storage disks wired into `config/drive.ts`.
 *
 * `fs`  — local filesystem, the default for tests and docker-less dev.
 * `s3`  — S3-compatible (MinIO locally, real S3/R2/Spaces in prod).
 *
 * `DRIVE_DISK` (see `start/env.ts`) picks the active disk.
 */
export const DRIVE_DISKS = ['fs', 's3'] as const

export type DriveDisk = (typeof DRIVE_DISKS)[number]
