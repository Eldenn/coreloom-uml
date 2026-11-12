// biome-ignore-all lint/suspicious/noTemplateCurlyInString: shell and devcontainer.json variables.
import { TARGET_TEMPLATES } from '../targets/index.ts'
import type { Recommendation } from '../targets/types.ts'
import { TARGETS, Target } from '../targets.ts'
import { HASH_MARKERS, wrapManagedBlock } from './managed-block.ts'

/**
 * The sandboxed development container: the one frame that holds whatever the coding tool is,
 * since a tool's own permission settings are not a security boundary and some tools have none.
 * Rendered only when the owner asks for it (`security.sandbox` = `container`).
 *
 * Verified 2026-11-12 against `SANDBOX_SOURCES`, and by starting the container: the image's
 * `node` user may run anything as root (`/etc/sudoers.d/node`), which the firewall script takes
 * away once the rules are in place, and its global npm folder is writable without root. The
 * approach is the one of the reference container for Claude Code (capabilities for the firewall,
 * an allowlist kept in an ipset, GitHub's ranges from its meta endpoint, a check at the end),
 * with these differences: no Dockerfile; DNS only to the container's resolvers; no SSH to
 * anywhere and no access to the host's network; IPv6 refused; rules replaced in one step so the
 * script can run again without opening the network; `.devcontainer` mounted read-only.
 *
 * The Dev Containers extension's settings (`dev.containers.*`, read from its 0.469.0 manifest)
 * have the `machine` scope; whether it honours them from `devcontainer.json` is not documented,
 * so the recommendation asks for them in the user settings too. Nothing in the file can stop
 * the extension from forwarding a running SSH agent.
 */
export const SANDBOX_SOURCES = [
  'https://containers.dev/implementors/json_reference/',
  'https://github.com/anthropics/claude-code/tree/main/.devcontainer',
  'https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials',
  'https://docs.github.com/en/rest/meta/meta',
] as const

export const DEVCONTAINER_FILE = '.devcontainer/devcontainer.json'
export const FIREWALL_FILE = '.devcontainer/init-firewall.sh'

/** The official Node.js development container image: an exact tag, and the digest it had. */
const IMAGE =
  'mcr.microsoft.com/devcontainers/javascript-node:5.2.5-24-bookworm@sha256:1bc82e3350b0da52ca1a1b1b2e7527300bc6fdfd778287e0eed564203d66a68c'

/** The image's non-root user. */
const USER = 'node'

/** Where the firewall script is copied, out of the assistant's reach, and how it is run. */
const INSTALLED_SCRIPT = '/usr/local/sbin/init-firewall.sh'
const RUN_FIREWALL = `/usr/bin/bash ${INSTALLED_SCRIPT}`

const NPM_REGISTRY = 'registry.npmjs.org'
/** The registries a package manager installs from; any other answer installs from npm's. */
const REGISTRIES: Readonly<Record<string, readonly string[]>> = {
  yarn: [NPM_REGISTRY, 'registry.yarnpkg.com'],
}

export type SandboxInput = {
  targets: readonly Target[]
  /** The `tooling.package-manager` answer, if any. */
  packageManager?: string
  /** The `security.network` answer, if any. */
  network?: string
}

/**
 * The hosts the firewall lets through, by name: the tools' own, then the package registry unless
 * the assistant may never use the network. No answer opens the firewall: `open` gets the same
 * list as `registry`, and more hosts are added by hand in the script.
 */
export function sandboxHosts({ targets, packageManager, network }: SandboxInput) {
  const tools = sandboxTools(targets).flatMap((tool) => tool.hosts)
  const offline = network === 'none'
  const registries = offline ? [] : (REGISTRIES[packageManager ?? ''] ?? [NPM_REGISTRY])
  return { domains: [...new Set([...registries, ...tools])], github: !offline }
}

const sandboxTools = (targets: readonly Target[]) =>
  TARGETS.filter((target) => targets.includes(target)).flatMap((target) => {
    const tool = TARGET_TEMPLATES[target].sandbox
    return tool ? [{ ...tool, name: TARGET_TEMPLATES[target].name }] : []
  })

/**
 * `devcontainer.json`, as the JSON object the CLI merges into the file. The workspace is the
 * only folder of the host in the container, and `.devcontainer` is mounted over it read-only so
 * that nothing inside can prepare a weaker container for the next rebuild.
 */
