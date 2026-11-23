import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { Role } from '../roles/role.ts'
import { RULE_PACKS } from '../rule-packs/index.ts'
import type { AcceptedRule } from '../schemas.ts'
import { TARGETS } from '../targets.ts'
import { yamlString } from './gates.ts'
import {
  findManagedBlock,
  HASH_MARKERS,
  hashManagedBlock,
  MANAGED_BLOCK_BEGIN,
  SLASH_MARKERS,
} from './managed-block.ts'
import {
  type AgentContextInput,
  renderAgentContext,
  repositoryChecks,
} from './render-agent-context.ts'

/** A rule held: its slot, its id and, for a rule that takes one, the typed text. */
const held = (slot: string, rule: string, value?: string): AcceptedRule =>
  value === undefined ? { slot, rule } : { slot, rule, value }

/** The checks typed into the `tooling.checks` rule. */
const checks = (commands: string) => held('tooling.checks', 'run', commands)

const INPUT: AgentContextInput = {
  project: {
    name: 'Shop',
    description: 'Online shop for *rare* books',
    architectures: [
      {
        title: 'Orders',
        description: 'Order taking and payment',
        diagrams: [
          { kind: 'class', title: 'Order model' },
          { kind: 'sequence', title: 'Checkout' },
        ],
      },
      { title: 'Catalog', description: null, diagrams: [] },
    ],
  },
  packs: RULE_PACKS,
  ready: [
    held('typescript.any', 'agree'),
    held('typescript.strict', 'all'),
    held('react.granularity', 'agree'),
    held('react.state', 'tanstack-query-only'),
    held('react.styling', 'tailwind'),
    held('testing.levels', 'unit'),
    held('testing.levels', 'e2e'),
    held('style.comments', 'agree'),
    held('workflow.autonomy', 'agree'),
    held('tooling.package-manager', 'pnpm'),
    checks('pnpm lint && pnpm test'),
  ],
  rules: [
    { section: 'React', text: 'Prefer `useSuspenseQuery` in routes.' },
    { section: 'Unknown', text: 'Dropped.' },
  ],
  notes: 'Deploys go through **staging** first.\r\n\r\n\r\n<script>alert(1)</script>',
  targets: ['cursor', 'claude-code'],
  roles: [],
}

const reviewer: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews a change and reports what it finds.',
  mission: 'Review the change.',
  rights: ['read'],
  scope: [],
  forbidden: [],
  done: { commands: [], text: 'The review is posted.' },
  escalation: null,
  source: null,
}

const implementer: Role = {
  slug: 'implementer',
  name: 'Implementer',
  description: 'Implements one task and hands it back checked.',
  mission: 'Implement the task you are given.',
  rights: ['read', 'write', 'run-checks', 'commit'],
  scope: ['apps/web'],
  forbidden: ['Never change a migration.'],
  done: { commands: ['pnpm test'], text: null },
  escalation: 'Stop and ask when the task is unclear.',
  source: null,
}

const ROLES_INPUT: AgentContextInput = {
  ...INPUT,
  targets: ['claude-code', 'cursor', 'codex', 'generic'],
  roles: [reviewer, implementer],
}

const agentsMd = (input: AgentContextInput) => {
  const file = renderAgentContext(input).files.find((item) => item.path === 'AGENTS.md')
  return file?.content ?? ''
}

