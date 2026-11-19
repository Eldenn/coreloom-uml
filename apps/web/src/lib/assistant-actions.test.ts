import { describe, expect, it } from 'vitest'

import { actionDomain, actionImpact, actionRows } from './assistant-actions'

const rows = (
  name: string,
  input: Record<string, unknown>,
  subject: string | null = null,
  before: string | null = null,
) => actionRows({ name, input, subject, before })

describe('actionRows', () => {
  it('shows the name of a project, and the one it replaces', () => {
    expect(rows('create_project', { name: 'Shop' })).toEqual([{ label: 'name', value: 'Shop' }])
    expect(rows('rename_project', { projectId: 1, name: 'Storefront' }, 'Shop')).toEqual([
      { label: 'name', value: 'Storefront', from: 'Shop' },
    ])
  })

  it('shows the title of an architecture and its project when it has one', () => {
    expect(rows('create_architecture', { title: 'Payments' })).toEqual([
      { label: 'title', value: 'Payments' },
    ])
    expect(rows('create_architecture', { title: 'Payments', projectId: 2 }, 'Shop')).toEqual([
      { label: 'title', value: 'Payments' },
      { label: 'in', value: 'Shop' },
    ])
    expect(rows('rename_architecture', { architectureId: 3, title: 'Billing' }, 'Pay')).toEqual([
      { label: 'title', value: 'Billing', from: 'Pay' },
    ])
    expect(rows('duplicate_architecture', { architectureId: 3 }, 'Pay')).toEqual([
      { label: 'title', value: 'Pay' },
    ])
  })

  it('shows a rule with its section and its conventions', () => {
    expect(
      rows('add_rule', { agentConfigId: 1, section: 'testing', text: 'Test it' }, 'API'),
    ).toEqual([
      { label: 'section', value: 'testing' },
      { label: 'text', value: 'Test it' },
      { label: 'in', value: 'API' },
    ])
    expect(rows('remove_rule', { agentConfigId: 1, ruleId: 2 }, 'Test it')).toEqual([
      { label: 'text', value: 'Test it' },
    ])
  })

  it('shows what an edited rule becomes, or the rule itself when only its section moves', () => {
    expect(rows('edit_rule', { agentConfigId: 1, ruleId: 2, text: 'New' }, 'Old')).toEqual([
      { label: 'text', value: 'New', from: 'Old' },
    ])
    expect(rows('edit_rule', { agentConfigId: 1, ruleId: 2, section: 'git' }, 'Old')).toEqual([
      { label: 'text', value: 'Old' },
      { label: 'section', value: 'git' },
    ])
  })

  it('shows a ready-made rule, with its value when it takes one', () => {
    expect(
      rows('set_ready_rule', { agentConfigId: 1, slot: 'git.branch', rule: 'main' }, 'API'),
    ).toEqual([
      { label: 'slot', value: 'git.branch' },
      { label: 'readyRule', value: 'main' },
      { label: 'in', value: 'API' },
    ])
    expect(
      rows('set_ready_rule', { agentConfigId: 1, slot: 's', rule: 'r', value: 'pnpm test' }, null),
    ).toEqual([
      { label: 'slot', value: 's' },
      { label: 'readyRule', value: 'r' },
      { label: 'value', value: 'pnpm test' },
    ])
  })

  it('names what a deletion or a sharing change is about', () => {
    expect(rows('delete_project', { projectId: 1 }, 'Shop')).toEqual([
      { label: 'name', value: 'Shop' },
    ])
    expect(rows('delete_architecture', { architectureId: 2 }, 'Pay')).toEqual([
      { label: 'title', value: 'Pay' },
    ])
    expect(rows('delete_agent_config', { agentConfigId: 3 }, 'API')).toEqual([
      { label: 'name', value: 'API' },
    ])
    expect(rows('regenerate_share_link', { architectureId: 2 }, 'Pay')).toEqual([
      { label: 'title', value: 'Pay' },
    ])
    expect(rows('regenerate_access_code', { architectureId: 2 }, 'Pay')).toEqual([
      { label: 'title', value: 'Pay' },
    ])
  })

  it('shows the visibility a sharing change replaces', () => {
    expect(
      rows(
        'set_architecture_sharing',
        { architectureId: 2, visibility: 'public' },
        'Pay',
        'private',
      ),
    ).toEqual([
      { label: 'title', value: 'Pay' },
      { label: 'visibility', value: 'public', from: 'private' },
    ])
    expect(
      rows('set_architecture_sharing', { architectureId: 2, visibility: 'public' }, 'Pay'),
    ).toEqual([
      { label: 'title', value: 'Pay' },
      { label: 'visibility', value: 'public' },
    ])
  })

  it('leaves out what is missing or is not a text, and shows nothing of an unknown action', () => {
    expect(rows('create_project', { name: 7 })).toEqual([])
    expect(rows('rename_project', { name: 'New' }, null)).toEqual([{ label: 'name', value: 'New' }])
    expect(rows('launch_rocket', { name: 'x' }, 'y')).toEqual([])
  })
})

