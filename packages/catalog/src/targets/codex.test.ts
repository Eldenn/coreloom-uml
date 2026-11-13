import { describe, expect, it } from 'vitest'

import { roleMatrix } from '../roles/matrix.ts'
import { presetRole, ROLE_PRESETS } from '../roles/presets/index.ts'
import type { Right, Role } from '../roles/role.ts'
import { codex } from './codex.ts'
import type { RoleContext, RoleRender } from './types.ts'

const reviewer: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews a change and reports what it finds.',
  mission: 'Review the change.',
  rights: ['read'],
  scope: [],
  forbidden: [],
  done: { commands: ['pnpm test'], text: 'The review is posted.' },
  escalation: null,
  source: null,
}

const context: RoleContext = {
  checks: ['pnpm test'],
  otherPackageManagers: [],
  autonomy: null,
  container: false,
}

const contained: RoleContext = { ...context, container: true }

function render(role: Role, roleContext: RoleContext = context): RoleRender {
  const rendered = codex.role?.(role, roleContext)
  if (rendered === undefined) throw new Error('Codex renders no role')
  return rendered
}

/**
 * The agent file read back: every line is `key = <string>`, and the strings are written so that a
 * JSON reader and a TOML reader decode the same text.
 */
function agentFile(rendered: RoleRender): Record<string, string> {
  const content = rendered.files[0]?.content ?? ''
  return Object.fromEntries(
    content.split('\n').map((line) => {
      const [, key = '', value = ''] = /^([a-z_]+) = (".*")$/.exec(line) ?? []
      if (key === '') throw new Error(`Not a string assignment: ${line}`)
      return [key, JSON.parse(value) as string]
    }),
  )
}

const withRights = (rights: Right[]): Role => ({ ...reviewer, rights })

const ACT = '"Act as the agent defined in .codex/agents/reviewer.toml."'

/** Nothing the role lacks is refused by Codex itself. */
const instructions = (role: Role) =>
  Object.fromEntries(
    Object.keys(roleMatrix(role, [])).map((right) => [
      right,
      role.rights.includes(right as Right) ? 'granted' : 'instruction',
    ]),
  )

