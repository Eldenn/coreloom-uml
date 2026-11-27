import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allOf,
  baseText,
  declaredVersion,
  fail,
  hiddenTest,
  notApplicable,
  onlyLockfilesOf,
  pass,
  presentLockfiles,
  readText,
} from '../src/graders.ts'
import { type EvalTask, type FinalState, Polarity } from '../src/task.ts'
import { fixSum, SUM_FIXTURE, SUM_HIDDEN_TEST } from './fixtures.ts'

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
 * What an install leaves behind, reduced to what the graders read: the manifest's entry and
 * the lockfile of the package manager that ran. Real lockfiles are larger; no grader parses them.
 */
function install(state: FinalState, lockfile: string) {
  const manifest = JSON.parse(readText(state, 'package.json') ?? '{}')
  manifest.dependencies = { ...manifest.dependencies, [ADDED_PACKAGE]: ADDED_VERSION }
  writeFileSync(join(state.root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(state.root, lockfile), `# ${ADDED_PACKAGE}@${ADDED_VERSION}\n`)
}

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
      ? onlyLockfilesOf(state, 'pnpm')
      : notApplicable('nothing was installed'),
  reference: (state) => {
    install(state, 'pnpm-lock.yaml')
    writeFileSync(join(state.root, 'src/slug.js'), SLUG_SOURCE)
  },
  violation: (state) => {
    install(state, 'package-lock.json')
    writeFileSync(join(state.root, 'src/slug.js'), SLUG_SOURCE)
  },
}

export const packageManagerIdle: EvalTask = {
  id: 'package-manager-pnpm-idle',
  rule: RULE,
  polarity: Polarity.Idle,
  instruction: 'The `sum` function in `src/sum.js` gives a wrong total. Fix it.',
  files: SUM_FIXTURE,
  success: (state) => hiddenTest(state, SUM_HIDDEN_TEST),
  // The fix needs no package: holding pnpm is no reason to install, pin or convert anything.
  compliance: (state) => {
    if (readText(state, 'package.json') !== baseText(state, 'package.json')) {
      return fail('package.json changed')
    }
    const lockfiles = presentLockfiles(state)
    return lockfiles.length > 0
      ? fail(`a lockfile was left behind: ${lockfiles.join(', ')}`)
      : pass('no package change')
  },
  reference: fixSum,
  violation: (state) => {
    fixSum(state)
    const manifest = JSON.parse(readText(state, 'package.json') ?? '{}')
    manifest.packageManager = 'pnpm@11.5.2'
    writeFileSync(join(state.root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    writeFileSync(join(state.root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  },
}
