import { describe, expect, it } from 'vitest'
import { findQuestionnaire } from '../questionnaires/index.ts'
import type { Questionnaire } from '../schemas.ts'
import { findManagedBlock, hashManagedBlock, MANAGED_BLOCK_BEGIN } from './managed-block.ts'
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
    for (const file of renderAgentContext(INPUT).files) {
      const found = findManagedBlock(file.content)
      expect(found && hashManagedBlock(found.block)).toBe(file.blockHash)
    }
  })

  it('emits pointers in catalog order whatever the target order', () => {
    const paths = (targets: AgentContextInput['targets']) =>
      renderAgentContext({ ...INPUT, targets }).files.map((file) => file.path)
    expect(paths(['gemini-cli', 'claude-code', 'codex'])).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ])
    expect(paths(['codex', 'cursor', 'github-copilot', 'generic'])).toEqual(['AGENTS.md'])
    expect(paths([])).toEqual(['AGENTS.md'])
  })

  it('suggests Claude Code permissions from the checks answer', () => {
    const { recommendations } = renderAgentContext(INPUT)
    expect(recommendations.map((item) => item.target)).toEqual(['cursor', 'claude-code', 'generic'])
    expect(recommendations[1]?.body).toContain('- `"Bash(pnpm lint)"`\n- `"Bash(pnpm test)"`')
  })

  it('recommends CI steps that pin the CLI and run the checks', () => {
    const body = renderAgentContext({ ...INPUT, targets: [] }).recommendations[0]?.body
    expect(body).toContain(
      [
        '```yaml',
        '- name: Check the agent conventions',
        '  run: npx @coreloom-uml/cli@0.1.0 check',
        '  env:',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax.
        '    CORELOOM_UML_API_KEY: ${{ secrets.CORELOOM_UML_API_KEY }}',
        '- run: pnpm lint',
        '- run: pnpm test',
        '```',
      ].join('\n'),
    )
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
})