describe('codex role', () => {
  it('renders a reviewer without commands', () => {
    const rendered = render(reviewer)
    const content = rendered.files[0]?.content ?? ''
    const file = agentFile(rendered)

    expect(rendered.files.map(({ path }) => path)).toEqual(['.codex/agents/reviewer.toml'])
    expect(content).toMatchSnapshot()
    expect(content).toBe(content.trim())
    expect(Object.keys(file)).toEqual(['name', 'description', 'developer_instructions'])
    expect(file.name).toBe('reviewer')
    expect(file.description).toBe('Reviews a change and reports what it finds.')
    expect(rendered.launch).toBe(`codex --sandbox read-only -c web_search=disabled ${ACT}`)
    expect(roleMatrix(reviewer, rendered.enforced)).toEqual({
      read: 'granted',
      write: 'instruction',
      'run-checks': 'instruction',
      shell: 'instruction',
      commit: 'instruction',
      push: 'instruction',
      network: 'instruction',
    })
  })

  it('keeps the commands a role without checks reads the repository with', () => {
    const file = agentFile(render(reviewer))

    // Codex reads a file by running a command: its only other file tool writes.
    expect(file.developer_instructions?.match(/^- You must not .+$/gm)).toEqual([
      '- You must not edit or create files.',
      '- You must not run commands, except to read the repository.',
      '- You must not commit.',
      '- You must not push to any remote.',
      '- You must not access the network.',
    ])
    expect(file).not.toHaveProperty('features')
    expect(render(reviewer).launch).not.toContain('shell_tool')
  })

  it('drops the sandbox in the container', () => {
    const rendered = render(reviewer, contained)

    expect(rendered.launch).toBe(
      `codex --dangerously-bypass-approvals-and-sandbox -c web_search=disabled ${ACT}`,
    )
    expect(rendered.files).toEqual(render(reviewer).files)
    expect(roleMatrix(reviewer, rendered.enforced)).toEqual(instructions(reviewer))
  })

  it('lets a reviewer run the checks', () => {
    const role = withRights(['read', 'run-checks'])
    const rendered = render(role)
    const body = agentFile(rendered).developer_instructions

    expect(rendered.launch).toBe(`codex --sandbox read-only -c web_search=disabled ${ACT}`)
    expect(body?.match(/^- You must not .+$/gm)).toEqual([
      '- You must not edit or create files.',
      '- You must not run commands other than the checks listed under "Done when" and those that read the repository.',
      '- You must not commit.',
      '- You must not push to any remote.',
      '- You must not access the network.',
    ])
    expect(body).toContain('- `pnpm test` passes.')
    expect(roleMatrix(role, rendered.enforced)).toEqual(instructions(role))
  })

  it('opens the workspace to an implementer, and the network only when granted', () => {
    const implementer = withRights(['read', 'write', 'run-checks', 'shell', 'commit'])
    const online = withRights([...implementer.rights, 'network'])
    const offline = '--sandbox workspace-write -c sandbox_workspace_write.network_access=false'

    // Hosted web search is not a command: the sandbox's network setting does not turn it off.
    expect(render(implementer).launch).toBe(`codex ${offline} -c web_search=disabled ${ACT}`)
    expect(render(online).launch).toBe(`codex ${offline.replace('false', 'true')} ${ACT}`)
    expect(render(implementer, contained).launch).toBe(
      `codex --dangerously-bypass-approvals-and-sandbox -c web_search=disabled ${ACT}`,
    )
    expect(render(online, contained).launch).toBe(
      `codex --dangerously-bypass-approvals-and-sandbox ${ACT}`,
    )
    expect(render(withRights(['read', 'network'])).launch).toBe(`codex --sandbox read-only ${ACT}`)
    for (const roleContext of [context, contained]) {
      const { enforced } = render(implementer, roleContext)

      expect(roleMatrix(implementer, enforced)).toMatchObject({
        commit: 'granted',
        push: 'instruction',
        network: 'instruction',
      })
    }
  })

  it('calls nothing enforced, whatever the rights and the sandbox', () => {
    const rights: Right[][] = [
      ['read'],
      ['read', 'write'],
      ['read', 'network'],
      ['read', 'run-checks'],
      ['read', 'write', 'run-checks', 'shell', 'commit', 'push', 'network'],
    ]
    for (const role of rights.map(withRights)) {
      expect(render(role).enforced).toEqual([])
      expect(render(role, contained).enforced).toEqual([])
    }
  })

  it('keeps the TOML valid whatever the mission', () => {
    const mission = 'Quote """ and \'\'\' freely.\nA back\\slash, a tab\t, a DEL \u007f and é.'
    const role = { ...reviewer, slug: 'api-reviewer', mission, description: 'a\n"b" = \\c' }
    const rendered = render(role)
    const content = rendered.files[0]?.content ?? ''
    const file = agentFile(rendered)

    expect(rendered.files[0]?.path).toBe('.codex/agents/api-reviewer.toml')
    expect(rendered.launch).toContain(
      '"Act as the agent defined in .codex/agents/api-reviewer.toml."',
    )
    // Three lines, so no string runs over a line break, and no character TOML refuses raw.
    expect(content.split('\n')).toHaveLength(3)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the characters TOML refuses raw.
    expect(content).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f]/)
    expect(file.name).toBe('api-reviewer')
    expect(file.description).toBe('a "b" = \\c')
    expect(file.developer_instructions).toContain(`## Mission\n\n${mission}\n\n`)
  })

  it('writes a lone surrogate, which TOML has no escape for, as a replacement character', () => {
    const content = render({ ...reviewer, mission: 'a \ud800 b' }).files[0]?.content ?? ''

    expect(content).toContain('a � b')
    expect(content).not.toMatch(/\\ud800/i)
  })

  it('lets no marker into the file', () => {
    const role = {
      ...reviewer,
      description: 'coreloom-uml:end',
      mission: 'coreloom-uml:start',
      forbidden: ['coreloom-uml:end'],
    }

    expect(render(role).files[0]?.content).not.toContain('coreloom-uml:')
  })

  it('forbids commands but those that read, not "other than the checks", when a preset comes with no check', () => {
    const preset = ROLE_PRESETS.find((item) => item.slug === 'code-reviewer')
    if (preset === undefined) throw new Error('No code-reviewer preset')

    const body = agentFile(
      render(presetRole(preset, []), { ...context, checks: [] }),
    ).developer_instructions
    expect(body).not.toContain('## Done when')
    expect(body).toContain('- You must not run commands, except to read the repository.')
    expect(body).not.toContain('listed under')

    const checked = agentFile(render(presetRole(preset, ['pnpm test']))).developer_instructions
    expect(checked).toContain('## Done when\n\n- `pnpm test` passes.')
    expect(checked).toContain(
      '- You must not run commands other than the checks listed under "Done when" and those that read the repository.',
    )
  })
})
