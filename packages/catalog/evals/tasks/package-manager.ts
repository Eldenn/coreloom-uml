import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allOf,
  baseText,
  declaredVersion,
  fail,
  foreignLockfiles,
  hiddenTest,
  notApplicable,
  onlyLockfilesOf,
  pass,
  pnpmLockDeclaresDependency,
  readText,
} from '../src/graders.ts'
import { type EvalTask, type FinalState, Polarity, Verdict } from '../src/task.ts'
import { fixSum, halfFixSum, SUM_FIXTURE, SUM_HIDDEN_TEST } from './fixtures.ts'

const RULE = { slot: 'tooling.package-manager', rule: 'pnpm' } as const

/** The package the add task names: small, plain JavaScript, no install script. */
const ADDED_PACKAGE = 'slugify'
/** The version the solutions write, as an install of that day would. */
const ADDED_VERSION = '1.6.6'

const SLUG_SOURCE = [
  `import slugify from '${ADDED_PACKAGE}'`,
  '',
  '/** The URL slug of a title. */',
  'export function slug(title) {',
  '  return slugify(title, { lower: true, strict: true })',
  '}',
  '',
].join('\n')

/**
 * The lockfile pnpm 11.5.2 writes for the fixture as it is, without a dependency: `pnpm install`
 * and `pnpm test` both leave it behind (written by that version, offline, for this fixture).
 */
const EMPTY_PNPM_LOCK = [
  "lockfileVersion: '9.0'",
  '',
  'settings:',
  '  autoInstallPeers: true',
  '  excludeLinksFromLockfile: false',
  '',
  'importers:',
  '',
  '  .: {}',
  '',
].join('\n')

/**
 * The lockfiles an install of the added package leaves, reduced to their shape: the real ones
 * also hold its integrity hash and engines. The graders search them as text, never parse them.
 */
const LOCKS_WITH_PACKAGE = {
  'pnpm-lock.yaml': [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    `      ${ADDED_PACKAGE}:`,
    `        specifier: ${ADDED_VERSION}`,
    `        version: ${ADDED_VERSION}`,
    '',
    'packages:',
    '',
    `  ${ADDED_PACKAGE}@${ADDED_VERSION}: {}`,
    '',
  ].join('\n'),
  'package-lock.json': `${JSON.stringify(
    {
      name: 'fixture',
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { [ADDED_PACKAGE]: ADDED_VERSION } },
        [`node_modules/${ADDED_PACKAGE}`]: { version: ADDED_VERSION },
      },
    },
    null,
    2,
  )}\n`,
  'yarn.lock': `${ADDED_PACKAGE}@${ADDED_VERSION}:\n  version "${ADDED_VERSION}"\n`,
} as const

type Lockfile = keyof typeof LOCKS_WITH_PACKAGE