describe('renderAgentContext', () => {
  it('renders the same bytes twice, with no id nor date', () => {
    const first = renderAgentContext(INPUT)
    const second = renderAgentContext(structuredClone(INPUT))
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    const text = first.files.map((file) => file.content).join('\n')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}-/i)
  })

  it('renders AGENTS.md and the CLAUDE.md pointer for cursor and claude-code', () => {
    const { files } = renderAgentContext(INPUT)
    expect(files.map((file) => [file.path, file.kind])).toEqual([
      ['AGENTS.md', 'generic'],
      ['CLAUDE.md', 'pointer'],
      ['.claude/settings.json', 'settings'],
      ['.githooks/pre-commit', 'config'],
    ])
    expect(files[1]?.content).toBe(
      `${MANAGED_BLOCK_BEGIN}\n@AGENTS.md\n<!-- coreloom-uml:end -->\n`,
    )
  })

  it('lists the requirements and the decisions taken in the Project section', () => {
    const plain = agentsMd(INPUT)
    expect(
      agentsMd({ ...INPUT, project: { ...INPUT.project, requirements: [], decisions: [] } }),
    ).toBe(plain)

    const text = agentsMd({
      ...INPUT,
      project: {
        ...INPUT.project,
        requirements: [
          {
            priority: 'must',
            statement: 'Checkout stays up\nwhen mail is down.',
            measure: '99.9 %',
          },
          { priority: 'should', statement: 'Hosting stays <b>cheap</b>.', measure: null },
        ],
        decisions: [
          {
            title: 'How are mails sent?',
            chosen: 'Queue',
            consequences: 'One more worker to run.',
          },
          ...Array.from({ length: 31 }, (_, index) => ({
            title: `Decision ${String(index)}`,
            chosen: null,
            consequences: null,
          })),
        ],
      },
    })

    expect(text).toContain('- Must: Checkout stays up when mail is down. Met when: 99.9 %')
    expect(text).toContain('- Should: Hosting stays \\<b\\>cheap\\</b\\>.')
    expect(text).toContain('- **How are mails sent?** Queue. One more worker to run.')
    expect(text).toContain('- **Decision 28**\n- (2 more in Coreloom UML)')
    // Both lists are part of the Project section: before the next heading.
    const project = text.slice(text.indexOf('## Project'))
    expect(project.slice(0, project.indexOf('\n## '))).toContain('(2 more in Coreloom UML)')
  })

  it('renders the whole AGENTS.md block', () => {
    expect(agentsMd(INPUT)).toMatchSnapshot()
  })

  it('renders the back-end, Git and security rule packs together', () => {
    const ready = [
      held('api.style', 'rest'),
      held('api.compatibility', 'agree'),
      held('api.validation', 'zod'),
      held('errors.handling', 'central-handler'),
      held('logging.style', 'structured'),
      held('logging.sensitive-data', 'agree'),
      held('database.access', 'query-builder'),
      held('database.migrations', 'ask'),
      held('git.branching', 'worktree'),
      held('git.commit-messages', 'other', 'Subject under 50 characters, ticket id first'),
      held('git.commit-permission', 'commit'),
      held('git.pull-request-size', '400'),
      held('git.never-commit', 'secrets'),
      held('git.never-commit', 'unrelated'),
      held('git.history', 'disagree'),
      held('git.attribution', 'agree'),
      held('security.secrets', 'agree'),
      held('security.dependencies', 'ask'),
      held('security.version-pins', 'exact'),
      held('security.input-trust', 'disagree'),
      held('security.destructive-commands', 'ask'),
      held('security.network', 'registry'),
      held('security.sensitive-code', 'agree'),
    ]
    expect(agentsMd({ ...INPUT, ready, rules: [] })).toMatchSnapshot()
  })

  it('orders sections and lists the architectures in Project', () => {
    const text = agentsMd(INPUT)
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual([
      'Project',
      'Working style',
      'TypeScript',
      'React',
      'Testing',
      'Workflow',
      'Tooling',
      'Project notes',
    ])
    expect(text).toContain('This repository is **Shop**: Online shop for \\*rare\\* books')
    expect(text).toContain(
      '- **Orders**: Order taking and payment\n  - Order model (class diagram)',
    )
    expect(text).toContain('- **Catalog**.')
  })

  it('appends accepted rules to their section and drops rules of unknown sections', () => {
    const text = agentsMd(INPUT)
    const react = text.slice(text.indexOf('## React'), text.indexOf('## Testing'))
    expect(react.trim().split('\n').at(-1)).toBe('- Prefer \\`useSuspenseQuery\\` in routes.')
    expect(text).not.toContain('Dropped.')
  })

  it('omits empty sections, and rules that cannot be held together produce nothing', () => {
    const text = agentsMd({
      ...INPUT,
      ready: [
        held('style.comments', 'agree'),
        // Two rules of a group that holds one, a rule the group does not have, a text nobody asked for.
        held('typescript.any', 'agree'),
        held('typescript.any', 'disagree'),
        held('react.state', 'mobx'),
        held('react.styling', 'tailwind', 'With plugins'),
        held('unknown.slot', 'agree'),
      ],
      rules: [],
      notes: null,
    })
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(['Project', 'Working style'])
  })

  it('writes the lines of a group in the group’s order, whatever the order they are held in', () => {
    const levels = (ready: AcceptedRule[]) => {
      const text = agentsMd({ ...INPUT, ready, rules: [], notes: null })
      return text.slice(text.indexOf('## Testing'))
    }
    const unit = held('testing.levels', 'unit')
    const e2e = held('testing.levels', 'e2e')
    expect(levels([e2e, unit])).toBe(levels([unit, e2e]))
    expect(
      levels([unit, e2e])
        .split('\n')
        .filter((line) => line.startsWith('- ')),
    ).toHaveLength(2)
  })

  it('writes the text typed into a rule escaped, and a group’s own line after its rules’', () => {
    const text = agentsMd({
      ...INPUT,
      ready: [
        held('react.state', 'other', 'MobX <b>stores</b>'),
        held('git.never-commit', 'debug'),
        held('tooling.package-manager', 'yarn'),
      ],
      rules: [],
      notes: null,
    })
    expect(text).toContain('MobX \\<b\\>stores\\</b\\>')
    expect(text).not.toContain('<b>')
    expect(text).toContain(
      '## Git\n\n- Never commit debug statements, temporary files or commented-out code.\n- Read the staged diff before every commit and stage files by name, never with `git add -A`.',
    )
    expect(text).toContain(
      '- Use yarn for every install and script; never another package manager.',
    )
  })

  it('renders architecture rules right after Project', () => {
    const text = agentsMd({
      ...INPUT,
      ready: [held('style.comments', 'agree')],
      rules: [{ section: 'Architecture', text: '`billing` never imports from `auth`.' }],
      notes: null,
    })
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(['Project', 'Architecture', 'Working style'])
    expect(text).toContain('## Architecture\n\n- \\`billing\\` never imports from \\`auth\\`.')
  })

  it('renders dependency-cruiser rules from the package diagrams', () => {
    const packages = {
      elements: [
        { id: 'src', kind: 'package' },
        { id: 'ui', kind: 'package', parent: 'src' },
        { id: 'domain', kind: 'package', parent: 'src' },
        { id: 'infra', kind: 'package', label: 'src/infra', parent: 'src' },
        { id: 'db', kind: 'package', parent: 'infra' },
        { id: 'Order', kind: 'class', parent: 'domain' },
        { id: 'shared', kind: 'package', label: 'packages/shared.kit/' },
        { id: 'misc', kind: 'package', label: 'Not a folder!' },
        { id: 'lost', kind: 'package', parent: 'misc' },
      ],
      relations: [
        { from: 'ui', to: 'domain' },
        { from: 'ui', to: 'db' },
        { from: 'infra', to: 'Order' },
        { from: 'src', to: 'shared' },
        { from: 'lost', to: 'ui' },
      ],
    }
    const input: AgentContextInput = {
      ...INPUT,
      project: {
        ...INPUT.project,
        architectures: [
          {
            title: 'Orders',
            description: null,
            diagrams: [
              { kind: 'package', title: 'Layers', packages },
              // No arrow between two folders: says nothing, so `tools` is not a boundary.
              {
                kind: 'package',
                title: 'Tools',
                packages: { elements: [{ id: 'tools', kind: 'package' }], relations: [] },
              },
            ],
          },
        ],
      },
    }
    const { files } = renderAgentContext(input)
    const file = files.find((item) => item.path === '.dependency-cruiser.cjs')
    expect(file?.kind).toBe('config')
    expect(file?.content).toMatchSnapshot()

    const block = findManagedBlock(file?.content ?? '', SLASH_MARKERS)
    expect(file?.content).toBe(`${block?.block}\n`)
    expect(hashManagedBlock(block?.block ?? '')).toBe(file?.blockHash)

    const config = new Function('module', `${file?.content}; return module.exports`)({})
    expect(config.forbidden.map((rule: { name: string }) => rule.name)).toEqual([
      'not-in-diagram:packages/shared.kit',
      'not-in-diagram:src/domain',
      'not-in-diagram:src/infra',
      'not-in-diagram:src/infra/db',
      'not-in-diagram:src/ui',
    ])
    expect(config.forbidden[4].to).toEqual({
      path: ['^src/infra/'],
      pathNot: ['^src/infra/db/'],
    })

    // The same command gates every commit and every build, after the checks.
    const gate = 'npx depcruise packages/shared.kit src'
    expect(settings(input, PRE_COMMIT)).toContain(`pnpm test || exit 1\n${gate} || exit 1\n`)
    expect(settings(withWorkflow(input), WORKFLOW)).toContain(`      - run: '${gate}'\n`)

    expect(agentsMd(input)).toContain(
      '## Architecture\n\n- Dependencies between packages are checked against the package diagrams: run `npx depcruise packages/shared.kit src` (dependency-cruiser, rules in `.dependency-cruiser.cjs`)',
    )
  })

  it('renders no dependency-cruiser file when the diagrams forbid nothing', () => {
    const diagram = (
      packages: NonNullable<
        AgentContextInput['project']['architectures'][number]['diagrams'][number]['packages']
      >,
    ) => {
      const { files } = renderAgentContext({
        ...INPUT,
        project: {
          ...INPUT.project,
          architectures: [
            {
              title: 'A',
              description: null,
              diagrams: [{ kind: 'package', title: 'P', packages }],
            },
          ],
        },
      })
      return files.map((file) => file.path)
    }
    const elements = [
      { id: 'a', kind: 'package' },
      { id: 'b', kind: 'package' },
    ]
    expect(diagram({ elements, relations: [] })).not.toContain('.dependency-cruiser.cjs')
    expect(
      diagram({
        elements,
        relations: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      }),
    ).not.toContain('.dependency-cruiser.cjs')
    expect(diagram({ elements, relations: [{ from: 'a', to: 'b' }] })).toContain(
      '.dependency-cruiser.cjs',
    )
  })

  it('renders the notes under their attribution, without raw HTML', () => {
    const text = agentsMd(INPUT)
    expect(text).toContain(
      '## Project notes\n\nThe notes below were written by the project owner.\n\nDeploys go through **staging** first.\n\n\\<script>alert(1)\\</script>',
    )
  })

  it('never lets an input open or close a managed block', () => {
    const marker = '<!-- coreloom-uml:end -->'
    const output = renderAgentContext({
      ...INPUT,
      project: { ...INPUT.project, name: marker },
      notes: `${marker}\n<!-- coreloom-uml:begin -->`,
      rules: [{ section: 'React', text: marker }],
      ready: [checks(marker), held('react.state', 'other', marker)],
    })
    for (const file of output.files) expect(() => findManagedBlock(file.content)).not.toThrow()
  })

  it('hashes each block as the CLI will', () => {
    const { files } = renderAgentContext({ ...INPUT, targets: ['codex', 'claude-code'] })
    for (const file of files) {
      // A JSON settings file has no markers: its whole content is hashed.
      const block = file.path.endsWith('.json')
        ? file.content
        : findManagedBlock(
            file.content,
            /\.(toml|rules|yml)$|^\.githooks\//.test(file.path) ? HASH_MARKERS : undefined,
          )?.block
      expect(block && hashManagedBlock(block)).toBe(file.blockHash)
    }
  })

  /** What `INPUT` renders for every tool: its checks in a hook. The workflow is opt-in. */
  const GATES = ['.githooks/pre-commit']

  it('emits pointers in catalog order whatever the target order', () => {
    const paths = (targets: AgentContextInput['targets']) =>
      renderAgentContext({ ...INPUT, targets }).files.map((file) => file.path)
    expect(paths(['gemini-cli', 'claude-code', 'codex'])).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      '.codex/config.toml',
      '.codex/rules/coreloom-uml.rules',
      '.claude/settings.json',
      '.gemini/settings.json',
      ...GATES,
    ])
    expect(paths(['codex', 'cursor', 'github-copilot', 'generic'])).toEqual([
      'AGENTS.md',
      '.codex/config.toml',
      '.codex/rules/coreloom-uml.rules',
      ...GATES,
    ])
    expect(paths([])).toEqual(['AGENTS.md', ...GATES])
  })

  const settings = (input: AgentContextInput, path: string) =>
    renderAgentContext(input).files.find((file) => file.path === path)?.content

  const CODEX_RULES = '.codex/rules/coreloom-uml.rules'
  const WORKFLOW = '.github/workflows/agent-conventions.yml'
  const PRE_COMMIT = '.githooks/pre-commit'

  it('renders the settings each tool enforces from the tooling and autonomy rules', () => {
    const input: AgentContextInput = { ...INPUT, targets: ['codex', 'claude-code', 'gemini-cli'] }
    expect(settings(input, '.claude/settings.json')).toMatchSnapshot()
    expect(settings(input, '.codex/config.toml')).toMatchSnapshot()
    expect(settings(input, CODEX_RULES)).toMatchSnapshot()
    expect(settings(input, '.gemini/settings.json')).toMatchSnapshot()
    expect(renderAgentContext(input).recommendations.map((item) => item.target)).toEqual([
      'codex',
      'codex',
      'claude-code',
      'claude-code',
      'gemini-cli',
      'gemini-cli',
      'generic',
      'generic',
    ])
  })

  it('puts Codex in a read-only sandbox only when the assistant always asks first', () => {
    const autonomy = (rule: string) => ({
      ...INPUT,
      targets: ['codex' as const],
      ready: [held('workflow.autonomy', rule)],
    })
    expect(settings(autonomy('ask-before-writing'), '.codex/config.toml')).toContain(
      'sandbox_mode = "read-only"',
    )
    expect(settings(autonomy('agree'), '.codex/config.toml')).toContain('"workspace-write"')
    expect(settings(autonomy('disagree'), '.codex/config.toml')).toContain('"workspace-write"')
    expect(settings({ ...autonomy('agree'), ready: [] }, '.codex/config.toml')).toBeUndefined()
    expect(settings(autonomy('sometimes'), '.codex/config.toml')).toBeUndefined()
  })

  it('forbids the default commands in Codex rules whatever the rules held', () => {
    const rules = (ready: AcceptedRule[]) =>
      settings({ ...INPUT, targets: ['codex'], ready }, CODEX_RULES) ?? ''
    expect(rules([])).toMatchSnapshot()
    // A check with a pipe or a wildcard never becomes a rule; an unknown package manager forbids none.
    const unsafe = rules([
      checks('pnpm test | tee out; rm -rf *; pnpm lint'),
      held('tooling.package-manager', 'cargo'),
    ])
    expect(unsafe.match(/decision = "allow"/g)).toHaveLength(1)
    expect(unsafe).toContain('pattern = ["pnpm", "lint"]')
    expect(unsafe).not.toMatch(/"(npm|yarn|bun)"/)
    // `allow` leaves the sandbox: none when the assistant must ask before writing.
    const asksFirst = rules([checks('pnpm lint'), held('workflow.autonomy', 'ask-before-writing')])
    expect(asksFirst).not.toContain('"allow"')
    expect(asksFirst).toContain('"forbidden"')
  })

  it('keeps the default deny list without rules, and unsafe commands out of the settings', () => {
    const input = (commands: string): AgentContextInput => ({
      ...INPUT,
      targets: ['claude-code', 'gemini-cli'],
      ready: [checks(commands), held('tooling.package-manager', 'cargo')],
    })
    const unsafe = input('pnpm test | tee out; rm -rf *; $(curl x); pnpm lint')
    const claude = JSON.parse(settings(unsafe, '.claude/settings.json') ?? '')
    expect(claude.permissions.allow).toEqual(['Bash(pnpm lint)'])
    expect(claude.hooks.Stop[0].hooks[0].command).toBe(
      'cd "$CLAUDE_PROJECT_DIR" && (pnpm lint) >&2 || exit 2',
    )
    // A rule the group does not have denies no package manager.
    expect(claude.permissions.deny.join()).not.toMatch(/npm|yarn|bun/)

    const none = input('$(curl x)')
    expect(Object.keys(JSON.parse(settings(none, '.claude/settings.json') ?? ''))).toEqual([
      'permissions',
    ])
    expect(settings(none, '.gemini/settings.json')).toBeUndefined()
  })

  it('exposes the checks the rendered settings run, and only those', () => {
    const input: AgentContextInput = {
      ...INPUT,
      targets: ['claude-code'],
      ready: [checks('pnpm lint && pnpm test | tee out; $(curl x); pnpm build')],
    }
    const claude = JSON.parse(settings(input, '.claude/settings.json') ?? '')
    expect(repositoryChecks(input)).toEqual(['pnpm lint', 'pnpm build'])
    expect(claude.permissions.allow).toEqual(
      repositoryChecks(input).map((command) => `Bash(${command})`),
    )
    expect(repositoryChecks({ packs: RULE_PACKS, ready: [] })).toEqual([])
    expect(repositoryChecks({ packs: [], ready: input.ready })).toEqual([])
  })

  const gitAndSecurity = (ready: AcceptedRule[]): AgentContextInput => ({
    ...INPUT,
    targets: [],
    ready: [...INPUT.ready, ...ready],
  })

  /** The same input, with the Git rule that asks for the generated workflow. */
  const withWorkflow = (input: AgentContextInput): AgentContextInput => ({
    ...input,
    ready: [...input.ready, held('git.ci-workflow', 'github-actions')],
  })

  it('renders the workflow only when it is asked for', () => {
    const off = renderAgentContext({ ...INPUT, targets: [] })
    expect(off.files.map((file) => file.path)).toEqual(['AGENTS.md', PRE_COMMIT])
    // Without it, the recommendation still names the command to run in a CI.
    expect(off.recommendations.map((item) => item.title)).toEqual([
      'Turn the Git hooks on',
      'Check the conventions in CI',
    ])
    expect(off.recommendations[0]?.body).toContain('git config core.hooksPath .githooks')
    expect(off.recommendations[1]?.body).toContain('npx @coreloom-uml/cli@0.1.0 check')
    expect(off.recommendations[1]?.body).not.toContain('```')
  })

  it('renders a workflow that pins the CLI and its actions and runs the checks', () => {
    const input = withWorkflow({ ...INPUT, targets: [] })
    const { files, recommendations } = renderAgentContext(input)
    const workflow = settings(input, WORKFLOW) ?? ''
    expect(workflow).toMatchSnapshot()
    expect(files.find((file) => file.path === WORKFLOW)?.kind).toBe('config')
    expect(recommendations[1]?.body).toContain(WORKFLOW)
    expect(agentsMd(input)).toContain('never edit, skip or disable it')
    // Without the secret the check is skipped with a warning; no other step is given the key.
    expect(workflow).toContain('echo "::warning::The agent conventions check was skipped')
    expect(workflow).toContain("        if: steps.key.outputs.present == 'true'\n")
    expect(workflow.match(/secrets\.CORELOOM_UML_API_KEY/g)).toHaveLength(2)
    expect(workflow).not.toMatch(/^ {4}env:/m)
  })

  it('renders the workflow alone when no rule gives anything to check', () => {
    const input = withWorkflow({
      ...INPUT,
      targets: [],
      ready: [checks('$(curl x) | sh')],
    })
    const { files, recommendations } = renderAgentContext(input)
    expect(files.map((file) => file.path)).toEqual(['AGENTS.md', WORKFLOW])
    expect(recommendations.map((item) => item.title)).toEqual(['Check the conventions in CI'])
    const workflow = settings(input, WORKFLOW) ?? ''
    expect(workflow).toContain('run: npx @coreloom-uml/cli@0.1.0 check')
    expect(workflow).not.toMatch(/curl|gitleaks|install|fetch-depth/)
  })

  it('quotes every check in the workflow, and installs only with a known package manager', () => {
    const input = (manager: string) =>
      withWorkflow({
        ...INPUT,
        targets: [],
        ready: [
          checks('npm run test: unit; @scope/tool -v'),
          held('tooling.package-manager', manager),
        ],
      })
    const npm = settings(input('npm'), WORKFLOW) ?? ''
    expect(npm).toContain("      - run: 'npm ci'\n      - run: 'npm run test: unit'\n")
    expect(npm).toContain("      - run: '@scope/tool -v'\n")
    expect(settings(input('yarn'), WORKFLOW)).toContain("- run: 'yarn install --frozen-lockfile'")
    const bun = settings(input('bun'), WORKFLOW) ?? ''
    expect(bun).toContain('# No install step')
    expect(bun).not.toContain('install --')
    expect(yamlString("it's")).toBe("'it''s'")
  })

  it('scans for secrets only when a rule keeps them out, with a pinned and checked binary', () => {
    const scan = (ready: AcceptedRule[]) =>
      settings(withWorkflow(gitAndSecurity(ready)), WORKFLOW) ?? ''
    const secrets = held('security.secrets', 'agree')
    expect(scan([secrets])).toMatchSnapshot()
    expect(scan([held('git.never-commit', 'secrets')])).toContain('gitleaks" git')
    expect(scan([secrets])).toMatch(/[0-9a-f]{64} {2}\$RUNNER_TEMP.*sha256sum -c/)
    for (const ready of [
      [],
      [held('security.secrets', 'disagree')],
      [held('git.never-commit', 'debug')],
    ]) {
      expect(scan(ready)).not.toContain('gitleaks')
    }
  })

  it('runs the checks and the dependency rules in the pre-commit hook, never an unsafe command', () => {
    const hook = settings(
      {
        ...INPUT,
        targets: [],
        ready: [checks('pnpm test | tee out; rm -rf *; pnpm lint')],
      },
      PRE_COMMIT,
    )
    expect(hook).toMatchSnapshot()
    expect(hook).not.toMatch(/tee|rm -rf/)
  })

  /** Runs the rendered commit-msg hook on a message, as Git does; `null` when none is rendered. */
  const commitMsg = (ready: AcceptedRule[], message = '') => {
    const hook = settings(gitAndSecurity(ready), '.githooks/commit-msg')
    if (hook === undefined) return null
    const script = `printf '%s' "$1" > "$0.msg"; sh -c "$2" hook "$0.msg"; code=$?; rm -f "$0.msg"; exit $code`
    const file = `${process.env.TMPDIR ?? '/tmp'}/coreloom-commit-msg-${process.pid}`
    return spawnSync('sh', ['-c', script, file, message, `#!/bin/sh\n${hook}`]).status
  }

  it('renders a commit-msg hook only for what a rule states', () => {
    expect(commitMsg([])).toBeNull()
    expect(commitMsg([held('git.commit-messages', 'imperative')])).toBeNull()
    expect(commitMsg([held('git.commit-messages', 'other', 'Ticket id first')])).toBeNull()
    // Typed into the rule, the name of a convention is a text, not the rule that checks it.
    expect(commitMsg([held('git.commit-messages', 'other', 'conventional')])).toBeNull()
    expect(commitMsg([held('git.attribution', 'disagree')])).toBeNull()
    expect(
      settings(
        gitAndSecurity([
          held('git.commit-messages', 'conventional'),
          held('git.attribution', 'agree'),
        ]),
        '.githooks/commit-msg',
      ),
    ).toMatchSnapshot()
  })

  it.skipIf(process.platform === 'win32')('enforces Conventional Commits on the subject', () => {
    const run = (message: string) =>
      commitMsg([held('git.commit-messages', 'conventional')], message)
    expect(run('feat(api): add the thing\n\nBecause.\n')).toBe(0)
    expect(run('fix!: drop the old flag')).toBe(0)
    expect(run('# a comment first\n\nchore: tidy\n')).toBe(0)
    expect(run('Merge branch main into topic')).toBe(0)
    expect(run('fixup! feat: x')).toBe(0)
    expect(run('Add the thing')).toBe(1)
    expect(run('feat:missing space')).toBe(1)
    expect(run('Feat: capital')).toBe(1)
    // Without the attribution rule, a trailer is not this hook's business.
    expect(run('feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>')).toBe(0)
  })

  it.skipIf(process.platform === 'win32')('refuses a commit that credits an assistant', () => {
    const run = (message: string) => commitMsg([held('git.attribution', 'agree')], message)
    expect(run('Add the thing\n\nCo-authored-by: Ada Lovelace <ada@example.com>\n')).toBe(0)
    // A person may be called Claude: only the assistant's own signature is refused.
    expect(run('Add the thing\n\nCo-authored-by: Claude Dupont <claude@example.com>\n')).toBe(0)
    expect(run('Add the thing\n\nThe report is generated with pandoc.\n')).toBe(0)
    expect(run('Add the thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n')).toBe(1)
    expect(
      run('Add the thing\n\nco-authored-by: Copilot <1+Copilot@users.noreply.github.com>'),
    ).toBe(1)
    expect(
      run('Add the thing\n\nGenerated with [Claude Code](https://claude.com/claude-code)'),
    ).toBe(1)
    // What `git commit -v` shows below the scissors line is not the message.
    const scissors = '# ------------------------ >8 ------------------------'
    expect(
      run(`Add the thing\n${scissors}\n+Co-Authored-By: Claude <noreply@anthropic.com>\n`),
    ).toBe(0)
  })

  it('says how to register the MCP server in each tool, without ever holding a key', () => {
    const { recommendations, files } = renderAgentContext({ ...INPUT, targets: [...TARGETS] })
    const mcp = recommendations.filter((item) => item.title === 'Live access through MCP')
    expect(mcp.map((item) => item.target)).toEqual([
      'codex',
      'cursor',
      'github-copilot',
      'claude-code',
      'gemini-cli',
    ])
    expect(mcp[3]?.body).toContain(
      'claude mcp add --transport http coreloom-uml https://<your-coreloom-uml-api>/mcp --header "Authorization: Bearer $CORELOOM_UML_API_KEY"',
    )
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor's own variable syntax.
    expect(mcp[1]?.body).toContain('"Authorization": "Bearer ${env:CORELOOM_UML_API_KEY}"')
    for (const item of mcp) expect(item.body).not.toContain('clu_')
    for (const item of mcp) expect(item.body).toContain('`get_code_conformance`')
    expect(mcp[4]?.body).toContain('gemini mcp add --scope user ')
    // A recommendation only: no MCP settings file is rendered.
    expect(files.some((file) => file.path.includes('mcp'))).toBe(false)
  })

  it('reports each fragment with its slot, rule and section', () => {
    const { fragments } = renderAgentContext(INPUT)
    expect(fragments[0]).toEqual({
      slot: 'typescript.any',
      rule: 'agree',
      section: 'TypeScript',
      text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
    })
    expect(fragments.some((fragment) => fragment.slot === 'workflow.changes')).toBe(false)
    // A group's own line is reported with the rule that brought it.
    expect(fragments.filter((fragment) => fragment.slot === 'tooling.package-manager')).toEqual([
      {
        slot: 'tooling.package-manager',
        rule: 'pnpm',
        section: 'Tooling',
        text: 'Use pnpm for every install and script; never another package manager.',
      },
    ])
  })

  it('changes only the TypeScript section of AGENTS.md when the rule about `any` changes', () => {
    const before = renderAgentContext(INPUT)
    const after = renderAgentContext({
      ...INPUT,
      ready: INPUT.ready.map((item) =>
        item.slot === 'typescript.any' ? held('typescript.any', 'disagree') : item,
      ),
    })
    expect(after.files[0]?.blockHash).not.toBe(before.files[0]?.blockHash)
    expect(after.files[1]?.blockHash).toBe(before.files[1]?.blockHash)
    const changed = after.fragments.filter(
      (fragment, index) => fragment.text !== before.fragments[index]?.text,
    )
    expect(changed.map((fragment) => fragment.section)).toEqual(['TypeScript'])
  })

  it('renders no role file without roles', () => {
    const { files, recommendations, roles } = renderAgentContext(ROLES_INPUT)
    const without = renderAgentContext({ ...ROLES_INPUT, roles: [] })
    expect(without.roles).toEqual([])
    expect(without.files.some((file) => file.kind === 'role')).toBe(false)
    expect(without.recommendations.some((item) => item.title === 'Roles')).toBe(false)
    // Roles only add: every other file and recommendation is the same with and without them.
    expect(files.filter((file) => file.kind !== 'role')).toEqual(without.files)
    expect(recommendations.filter((item) => item.title !== 'Roles')).toEqual(
      without.recommendations,
    )
    expect(roles).not.toEqual([])
  })

  it('renders one file per role and target', () => {
    const { files, recommendations, roles } = renderAgentContext(ROLES_INPUT)
    const roleFiles = files.filter((file) => file.kind === 'role')
    expect(roleFiles.map((file) => file.path)).toEqual([
      '.agents/roles/reviewer.md',
      '.codex/agents/reviewer.toml',
      '.claude/agents/reviewer.md',
      '.agents/roles/implementer.md',
      '.codex/agents/implementer.toml',
      '.claude/agents/implementer.md',
    ])
    for (const file of roleFiles) {
      expect(file.content.endsWith('\n')).toBe(true)
      expect(file.content.endsWith('\n\n')).toBe(false)
      expect(file.blockHash).toBe(hashManagedBlock(file.content.slice(0, -1)))
    }
    expect(recommendations.filter((item) => item.title === 'Roles')).toEqual([
      {
        target: 'cursor',
        title: 'Roles',
        body: "Cursor cannot load roles yet: use each role's plain file in `.agents/roles/`.",
      },
    ])
    // Without the AGENTS.md target those files are not rendered: the recommendation says so.
    const withoutGeneric = renderAgentContext({ ...ROLES_INPUT, targets: ['cursor', 'codex'] })
    expect(withoutGeneric.files.some((file) => file.path.startsWith('.agents/roles/'))).toBe(false)
    expect(withoutGeneric.recommendations.filter((item) => item.title === 'Roles')).toEqual([
      {
        target: 'cursor',
        title: 'Roles',
        body: 'Cursor cannot load roles yet: choose the AGENTS.md target to get each role as a plain file in `.agents/roles/`.',
      },
    ])
    expect(roles.map((role) => [role.slug, role.target])).toEqual([
      ['reviewer', 'generic'],
      ['reviewer', 'codex'],
      ['reviewer', 'claude-code'],
      ['implementer', 'generic'],
      ['implementer', 'codex'],
      ['implementer', 'claude-code'],
    ])
    expect(roles[0]?.launch).toBeNull()
    expect(roles[0]?.matrix).toMatchObject({ read: 'granted', write: 'instruction' })
    expect(roles[3]?.matrix).toMatchObject({ write: 'granted', commit: 'granted' })
    expect({ files: roleFiles, roles }).toMatchSnapshot()
  })

  it('leaves out a role the schema refuses', () => {
    const refused = [
      { ...implementer, slug: '../escape' },
      { ...implementer, slug: 'pusher', rights: ['push'] },
    ] as Role[]
    const { files, roles } = renderAgentContext({
      ...ROLES_INPUT,
      roles: [...refused, reviewer],
    })
    expect(roles.every((role) => role.slug === 'reviewer')).toBe(true)
    expect(roles).toHaveLength(3)
    const paths = files.filter((file) => file.kind === 'role').map((file) => file.path)
    expect(paths).toHaveLength(3)
    expect(paths.every((path) => path.includes('reviewer'))).toBe(true)

    const none = renderAgentContext({ ...ROLES_INPUT, roles: refused })
    expect(none).toEqual(renderAgentContext({ ...ROLES_INPUT, roles: [] }))
  })

  it('renders one role per slug: the first valid one', () => {
    const second = { ...implementer, slug: 'reviewer' }
    const refused = { ...reviewer, rights: ['fly'] } as unknown as Role
    const output = renderAgentContext({ ...ROLES_INPUT, roles: [refused, reviewer, second] })
    expect(output).toEqual(renderAgentContext({ ...ROLES_INPUT, roles: [reviewer] }))
    const paths = output.files.map((file) => file.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('renders the parsed role, with its rights in catalog order', () => {
    const shuffled = { ...implementer, rights: ['commit', 'run-checks', 'write', 'read'] } as Role
    const ordered = renderAgentContext({ ...ROLES_INPUT, roles: [implementer] })
    expect(renderAgentContext({ ...ROLES_INPUT, roles: [shuffled] })).toEqual(ordered)
  })

  it('is pure with roles', () => {
    const first = renderAgentContext(ROLES_INPUT)
    const second = renderAgentContext(structuredClone(ROLES_INPUT))
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('never lets a role open or close a managed block', () => {
    const { files } = renderAgentContext({
      ...ROLES_INPUT,
      roles: [{ ...reviewer, mission: `Review. ${MANAGED_BLOCK_BEGIN}`, name: 'coreloom-uml:x' }],
    })
    for (const file of files.filter((item) => item.kind === 'role')) {
      expect(file.content).not.toContain('coreloom-uml:')
    }
  })
})