function devcontainer(input: SandboxInput): string {
  const tools = sandboxTools(input.targets)
  const env = Object.assign({}, ...tools.map((tool) => tool.env ?? {})) as Record<string, string>
  const install = [
    'sudo apt-get update',
    'sudo apt-get install -y --no-install-recommends iptables ipset',
    `sudo install -o root -g root -m 0644 ${FIREWALL_FILE} ${INSTALLED_SCRIPT}`,
    ...(tools.length > 0
      ? [`npm install -g ${tools.map((tool) => `${tool.package}@${tool.version}`).join(' ')}`]
      : []),
  ]
  return JSON.stringify(
    {
      image: IMAGE,
      remoteUser: USER,
      runArgs: ['--cap-add=NET_ADMIN', '--cap-add=NET_RAW'],
      workspaceMount: 'source=${localWorkspaceFolder},target=/workspace,type=bind',
      workspaceFolder: '/workspace',
      mounts: [
        'source=${localWorkspaceFolder}/.devcontainer,target=/workspace/.devcontainer,type=bind,readonly',
      ],
      ...(Object.keys(env).length > 0 && { containerEnv: env }),
      postCreateCommand: install.join(' && '),
      postStartCommand: `sudo ${RUN_FIREWALL}`,
      waitFor: 'postStartCommand',
      customizations: {
        vscode: {
          settings: {
            'dev.containers.copyGitConfig': false,
            'dev.containers.gitCredentialHelperConfigLocation': 'none',
            'dev.containers.dockerCredentialHelper': false,
          },
        },
      },
    },
    null,
    2,
  )
}

/**
 * The firewall script, in a managed block. Only names from fixed lists go in, never an answer's
 * text. It has no `#!` line (the block's marker comes first): it is always run with bash.
 */
function firewall(input: SandboxInput): string {
  const { domains, github } = sandboxHosts(input)
  const body = `
# Firewall of the development container: outgoing traffic is refused, except DNS to the
# container's resolvers, the loopback interface and the hosts below. It runs as root each time
# the container starts, from the root-owned copy made when the container is created
# (${INSTALLED_SCRIPT}): rebuild the container after changing this file.
# To let more hosts through (the Coreloom UML API, a private registry), add a line ABOVE this
# block, where a pull leaves it alone:
#   EXTRA_ALLOWED_DOMAINS="uml.example.com registry.example.com"
set -euo pipefail

ALLOWED_DOMAINS="${domains.join(' ')}"
ALLOW_GITHUB=${github ? 1 : 0}
SANDBOX_USER=${USER}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "the firewall must be set up as root"

# The new list is built next to the one in use, and takes its place in one step: running this
# again (to refresh addresses that changed) never opens the network.
ipset create -exist allowed-hosts hash:net
ipset destroy allowed-hosts-next 2>/dev/null || true
ipset create allowed-hosts-next hash:net

for domain in $ALLOWED_DOMAINS \${EXTRA_ALLOWED_DOMAINS:-}; do
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || fail "not a host name: $domain"
  addresses=$(getent ahostsv4 "$domain" | awk '{ print $1 }' | sort -u || true)
  [ -n "$addresses" ] || fail "could not resolve $domain"
  for address in $addresses; do
    ipset add -exist allowed-hosts-next "$address"
  done
done

if [ "$ALLOW_GITHUB" = 1 ]; then
  ranges=$(curl -fsS --connect-timeout 10 https://api.github.com/meta |
    jq -r '(.web + .api + .git)[]' |
    grep -E '^[0-9]{1,3}(\\.[0-9]{1,3}){3}/[0-9]{1,2}$') ||
    fail "could not read GitHub's address ranges"
  for range in $ranges; do
    ipset add -exist allowed-hosts-next "$range"
  done
fi

ipset swap allowed-hosts-next allowed-hosts
ipset destroy allowed-hosts-next

resolvers=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2 }' /etc/resolv.conf)
{
  echo '*filter'
  echo ':INPUT DROP [0:0]'
  echo ':FORWARD DROP [0:0]'
  echo ':OUTPUT DROP [0:0]'
  echo '-A INPUT -i lo -j ACCEPT'
  echo '-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'
  echo '-A OUTPUT -o lo -j ACCEPT'
  echo '-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'
  for resolver in $resolvers; do
    echo "-A OUTPUT -d $resolver -p udp --dport 53 -j ACCEPT"
    echo "-A OUTPUT -d $resolver -p tcp --dport 53 -j ACCEPT"
  done
  echo '-A OUTPUT -m set --match-set allowed-hosts dst -j ACCEPT'
  echo '-A OUTPUT -j REJECT --reject-with icmp-admin-prohibited'
  echo 'COMMIT'
} | iptables-restore

if [ -e /proc/net/if_inet6 ]; then
  {
    echo '*filter'
    echo ':INPUT DROP [0:0]'
    echo ':FORWARD DROP [0:0]'
    echo ':OUTPUT DROP [0:0]'
    echo '-A INPUT -i lo -j ACCEPT'
    echo '-A OUTPUT -o lo -j ACCEPT'
    echo 'COMMIT'
  } | ip6tables-restore
fi

# Whoever is root can remove the rules: leave the user one root command, this script.
echo "$SANDBOX_USER ALL=(root) NOPASSWD: ${RUN_FIREWALL}" >"/etc/sudoers.d/$SANDBOX_USER"
chmod 0440 "/etc/sudoers.d/$SANDBOX_USER"
visudo -cq || fail "the sudo rules are broken"
if runuser -u "$SANDBOX_USER" -- sudo -n true 2>/dev/null; then
  fail "$SANDBOX_USER can still run any command as root, so the firewall can be removed"
fi

if curl -sS -o /dev/null --connect-timeout 5 https://example.com 2>/dev/null; then
  fail "the firewall lets https://example.com through"
fi
for domain in $ALLOWED_DOMAINS; do
  curl -sS -o /dev/null --connect-timeout 10 "https://$domain" ||
    fail "the firewall blocks https://$domain, which it should let through"
  break
done
echo "Firewall ready: only the listed hosts can be reached."
`
  return wrapManagedBlock(body, HASH_MARKERS)
}

