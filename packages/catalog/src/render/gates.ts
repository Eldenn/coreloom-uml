import type { Recommendation } from '../targets/types.ts'
import { Target } from '../targets.ts'
import { CLI_CHECK_VERSION } from '../version.ts'
import { HASH_MARKERS, hashManagedBlock, wrapManagedBlock } from './managed-block.ts'

/**
 * The gates that hold whatever tool wrote the change: Git hooks and a CI workflow. Unlike a
 * tool's settings they need no cooperation from the assistant, so they also cover the tools that
 * enforce nothing by themselves.
 */

/** A tracked folder, so the hooks are shared; Git only reads it once `core.hooksPath` names it. */
export const HOOKS_DIRECTORY = '.githooks'
export const PRE_COMMIT_HOOK = `${HOOKS_DIRECTORY}/pre-commit`
export const COMMIT_MSG_HOOK = `${HOOKS_DIRECTORY}/commit-msg`
export const HOOKS_PATH_COMMAND = `git config core.hooksPath ${HOOKS_DIRECTORY}`
export const CI_WORKFLOW_FILE = '.github/workflows/agent-conventions.yml'

/**
 * The first line of a hook file. It cannot sit inside the managed block (it must be the file's
 * first line, before the begin marker), so it is not rendered: whoever creates the file writes it
 * first, as the CLI does.
 */
export const HOOK_SHEBANG = '#!/bin/sh'

/**
 * Pinned by commit, as a tag can be moved. Checked 2026-11-12 against each repository's tag:
 * https://github.com/actions/checkout/releases/tag/v7.0.1
 * https://github.com/actions/setup-node/releases/tag/v7.1.0
 */
const CHECKOUT_ACTION = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1'
const SETUP_NODE_ACTION = 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0'

/**
 * The gitleaks binary (MIT), not `gitleaks/gitleaks-action`: read 2026-11-12, that action has had
 * its own licence since v2 and needs a `GITLEAKS_LICENSE` key for a repository owned by an
 * organization. The checksum is the one of `gitleaks_8.30.1_checksums.txt` in the release.
 * https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1
 */
const GITLEAKS_VERSION = '8.30.1'
const GITLEAKS_ARCHIVE = `gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz`
const GITLEAKS_SHA256 = '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'

/** What installs the dependencies from the lockfile, for the package managers Node.js 22 brings. */
const INSTALL_STEPS: Partial<Record<string, string[]>> = {
  npm: ['npm ci'],
  pnpm: ['corepack enable', 'pnpm install --frozen-lockfile'],
  yarn: ['corepack enable', 'yarn install --frozen-lockfile'],
}

/**
 * The assistants a commit message may not credit when attribution is refused, as they sign
 * (a product name, or the address of their trailer). Never a bare first name such as Claude,
 * Jules or Devin: a person may be called that.
 */
const ASSISTANTS =
  'claude code|anthropic|copilot|cursor|codex|chatgpt|openai|gemini|aider|devin-ai|windsurf|codeium|amazon q|google-labs-jules|opencode'

export type GatesInput = {
  /** `tooling.checks`, already split and filtered by `splitCommands`: plain words only. */
  checks: readonly string[]
  /** `tooling.package-manager`, when it is one of the offered ones. */
  packageManager: string | null
  /** The dependency-cruiser command, when its file is rendered. */
  boundariesCommand: string | null
  /** `git.commit-messages` is `conventional`. */
  conventionalCommits: boolean
  /** `git.attribution` is 4 or 5: a commit never credits the assistant. */
  noAttribution: boolean
  /** Secrets are never committed (`git.never-commit`) or never handled (`security.secrets`). */
  secretScan: boolean
  /** `git.ci-workflow` is `github-actions`: the workflow is asked for. Off without an answer. */
  ciWorkflow: boolean
}

export type GateFile = { path: string; content: string; blockHash: string }

/** A YAML single-quoted scalar: nothing in it is special but the quote itself. */
export function yamlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function toFile(path: string, lines: string[]): GateFile {
  const block = wrapManagedBlock(lines.join('\n'), HASH_MARKERS)
  return { path, content: `${block}\n`, blockHash: hashManagedBlock(block) }
}

const HOOK_HEADER = [
  '# From the agent conventions (Coreloom UML). It applies to every commit, whoever writes it.',
  `# Git runs it once the hooks are turned on: ${HOOKS_PATH_COMMAND}`,
  `# The file must start with ${HOOK_SHEBANG} and be executable; the CLI sees to both.`,
]

/** Runs the checks, then the dependency rules; the first failure stops the commit. */
function preCommit(commands: readonly string[]): GateFile | null {
  if (commands.length === 0) return null
  return toFile(PRE_COMMIT_HOOK, [
    ...HOOK_HEADER,
    '# Steps of your own go before or after this block.',
    ...commands.map((command) => `${command} || exit 1`),
  ])
}

