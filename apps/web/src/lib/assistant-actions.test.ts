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
  })

  it('lists nothing for no impact', () => {
    expect(actionImpact(null)).toEqual([])
    expect(actionImpact(undefined)).toEqual([])
  })
})