function recommendation(input: SandboxInput): Recommendation {
  const tools = sandboxTools(input.targets)
  const { domains, github } = sandboxHosts(input)
  const reachable = [...domains, ...(github ? ['GitHub'] : [])]
  const other = TARGETS.filter(
    (target) =>
      target !== Target.Generic &&
      input.targets.includes(target) &&
      !TARGET_TEMPLATES[target].sandbox,
  ).map((target) => TARGET_TEMPLATES[target].name)

  const paragraphs = [
    `A tool's permission settings stop the usual form of a command; they are not a security boundary. \`${DEVCONTAINER_FILE}\` and \`${FIREWALL_FILE}\` describe a container to run the assistant in. Open the repository in it: **Dev Containers: Reopen in Container** in VS Code, or \`devcontainer up --workspace-folder .\` then \`devcontainer exec --workspace-folder . bash\` with the Dev Containers CLI, which forwards nothing from your machine. The container needs Docker, and the capabilities \`NET_ADMIN\` and \`NET_RAW\` for its firewall.`,
    [
      '**What it stops.**',
      '- Reading or changing files outside the repository: the workspace is the only folder of your machine in the container, and `.devcontainer` is read-only inside it.',
      `- Reaching hosts that are not listed: outgoing traffic is refused except DNS and ${reachable.length > 0 ? reachable.join(', ') : 'nothing else'}. The start fails if a blocked host answers.${input.network === 'open' ? ' You answered that the assistant may use the network freely: the container still starts closed, and you add the hosts it needs.' : ''}`,
      '- Removing the firewall: once it is up, the container user has no root access left, except to run the firewall script again. Installing a system package therefore takes a rebuild.',
    ].join('\n'),
    [
      '**What it does not stop.**',
      '- Everything in the workspace is readable and writable: keep `.env` files and keys out of it, and review what the assistant changed before you run it on your machine (scripts in `package.json`, Git hooks, editor tasks).',
      '- A credential inside the container can be sent to any host the firewall lets through, the credential of the assistant included. Give it a key with a spending limit, and no token that can do more than the task needs.',
      '- The firewall allows addresses, not names: a host that shares an address with a listed one gets through, and so does anything hosted by a listed service (a GitHub repository, a published package). DNS queries can carry data out. Addresses are read when the container starts: when a listed host stops answering, run `sudo ' +
        RUN_FIREWALL +
        '` in the container.',
      '- The rules live in the running container and are put back by its start command: start it from VS Code or with `devcontainer up`, never with `docker start`, which leaves the network open.',
      '- VS Code copies your Git configuration into a container and forwards your Git credential helper and a running SSH agent. The file turns the first two off (`dev.containers.copyGitConfig`, `dev.containers.gitCredentialHelperConfigLocation`), but VS Code may only read them from your own settings: set them there too (`false` and `"none"`). Nothing in the file stops the SSH agent from being forwarded: stop it or empty it (`ssh-add -D`) before opening the container, or use the Dev Containers CLI.',
    ].join('\n'),
    `To let another host through (your Coreloom UML API for \`coreloom-uml pull\`, a private registry), add \`EXTRA_ALLOWED_DOMAINS="host.example.com"\` on a line above the managed block of \`${FIREWALL_FILE}\`, then rebuild the container. Do it from your machine: the assistant cannot.`,
  ]
  if (tools.length > 0) {
    paragraphs.push(
      [
        `**Credentials and prompts.** Nothing is passed in from your machine. In the container: ${tools.map((tool) => `for ${tool.name}, ${tool.credential}`).join('; ')}. To pass a key from your machine instead, add for example \`"remoteEnv": { "NAME": "\${localEnv:NAME}" }\` to \`${DEVCONTAINER_FILE}\`.`,
        `Running without permission prompts (${tools.map((tool) => `\`${tool.unattended}\``).join(', ')}) is acceptable only inside this container, with the firewall up, on a repository you trust; never on your machine.`,
      ].join('\n\n'),
    )
  }
  if (other.length > 0) {
    paragraphs.push(
      `${other.join(' and ')} ${other.length > 1 ? 'run' : 'runs'} in your editor: attach the editor to the container so that the commands it runs stay inside, and add the hosts it calls with \`EXTRA_ALLOWED_DOMAINS\`, which this list does not include.`,
    )
  }
  return {
    target: Target.Generic,
    title: 'Run the assistant in the development container',
    body: paragraphs.join('\n\n'),
  }
}

/** The container's two files, as path and content without a trailing line break, and its advice. */
export function renderSandbox(input: SandboxInput) {
  return {
    files: [
      { path: DEVCONTAINER_FILE, content: devcontainer(input) },
      { path: FIREWALL_FILE, content: firewall(input) },
    ],
    recommendation: recommendation(input),
  }
}
