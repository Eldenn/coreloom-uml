import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { findQuestionnaire } from '../questionnaires/index.ts'
import type { Role } from '../roles/role.ts'
import type { Questionnaire } from '../schemas.ts'
import { TARGETS } from '../targets.ts'
import { yamlString } from './gates.ts'
import {
  findManagedBlock,
  HASH_MARKERS,
  hashManagedBlock,
  MANAGED_BLOCK_BEGIN,
  SLASH_MARKERS,
} from './managed-block.ts'
import { type AgentContextInput, renderAgentContext } from './render-agent-context.ts'

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire

const answer = (questionId: string, value: number | string | string[]) => ({
  questionnaireId: 'frontend-react',
  questionId,
  value,
})

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
  questionnaires: [frontendReact],
  answers: [
    answer('ts-any', 5),
    answer('ts-strict', 'all'),
    answer('components-size', 4),
    answer('state-management', 'tanstack-query-only'),
    answer('styling', 'tailwind'),
    answer('tests-level', ['unit', 'e2e']),
    answer('comments', 5),
    answer('change-size', 3),
    answer('ask-before-act', 4),
    answer('package-manager', 'pnpm'),
    answer('checks', 'pnpm lint && pnpm test'),
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

  it('renders the whole AGENTS.md block', () => {
    expect(agentsMd(INPUT)).toMatchSnapshot()
  })

  it('renders the back-end, Git and security questionnaires together', () => {
    const ids = ['backend-node', 'git-workflow', 'security']
    const questionnaires = ids.map((id) => findQuestionnaire(id) as Questionnaire)
    const to = (
      questionnaireId: string,
      questionId: string,
      value: number | string | string[],
    ) => ({
      questionnaireId,
      questionId,
      value,
    })
    const answers = [
      to('backend-node', 'api-style', 'rest'),
      to('backend-node', 'api-compatibility', 5),
      to('backend-node', 'input-validation', 'zod'),
      to('backend-node', 'error-handling', 'central-handler'),
      to('backend-node', 'log-style', 'structured'),
      to('backend-node', 'log-sensitive-data', 4),
      to('backend-node', 'db-access', 'query-builder'),
      to('backend-node', 'db-migrations', 'ask'),
      to('backend-node', 'db-layering', 3),
      to('git-workflow', 'branching', 'worktree'),
      to('git-workflow', 'commit-messages', 'Subject under 50 characters, ticket id first'),
      to('git-workflow', 'commit-permission', 'commit'),
      to('git-workflow', 'pull-request-size', '400'),
      to('git-workflow', 'never-commit', ['secrets', 'unrelated']),
      to('git-workflow', 'history', 2),
      to('git-workflow', 'attribution', 5),
      to('security', 'secrets', 5),
      to('security', 'new-dependencies', 'ask'),
      to('security', 'version-pins', 'exact'),
      to('security', 'input-trust', 1),
      to('security', 'destructive-commands', 'ask'),
      to('security', 'network-access', 'registry'),
      to('security', 'sensitive-code', 4),
    ]
    expect(agentsMd({ ...INPUT, questionnaires, answers, rules: [] })).toMatchSnapshot()
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

  it('omits empty sections, and a neutral answer produces nothing', () => {
    const text = agentsMd({
      ...INPUT,
      answers: [answer('ts-any', 3), answer('comments', 5)],
      rules: [],
      notes: null,
    })
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(['Project', 'Working style'])
  })

  it('renders architecture rules right after Project', () => {
    const text = agentsMd({
      ...INPUT,
      answers: [answer('comments', 5)],
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
      answers: [answer('checks', marker)],
    })
    for (const file of output.files) expect(() => findManagedBlock(file.content)).not.toThrow()
  })

  it('never renders free-text details, which are not part of the input', () => {
    const withDetails = {
      ...INPUT,
      answers: INPUT.answers.map((item) => ({ ...item, details: 'Toujours en français' })),
    }
    expect(agentsMd(withDetails)).not.toContain('français')
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

  it('renders the settings each tool enforces from the tooling and autonomy answers', () => {
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
    const autonomy = (value: number) => ({
      ...INPUT,
      targets: ['codex' as const],
      answers: [answer('ask-before-act', value)],
    })
    expect(settings(autonomy(5), '.codex/config.toml')).toContain('sandbox_mode = "read-only"')
    expect(settings(autonomy(1), '.codex/config.toml')).toContain('"workspace-write"')
    expect(settings({ ...autonomy(1), answers: [] }, '.codex/config.toml')).toBeUndefined()
  })

  it('forbids the default commands in Codex rules whatever the answers', () => {
    const rules = (answers: AgentContextInput['answers']) =>
      settings({ ...INPUT, targets: ['codex'], answers }, CODEX_RULES) ?? ''
    expect(rules([])).toMatchSnapshot()
    // A check with a pipe or a wildcard never becomes a rule; an unknown package manager forbids none.
    const unsafe = rules([
      answer('checks', 'pnpm test | tee out; rm -rf *; pnpm lint'),
      answer('package-manager', 'cargo'),
    ])
    expect(unsafe.match(/decision = "allow"/g)).toHaveLength(1)
    expect(unsafe).toContain('pattern = ["pnpm", "lint"]')
    expect(unsafe).not.toMatch(/"(npm|yarn|bun)"/)
    // `allow` leaves the sandbox: none when the assistant must ask before acting.
    const asksFirst = rules([answer('checks', 'pnpm lint'), answer('ask-before-act', 5)])
    expect(asksFirst).not.toContain('"allow"')
    expect(asksFirst).toContain('"forbidden"')
  })

  it('keeps the default deny list without answers, and unsafe commands out of the settings', () => {
    const input = (checks: string): AgentContextInput => ({
      ...INPUT,
      targets: ['claude-code', 'gemini-cli'],
      answers: [answer('checks', checks), answer('package-manager', 'cargo')],
    })
    const unsafe = input('pnpm test | tee out; rm -rf *; $(curl x); pnpm lint')
    const claude = JSON.parse(settings(unsafe, '.claude/settings.json') ?? '')
    expect(claude.permissions.allow).toEqual(['Bash(pnpm lint)'])
    expect(claude.hooks.Stop[0].hooks[0].command).toBe(
      'cd "$CLAUDE_PROJECT_DIR" && (pnpm lint) >&2 || exit 2',
    )
    // An answer outside the options denies no package manager.
    expect(claude.permissions.deny.join()).not.toMatch(/npm|yarn|bun/)

    const none = input('$(curl x)')
    expect(Object.keys(JSON.parse(settings(none, '.claude/settings.json') ?? ''))).toEqual([
      'permissions',
    ])
    expect(settings(none, '.gemini/settings.json')).toBeUndefined()
  })

  const gitAndSecurity = (answers: [string, string, number | string | string[]][]) => ({
    ...INPUT,
    targets: [],
    questionnaires: [
      frontendReact,
      findQuestionnaire('git-workflow') as Questionnaire,
      findQuestionnaire('security') as Questionnaire,
    ],
    answers: [
      ...INPUT.answers,
      ...answers.map(([questionnaireId, questionId, value]) => ({
        questionnaireId,
        questionId,
        value,
      })),
    ],
  })

  /** The same input, with the Git questionnaire asking for the generated workflow. */
  const withWorkflow = (input: AgentContextInput, value = 'github-actions'): AgentContextInput => ({
    ...input,
    questionnaires: [...input.questionnaires, findQuestionnaire('git-workflow') as Questionnaire],
    answers: [
      ...input.answers,
      { questionnaireId: 'git-workflow', questionId: 'ci-workflow', value },
    ],
  })

  it('renders the workflow only when it is asked for', () => {
    const off = renderAgentContext({ ...INPUT, targets: [] })
    expect(off.files.map((file) => file.path)).toEqual(['AGENTS.md', PRE_COMMIT])
    expect(settings(withWorkflow({ ...INPUT, targets: [] }, 'none'), WORKFLOW)).toBeUndefined()
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

  it('renders the workflow alone when no answer gives anything to check', () => {
    const input = withWorkflow({
      ...INPUT,
      targets: [],
      answers: [answer('checks', '$(curl x) | sh')],
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
        answers: [
          answer('checks', 'npm run test: unit; @scope/tool -v'),
          answer('package-manager', manager),
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

  it('scans for secrets only when an answer keeps them out, with a pinned and checked binary', () => {
    const scan = (answers: Parameters<typeof gitAndSecurity>[0]) =>
      settings(
        gitAndSecurity([...answers, ['git-workflow', 'ci-workflow', 'github-actions']]),
        WORKFLOW,
      ) ?? ''
    expect(scan([['security', 'secrets', 5]])).toMatchSnapshot()
    expect(scan([['git-workflow', 'never-commit', ['secrets']]])).toContain('gitleaks" git')
    expect(scan([['security', 'secrets', 5]])).toMatch(
      /[0-9a-f]{64} {2}\$RUNNER_TEMP.*sha256sum -c/,
    )
    for (const answers of [
      [['security', 'secrets', 3]],
      [['security', 'secrets', 1]],
      [['git-workflow', 'never-commit', ['debug']]],
    ] satisfies Parameters<typeof gitAndSecurity>[0][]) {
      expect(scan(answers)).not.toContain('gitleaks')
    }
  })

  it('runs the checks and the dependency rules in the pre-commit hook, never an unsafe command', () => {
    const hook = settings(
      {
        ...INPUT,
        targets: [],
        answers: [answer('checks', 'pnpm test | tee out; rm -rf *; pnpm lint')],
      },
      PRE_COMMIT,
    )
    expect(hook).toMatchSnapshot()
    expect(hook).not.toMatch(/tee|rm -rf/)
  })

  /** Runs the rendered commit-msg hook on a message, as Git does; `null` when none is rendered. */
  const commitMsg = (answers: Parameters<typeof gitAndSecurity>[0], message = '') => {
    const hook = settings(gitAndSecurity(answers), '.githooks/commit-msg')
    if (hook === undefined) return null
    const script = `printf '%s' "$1" > "$0.msg"; sh -c "$2" hook "$0.msg"; code=$?; rm -f "$0.msg"; exit $code`
    const file = `${process.env.TMPDIR ?? '/tmp'}/coreloom-commit-msg-${process.pid}`
    return spawnSync('sh', ['-c', script, file, message, `#!/bin/sh\n${hook}`]).status
  }

  it('renders a commit-msg hook only for what an answer states', () => {
    expect(commitMsg([])).toBeNull()
    expect(commitMsg([['git-workflow', 'commit-messages', 'imperative']])).toBeNull()
    expect(commitMsg([['git-workflow', 'commit-messages', 'Ticket id first']])).toBeNull()
    expect(commitMsg([['git-workflow', 'attribution', 3]])).toBeNull()
    expect(commitMsg([['git-workflow', 'attribution', 1]])).toBeNull()
    expect(
      settings(
        gitAndSecurity([
          ['git-workflow', 'commit-messages', 'conventional'],
          ['git-workflow', 'attribution', 4],
        ]),
        '.githooks/commit-msg',
      ),
    ).toMatchSnapshot()
  })

  it.skipIf(process.platform === 'win32')('enforces Conventional Commits on the subject', () => {
    const run = (message: string) =>
      commitMsg([['git-workflow', 'commit-messages', 'conventional']], message)
    expect(run('feat(api): add the thing\n\nBecause.\n')).toBe(0)
    expect(run('fix!: drop the old flag')).toBe(0)
    expect(run('# a comment first\n\nchore: tidy\n')).toBe(0)
    expect(run('Merge branch main into topic')).toBe(0)
    expect(run('fixup! feat: x')).toBe(0)
    expect(run('Add the thing')).toBe(1)
    expect(run('feat:missing space')).toBe(1)
    expect(run('Feat: capital')).toBe(1)
    // Without the attribution answer, a trailer is not this hook's business.
    expect(run('feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>')).toBe(0)
  })

  it.skipIf(process.platform === 'win32')('refuses a commit that credits an assistant', () => {
    const run = (message: string) => commitMsg([['git-workflow', 'attribution', 5]], message)
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
    expect(mcp[4]?.body).toContain('gemini mcp add --scope user ')
    // A recommendation only: no MCP settings file is rendered.
    expect(files.some((file) => file.path.includes('mcp'))).toBe(false)
  })

  it('reports each fragment with its question and section', () => {
    const { fragments } = renderAgentContext(INPUT)
    expect(fragments[0]).toEqual({
      questionnaireId: 'frontend-react',
      questionId: 'ts-any',
      section: 'TypeScript',
      text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
    })
    expect(fragments.some((fragment) => fragment.questionId === 'change-size')).toBe(false)
  })

  it('changes only the TypeScript section of AGENTS.md when ts-any goes from 5 to 1', () => {
    const before = renderAgentContext(INPUT)
    const after = renderAgentContext({
      ...INPUT,
      answers: INPUT.answers.map((item) =>
        item.questionId === 'ts-any' ? answer('ts-any', 1) : item,
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
