import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The graders as a trial's sandbox runs them (`GRADE`): the catalog's TypeScript source (its
 * `src` and `evals`, without their tests) and zod, the one package it imports, laid out as a
 * workspace would hold them. Node runs them from source there, so nothing is built for it.
 */

/** The catalog package's folder, wherever the app's install puts it. */
export function catalogRoot(): string {
  // `…/packages/catalog/evals/src/index.ts`
  return dirname(
    dirname(dirname(fileURLToPath(import.meta.resolve('@coreloom-uml/catalog/evals')))),
  )
}

function zodRoot(catalog: string): string {
  return dirname(createRequire(join(catalog, 'package.json')).resolve('zod/package.json'))
}

const isTest = (path: string) => /\.test\.ts$/.test(path)
const isTypeOrMap = (path: string) => /\.(d\.[cm]?ts|map)$/.test(path)

/** Runs `tar` without a shell; rejects unless it exits 0. */
export function tar(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { stdio: 'ignore', shell: false })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited ${String(code)}`)),
    )
  })
}

/** Packs `entries` of `folder` into a gzipped tarball and answers its bytes. */
export async function packFolder(folder: string, entries: readonly string[]): Promise<Buffer> {
  const archive = `${folder}.tgz`
  try {
    await tar(['-czf', archive, '-C', folder, '--', ...entries])
    return await readFile(archive)
  } finally {
    await rm(archive, { force: true })
  }
}

/** Builds the graders' tarball under `dir` (a run's folder) and answers its bytes. */
export async function buildGraderArchive(dir: string): Promise<Buffer> {
  const catalog = catalogRoot()
  const stage = join(dir, 'grader')
  const target = join(stage, 'packages', 'catalog')
  await mkdir(target, { recursive: true })
  await cp(join(catalog, 'package.json'), join(target, 'package.json'))
  for (const folder of ['src', 'evals']) {
    await cp(join(catalog, folder), join(target, folder), {
      recursive: true,
      filter: (source) => !isTest(source),
    })
  }
  const zod = zodRoot(catalog)
  await cp(zod, join(stage, 'node_modules', 'zod'), {
    recursive: true,
    dereference: true,
    filter: (source) => !isTypeOrMap(source) && source !== join(zod, 'src'),
  })
  try {
    return await packFolder(stage, ['packages', 'node_modules'])
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
