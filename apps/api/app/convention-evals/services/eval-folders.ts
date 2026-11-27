import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

/**
 * Where the runs of this worker keep their folders: `CONVENTION_EVALS_HOME` (a tmpfs in
 * production). Tests get a folder of their own whatever it says, since the purge below removes
 * every folder found there.
 */
export function evalsHome(): string {
  return app.inTest
    ? app.makePath('tmp/convention-evals-test')
    : (env.get('CONVENTION_EVALS_HOME') ?? app.makePath('tmp/convention-evals'))
}

/** A new private folder (0700) for one run. */
export async function createRunFolder(runId: number): Promise<string> {
  const home = evalsHome()
  await mkdir(home, { recursive: true, mode: 0o700 })
  return mkdtemp(join(home, `run-${String(runId)}-`))
}

export async function removeRunFolder(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/**
 * Removes every run folder left in the home: a worker that died mid-run left its folder there,
 * and only this worker's process uses the home. Run once per process, before its first run.
 */
export async function purgeRunFolders(): Promise<number> {
  const home = evalsHome()
  const entries = await readdir(home).catch(() => [] as string[])
  await Promise.all(entries.map((entry) => rm(join(home, entry), { recursive: true, force: true })))
  return entries.length
}

let purged: Promise<number> | null = null

/** `purgeRunFolders`, once in the life of this process: what the first run waits for. */
export function purgeRunFoldersOnce(): Promise<number> {
  purged ??= purgeRunFolders()
  return purged
}