function commitMsg(input: GatesInput): GateFile | null {
  if (!input.conventionalCommits && !input.noAttribution) return null
  const lines = [
    ...HOOK_HEADER,
    '# Comment lines, and the diff of `git commit -v`, are not part of the message.',
    `coreloom_message=$(sed -e '/^# -* >8 -*$/,$d' -e '/^#/d' "$1")`,
  ]
  if (input.conventionalCommits) {
    lines.push(
      `coreloom_subject=$(printf '%s\\n' "$coreloom_message" | sed -n '/./{p;q;}')`,
      'case "$coreloom_subject" in',
      '  "Merge "* | "Revert "* | "fixup! "* | "squash! "* | "amend! "*) ;;',
      '  *)',
      `    if ! printf '%s\\n' "$coreloom_subject" | grep -Eq '^[a-z]+(\\([^()]+\\))?!?: .+'; then`,
      `      echo 'commit-msg: the subject must follow Conventional Commits, "type(scope): summary".' >&2`,
      '      exit 1',
      '    fi',
      '    ;;',
      'esac',
    )
  }
  if (input.noAttribution) {
    lines.push(
      `if printf '%s\\n' "$coreloom_message" | grep -Eiq '^co-authored-by:.*(${ASSISTANTS})|generated (with|by) .*(${ASSISTANTS})'; then`,
      `  echo 'commit-msg: the message must not credit a coding assistant (co-author trailer, "generated with" line).' >&2`,
      '  exit 1',
      'fi',
    )
  }
  return toFile(COMMIT_MSG_HOOK, lines)
}

function workflow(input: GatesInput, commands: readonly string[]): GateFile {
  const install = commands.length > 0 ? (INSTALL_STEPS[input.packageManager ?? ''] ?? null) : null
  const lines = [
    '# From the agent conventions (Coreloom UML). It applies to every change, whoever writes it.',
    '# The conventions check needs the committed .coreloom-uml.json and an API key with the read',
    '# ability, stored as the CORELOOM_UML_API_KEY secret; without the secret it is skipped with a',
    '# warning, and the other steps still run. Steps added after this block, at the same',
    '# indentation, are kept.',
    'name: Agent conventions',
    '',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main, master]',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  agent-conventions:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    `      - uses: ${CHECKOUT_ACTION}`,
    '        with:',
    '          persist-credentials: false',
    // The whole history, which is what the scan reads.
    ...(input.secretScan ? ['          fetch-depth: 0'] : []),
    `      - uses: ${SETUP_NODE_ACTION}`,
    '        with:',
    '          node-version: 22',
    // An `if` cannot read a secret, and only these two steps are given the key.
    '      - name: Look for the API key',
    '        id: key',
    '        env:',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax.
    '          CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}',
    '        run: |',
    '          if [ -n "$CORELOOM_UML_API_KEY" ]; then',
    '            echo "present=true" >> "$GITHUB_OUTPUT"',
    '          else',
    '            echo "::warning::The agent conventions check was skipped: the CORELOOM_UML_API_KEY secret is missing (a pull request from a fork, or a secret that is not configured)."',
    '          fi',
    '      - name: Check the agent conventions',
    "        if: steps.key.outputs.present == 'true'",
    `        run: npx @coreloom-uml/cli@${CLI_CHECK_VERSION} check`,
    '        env:',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax.
    '          CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}',
  ]
  if (input.secretScan) {
    lines.push(
      '      # The gitleaks binary, checked against its published checksum. It reads the whole',
      '      # history: list a finding that is not a secret in .gitleaksignore.',
      '      - name: Scan for secrets',
      '        run: |',
      `          curl -fsSLo "$RUNNER_TEMP/gitleaks.tar.gz" https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${GITLEAKS_ARCHIVE}`,
      `          echo "${GITLEAKS_SHA256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -`,
      '          tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks',
      '          "$RUNNER_TEMP/gitleaks" git --redact --no-banner .',
    )
  }
  if (commands.length > 0 && !install) {
    lines.push(
      '      # No install step: the package manager is not one this workflow knows how to set up.',
    )
  }
  for (const command of [...(install ?? []), ...commands]) {
    lines.push(`      - run: ${yamlString(command)}`)
  }
  return toFile(CI_WORKFLOW_FILE, lines)
}

/**
 * The hooks and the workflow the answers call for. A hook is rendered only when it has something
 * to check, and the workflow only when it is asked for: it runs in the owner's CI.
 * Only commands `splitCommands` kept go into a script, and no other text from an answer does.
 */
export function renderGates(input: GatesInput): {
  files: GateFile[]
  recommendations: Recommendation[]
} {
  const commands = [...input.checks, ...(input.boundariesCommand ? [input.boundariesCommand] : [])]
  const hooks = [preCommit(commands), commitMsg(input)].filter((file) => file !== null)
  const recommendations: Recommendation[] = []
  if (hooks.length > 0) {
    recommendations.push({
      target: Target.Generic,
      title: 'Turn the Git hooks on',
      body: `The hooks in \`${HOOKS_DIRECTORY}/\` only run once Git is told to read that folder, in each clone:\n\n\`\`\`sh\n${HOOKS_PATH_COMMAND}\n\`\`\`\n\nNothing sets it for you. If another tool already owns the hooks path (Husky, for instance), call the scripts from its hooks instead (\`sh ${COMMIT_MSG_HOOK} "$1"\`). Each file must be executable and start with \`${HOOK_SHEBANG}\`: the CLI does both when it creates one.`,
    })
  }
  recommendations.push({
    target: Target.Generic,
    title: 'Check the conventions in CI',
    body: input.ciWorkflow
      ? `\`${CI_WORKFLOW_FILE}\` fails a build when the conventions in the repository are not the latest generation or were edited by hand, then runs your checks. Commit it with \`.coreloom-uml.json\`, and store an API key with the \`read\` ability as the \`CORELOOM_UML_API_KEY\` repository secret; without the secret that check is skipped with a warning.`
      : `To fail a build when the conventions in the repository are not the latest generation or were edited by hand, run \`npx @coreloom-uml/cli@${CLI_CHECK_VERSION} check\` in your CI with the \`CORELOOM_UML_API_KEY\` secret, or ask for the generated GitHub Actions workflow in the Git workflow questionnaire.`,
  })
  const files = input.ciWorkflow ? [...hooks, workflow(input, commands)] : hooks
  return { files, recommendations }
}