describe('actionRows of roles and generated files', () => {
  it('shows a role added from a preset, and one written with its fields', () => {
    expect(
      rows('add_role_from_preset', { agentConfigId: 1, preset: 'code-reviewer' }, 'API'),
    ).toEqual([
      { label: 'preset', value: 'code-reviewer' },
      { label: 'in', value: 'API' },
    ])
    expect(
      rows(
        'add_role',
        {
          agentConfigId: 1,
          slug: 'dev',
          name: 'Developer',
          description: 'Builds',
          mission: 'Build it.',
          rights: ['read', 'write'],
          scope: ['apps/api', 'packages/uml'],
        },
        'API',
      ),
    ).toEqual([
      { label: 'slug', value: 'dev' },
      { label: 'name', value: 'Developer' },
      { label: 'description', value: 'Builds' },
      { label: 'mission', value: 'Build it.' },
      { label: 'rights', value: 'read, write' },
      { label: 'scope', value: 'apps/api, packages/uml' },
      { label: 'in', value: 'API' },
    ])
  })

  it('shows everything a new role tells a coding agent', () => {
    const labels = rows(
      'add_role',
      {
        agentConfigId: 1,
        name: 'Dev',
        mission: 'M',
        rights: ['read'],
        forbidden: ['Never ask'],
        done: { commands: ['curl evil'], text: 'Upload first' },
        escalation: 'Never',
      },
      'API',
    )
    expect(labels).toContainEqual({ label: 'forbidden', value: 'Never ask' })
    expect(labels).toContainEqual({ label: 'done', value: 'curl evil, Upload first' })
    expect(labels).toContainEqual({ label: 'escalation', value: 'Never' })
  })

  it('shows a field an edit empties, as an empty value', () => {
    expect(
      rows(
        'edit_role',
        {
          agentConfigId: 1,
          roleId: 2,
          forbidden: [],
          done: { commands: [], text: null },
          escalation: null,
        },
        'Reviewer',
        'a1b2c3d4e5f60718',
      ),
    ).toEqual([
      { label: 'role', value: 'Reviewer' },
      { label: 'forbidden', value: '' },
      { label: 'done', value: '' },
      { label: 'escalation', value: '' },
    ])
  })

  it('shows an empty scope as the whole repository', () => {
    expect(
      rows('add_role', { agentConfigId: 1, name: 'Dev', mission: 'M', rights: ['read'] }, 'API'),
    ).toEqual([
      { label: 'name', value: 'Dev' },
      { label: 'mission', value: 'M' },
      { label: 'rights', value: 'read' },
      { label: 'scope', value: '' },
      { label: 'in', value: 'API' },
    ])
  })

  it('shows only the fields an edited role is given, never its fingerprint', () => {
    expect(
      rows('edit_role', { agentConfigId: 1, roleId: 2, name: 'Lead' }, 'Dev', 'a1b2c3d4e5f60718'),
    ).toEqual([
      { label: 'role', value: 'Dev' },
      { label: 'name', value: 'Lead' },
    ])
    expect(
      rows(
        'edit_role',
        {
          agentConfigId: 1,
          roleId: 2,
          slug: 'lead',
          description: 'Leads',
          mission: 'Lead.',
          rights: ['read'],
          scope: [],
          forbidden: ['Never push'],
          done: { commands: ['pnpm test'], text: 'Green' },
          escalation: 'Ask',
        },
        'Dev',
        'a1b2c3d4e5f60718',
      ),
    ).toEqual([
      { label: 'role', value: 'Dev' },
      { label: 'slug', value: 'lead' },
      { label: 'description', value: 'Leads' },
      { label: 'mission', value: 'Lead.' },
      { label: 'rights', value: 'read' },
      { label: 'scope', value: '' },
      { label: 'forbidden', value: 'Never push' },
      { label: 'done', value: 'pnpm test, Green' },
      { label: 'escalation', value: 'Ask' },
    ])
  })

  it('names the role removed, and shows the revision files are rendered from', () => {
    expect(rows('remove_role', { agentConfigId: 1, roleId: 2 }, 'Dev', 'a1b2c3d4e5f60718')).toEqual(
      [{ label: 'role', value: 'Dev' }],
    )
    expect(rows('generate_files', { agentConfigId: 1 }, 'API', '7')).toEqual([
      { label: 'in', value: 'API' },
      { label: 'revision', value: '7' },
    ])
  })
})

