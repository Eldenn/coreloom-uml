/**
 * The E2B template the harness's trials start from (path II): the install's `base` template
 * (Debian, git) plus Node.js and pnpm at the versions the API's image runs, and slugify in pnpm's
 * store and metadata cache, since a trial has no network and the package-manager task adds it.
 * Node runs the graders from TypeScript source (type stripping, Node 22.18 and later). Nothing of
 * ours is in it: no key, no file of the repository. `node ace assistant:setup` builds it when the
 * install does not hold it yet; after any change here, raise `revision`.
 */
export const EVAL_TEMPLATE = {
  from: 'base',
  node: {
    version: '26.3.0',
    /** From https://nodejs.org/dist/v26.3.0/SHASUMS256.txt, for `node-v26.3.0-linux-x64.tar.xz`. */
    sha256: '0ce210831380ab75a5fec0d3fb6b5af0958898016b2cae51cc2fa11057d2f77e',
  },
  pnpm: '11.5.2',
  /** What the package-manager task installs, cached at build time. */
  cachedPackages: ['slugify@1.6.6'],
  /** The trial's Git identity: a machine a developer works on has one. */
  gitUser: { name: 'Trial', email: 'trial@example.com' },
  cpuCount: 2,
  memoryMB: 1024,
  revision: 1,
} as const

export const EVAL_TEMPLATE_NAME = `coreloom-uml-convention-evals-r${String(EVAL_TEMPLATE.revision)}`

/** The build steps, as the root user of the template; tested for their pins only. */
export function evalTemplateCommands(): string[] {
  const { version, sha256 } = EVAL_TEMPLATE.node
  const archive = `node-v${version}-linux-x64.tar.xz`
  return [
    `curl -fsSL -o /tmp/${archive} https://nodejs.org/dist/v${version}/${archive}`,
    `echo "${sha256}  /tmp/${archive}" | sha256sum -c -`,
    `tar -xJf /tmp/${archive} -C /usr/local --strip-components=1 --no-same-owner`,
    `rm -f /tmp/${archive}`,
    `npm install -g pnpm@${EVAL_TEMPLATE.pnpm}`,
  ]
}

/** The build steps as the trial's user: its Git identity and pnpm's offline cache. */
export function evalTemplateUserCommands(): string[] {
  const { name, email } = EVAL_TEMPLATE.gitUser
  return [
    `git config --global user.name "${name}"`,
    `git config --global user.email "${email}"`,
    'git config --global init.defaultBranch main',
    `mkdir -p /tmp/seed && cd /tmp/seed && pnpm init >/dev/null && pnpm add ${EVAL_TEMPLATE.cachedPackages.join(' ')} && cd / && rm -rf /tmp/seed`,
    'pnpm config set prefer-offline true --location=global',
    'npm config set prefer-offline true',
  ]
}

/** Where a trial lives in its sandbox, and what is uploaded there. */
export const EVAL_SANDBOX_PATHS = {
  trialRoot: '/home/user/trial',
  trialArchive: '/tmp/coreloom-trial.tgz',
  graderRoot: '/opt/coreloom-grader',
  graderArchive: '/tmp/coreloom-grader.tgz',
} as const