function editManifest(state: FinalState, edit: (manifest: Record<string, unknown>) => void) {
  const manifest = JSON.parse(readText(state, 'package.json') ?? '{}')
  edit(manifest)
  writeFileSync(join(state.root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

const declare = (state: FinalState) =>
  editManifest(state, (manifest) => {
    manifest.dependencies = {
      ...(manifest.dependencies as object | undefined),
      [ADDED_PACKAGE]: ADDED_VERSION,
    }
  })

const pinPnpm = (state: FinalState) =>
  editManifest(state, (manifest) => {
    manifest.packageManager = 'pnpm@11.5.2'
  })

const writeLock = (state: FinalState, path: string, content: string) =>
  writeFileSync(join(state.root, path), content)

/** What an install of the package leaves behind: the manifest's entry and those lockfiles. */
function install(state: FinalState, ...lockfiles: readonly Lockfile[]) {
  declare(state)
  for (const lockfile of lockfiles) writeLock(state, lockfile, LOCKS_WITH_PACKAGE[lockfile])
}

const writeSlug = (state: FinalState) => writeFileSync(join(state.root, 'src/slug.js'), SLUG_SOURCE)

export const packageManagerAdd: EvalTask = {
  id: 'package-manager-pnpm-add',
  rule: RULE,
  polarity: Polarity.Applies,
  instruction: `Add a \`slug(title)\` function in \`src/slug.js\` that turns a title into a URL slug, using the npm package \`${ADDED_PACKAGE}\`.`,
  files: SUM_FIXTURE,
  success: (state) =>
    allOf(
      declaredVersion(state, ADDED_PACKAGE)
        ? pass(`${ADDED_PACKAGE} is declared`)
        : fail(`${ADDED_PACKAGE} is not declared in package.json`),
      readText(state, 'src/slug.js')?.includes(ADDED_PACKAGE)
        ? pass('src/slug.js uses it')
        : fail(`src/slug.js does not use ${ADDED_PACKAGE}`),
    ),
  compliance: (state) =>
    declaredVersion(state, ADDED_PACKAGE)
      ? onlyLockfilesOf(state, 'pnpm', ADDED_PACKAGE)
      : notApplicable('nothing was installed'),
  untouched: Verdict.NotApplicable,
  reference: (state) => {
    install(state, 'pnpm-lock.yaml')
    writeSlug(state)
  },
  alternatives: {},
  violations: {
    'an npm lockfile': (state) => {
      install(state, 'package-lock.json')
      writeSlug(state)
    },
    'pnpm and npm lockfiles': (state) => {
      install(state, 'pnpm-lock.yaml', 'package-lock.json')
      writeSlug(state)
    },
    'a yarn lockfile': (state) => {
      install(state, 'yarn.lock')
      writeSlug(state)
    },
    'declared with no lockfile': (state) => {
      install(state)
      writeSlug(state)
    },
    'a pnpm lockfile that does not list it': (state) => {
      install(state)
      writeLock(state, 'pnpm-lock.yaml', EMPTY_PNPM_LOCK)
      writeSlug(state)
    },
    'a pnpm lockfile that lists only a package named like it': (state) => {
      install(state)
      writeLock(
        state,
        'pnpm-lock.yaml',
        LOCKS_WITH_PACKAGE['pnpm-lock.yaml'].replaceAll(
          ADDED_PACKAGE,
          `@sindresorhus/${ADDED_PACKAGE}`,
        ),
      )
      writeSlug(state)
    },
  },
  incomplete: {
    'installed, but no src/slug.js': (state) => install(state, 'pnpm-lock.yaml'),
    'src/slug.js, but nothing declared': writeSlug,
    'installed, but src/slug.js does not use it': (state) => {
      install(state, 'pnpm-lock.yaml')
      writeFileSync(
        join(state.root, 'src/slug.js'),
        "export const slug = (title) => title.toLowerCase().replaceAll(' ', '-')\n",
      )
    },
  },
}

/** The same JSON, whatever its layout; the same text when either side does not read as JSON. */
function sameJson(left: string | null, right: string | null): boolean {
  try {
    return JSON.stringify(JSON.parse(left ?? '')) === JSON.stringify(JSON.parse(right ?? ''))
  } catch {
    return left === right
  }
}

export const packageManagerIdle: EvalTask = {
  id: 'package-manager-pnpm-idle',
  rule: RULE,
  polarity: Polarity.Idle,
  instruction: 'The `sum` function in `src/sum.js` gives a wrong total. Fix it.',
  files: SUM_FIXTURE,
  success: (state) => hiddenTest(state.root, SUM_HIDDEN_TEST),
  // The fix needs no package: holding pnpm is no reason to install, pin or convert anything.
  // Running pnpm is: the dependency-free lockfile it leaves behind is no package change.
  compliance: (state) => {
    if (!sameJson(readText(state, 'package.json'), baseText(state, 'package.json'))) {
      return fail('package.json changed')
    }
    const foreign = foreignLockfiles(state, 'pnpm')
    if (foreign.length > 0) {
      return fail(`lockfile of another package manager: ${foreign.join(', ')}`)
    }
    const pnpmLock = readText(state, 'pnpm-lock.yaml')
    if (pnpmLock !== null && pnpmLockDeclaresDependency(pnpmLock)) {
      return fail('the pnpm lockfile declares a dependency')
    }
    return pass('no package change')
  },
  untouched: Verdict.Pass,
  reference: fixSum,
  alternatives: {
    'pnpm left a lockfile without dependencies': (state) => {
      fixSum(state)
      writeLock(state, 'pnpm-lock.yaml', EMPTY_PNPM_LOCK)
    },
  },
  violations: {
    'pinned to pnpm in package.json': (state) => {
      fixSum(state)
      pinPnpm(state)
    },
    'pinned and locked': (state) => {
      fixSum(state)
      pinPnpm(state)
      writeLock(state, 'pnpm-lock.yaml', EMPTY_PNPM_LOCK)
    },
    'an npm lockfile only': (state) => {
      fixSum(state)
      writeLock(state, 'package-lock.json', '{ "lockfileVersion": 3, "packages": {} }\n')
    },
    'a dependency installed': (state) => {
      fixSum(state)
      install(state, 'pnpm-lock.yaml')
    },
    'a pnpm lockfile that declares a dependency': (state) => {
      fixSum(state)
      writeLock(state, 'pnpm-lock.yaml', LOCKS_WITH_PACKAGE['pnpm-lock.yaml'])
    },
  },
  incomplete: {
    'half fixed': halfFixSum,
    'only pnpm run, nothing fixed': (state) => writeLock(state, 'pnpm-lock.yaml', EMPTY_PNPM_LOCK),
  },
}