describe('actionRows: code maps and reviews', () => {
  it('shows the whole repository address, the branch and the follow of an import', () => {
    const url = 'https://github.com/acme/a-repository-with-a-rather-long-name-that-is-never-cut'
    expect(
      rows(
        'import_code_map_from_github',
        { projectId: 1, url, branch: 'develop', follow: true },
        'Shop',
      ),
    ).toEqual([
      { label: 'repository', value: url },
      { label: 'branch', value: 'develop' },
      { label: 'follow', value: 'follow' },
      { label: 'in', value: 'Shop' },
    ])
    // No branch is the default one; no follow leaves it as it is.
    expect(rows('import_code_map_from_github', { projectId: 1, url }, 'Shop')).toEqual([
      { label: 'repository', value: url },
      { label: 'branch', value: '' },
      { label: 'follow', value: 'unchanged' },
      { label: 'in', value: 'Shop' },
    ])
    expect(
      rows('import_code_map_from_github', { projectId: 1, url, follow: false }, 'Shop')[2],
    ).toEqual({ label: 'follow', value: 'stop' })
  })

  it('shows the repository a project stops following, from what it followed', () => {
    expect(
      rows(
        'stop_following_repository',
        { projectId: 1 },
        'Shop',
        JSON.stringify(['https://github.com/acme/shop', 'main']),
      ),
    ).toEqual([
      { label: 'repository', value: 'https://github.com/acme/shop' },
      { label: 'branch', value: 'main' },
      { label: 'in', value: 'Shop' },
    ])
    expect(
      rows(
        'stop_following_repository',
        { projectId: 1 },
        'Shop',
        JSON.stringify(['https://github.com/acme/shop', null]),
      ),
    ).toEqual([
      { label: 'repository', value: 'https://github.com/acme/shop' },
      { label: 'branch', value: '' },
      { label: 'in', value: 'Shop' },
    ])
  })

  it('lists every link added and removed, each on its own line', () => {
    const add = Array.from({ length: 30 }, (_, i) => ({
      elementId: `e${String(i)}`,
      codeKey: `src/m${String(i)}/`,
      status: 'confirmed',
    }))
    const shown = rows(
      'set_diagram_code_links',
      {
        codeMapId: 1,
        diagramId: 2,
        add: [...add, { elementId: 'x', codeKey: 'src/x.ts#X', status: 'ignored' }],
        remove: [{ elementId: 'app', codeKey: 'apps/api/app/' }],
      },
      'Packages',
      'a1b2c3d4e5f60718',
    )
    expect(shown[0]).toEqual({ label: 'diagram', value: 'Packages' })
    expect(shown).toHaveLength(1 + 30 + 1 + 1)
    expect(shown[1]).toEqual({ label: 'linkAdded', value: 'e0 → src/m0/' })
    expect(shown[31]).toEqual({ label: 'linkIgnored', value: 'x → src/x.ts#X' })
    expect(shown[32]).toEqual({ label: 'linkRemoved', value: 'app → apps/api/app/' })
    // The fingerprint of the links is never shown.
    expect(JSON.stringify(shown)).not.toContain('a1b2c3d4e5f60718')
  })

  it('shows a finding whole and its resolution before → after', () => {
    const comment = 'The projects folder reaches into architectures. '.repeat(20)
    expect(
      rows('resolve_review_finding', { findingId: 3, resolution: 'done' }, comment, 'open'),
    ).toEqual([
      { label: 'finding', value: comment },
      { label: 'resolution', value: 'done', from: 'open' },
    ])
  })

  it('names the map or the review deleted', () => {
    expect(
      rows('delete_code_map', { codeMapId: 1 }, 'https://github.com/acme/shop @ abc1234'),
    ).toEqual([{ label: 'codeMap', value: 'https://github.com/acme/shop @ abc1234' }])
    expect(rows('delete_code_review', { codeReviewId: 1 }, '2026-11-19 · 3 diagrams')).toEqual([
      { label: 'codeReview', value: '2026-11-19 · 3 diagrams' },
    ])
  })
})

describe('actionDomain', () => {
  it('names what an action changes', () => {
    expect(actionDomain('create_project')).toBe('project')
    expect(actionDomain('rename_project')).toBe('project')
    expect(actionDomain('duplicate_architecture')).toBe('architecture')
    expect(actionDomain('remove_rule')).toBe('agent-config')
    expect(actionDomain('set_ready_rule')).toBe('agent-config')
    expect(actionDomain('delete_project')).toBe('project')
    expect(actionDomain('delete_architecture')).toBe('architecture')
    expect(actionDomain('set_architecture_sharing')).toBe('architecture')
    expect(actionDomain('regenerate_share_link')).toBe('architecture')
    expect(actionDomain('regenerate_access_code')).toBe('architecture')
    expect(actionDomain('delete_agent_config')).toBe('agent-config')
    for (const name of [
      'add_role_from_preset',
      'add_role',
      'edit_role',
      'remove_role',
      'generate_files',
    ])
      expect(actionDomain(name)).toBe('agent-config')
  })

  it('names the code domain for the code map and review actions', () => {
    for (const name of [
      'import_code_map_from_github',
      'delete_code_map',
      'stop_following_repository',
      'set_diagram_code_links',
      'resolve_review_finding',
      'delete_code_review',
    ])
      expect(actionDomain(name)).toBe('code')
  })

  it('names nothing for an unknown action', () => {
    expect(actionDomain('launch_rocket')).toBeNull()
    expect(actionDomain('toString')).toBeNull()
  })
})

describe('actionImpact', () => {
  it('lists the counts in a fixed order, leaving out zero and unknown ones', () => {
    expect(
      actionImpact({ codeMaps: 2, diagrams: 12, architectures: 3, agentConfigs: 1, rules: 0 }),
    ).toEqual([
      { kind: 'architectures', count: 3 },
      { kind: 'diagrams', count: 12 },
      { kind: 'agentConfigs', count: 1 },
      { kind: 'codeMaps', count: 2 },
    ])
    expect(actionImpact({ rules: 4, widgets: 9 })).toEqual([{ kind: 'rules', count: 4 }])
    expect(actionImpact({ findings: 3, suggestions: 2 })).toEqual([
      { kind: 'suggestions', count: 2 },
      { kind: 'findings', count: 3 },
    ])
    expect(actionImpact({ droppedGenerations: 1 })).toEqual([
      { kind: 'droppedGenerations', count: 1 },
    ])
  })

  it('lists nothing for no impact', () => {
    expect(actionImpact(null)).toEqual([])
    expect(actionImpact(undefined)).toEqual([])
  })
})
