// Pure helpers of the actions the assistant proposes on the account's work (a project, an
// architecture, agent conventions, code maps and reviews): what a card shows of one and what accepting it changes. Kept
// free of the API client so they run in Node tests.

/** What a card reads of an action: its name, the input the model gave, the target's name. */
export interface ProposedAction {
  name: string
  input: Record<string, unknown>
  /** The name of the target when the action was proposed; `null` when it has none. */
  subject: string | null
  /**
   * The state the action changes, as it was when proposed: a visibility, a revision, or a role's
   * fingerprint. Each action decides whether its card shows it.
   */
  before?: string | null
}

export type ActionRowLabel =
  | 'name'
  | 'title'
  | 'section'
  | 'text'
  | 'slot'
  | 'readyRule'
  | 'value'
  | 'in'
  | 'targets'
  | 'visibility'
  | 'preset'
  | 'role'
  | 'slug'
  | 'description'
  | 'mission'
  | 'rights'
  | 'scope'
  | 'forbidden'
  | 'done'
  | 'escalation'
  | 'revision'
  | 'repository'
  | 'branch'
  | 'follow'
  | 'followedNow'
  | 'codeMap'
  | 'diagram'
  | 'linkAdded'
  | 'linkIgnored'
  | 'linkSuggested'
  | 'linkRemoved'
  | 'finding'
  | 'resolution'
  | 'codeReview'
  | 'requirement'
  | 'category'
  | 'priority'
  | 'measure'
  | 'question'
  | 'context'
  | 'option'
  | 'optionFor'
  | 'optionAgainst'
  | 'chosen'
  | 'consequences'
  | 'status'
  | 'replaces'
  | 'linkedRequirements'
  | 'linkedDiagrams'
  | 'linkedPart'
  | 'notes'
  | 'project'
  | 'skillAdded'
  | 'skillRemoved'
  | 'sources'
  | 'keptFrom'

/**
 * One line of a card; with `from`, the value replaces it. A list is one text, comma-separated;
 * an empty `scope` is the whole repository, any other empty value is a field the action empties.
 */
export interface ActionRow {
  label: ActionRowLabel
  value: string
  from?: string
}

interface Draft {
  label: ActionRowLabel
  value: unknown
  /** Shown even when empty: the input names it. */
  given?: boolean
  from?: string | null
}

/** The texts of a list, comma-separated; not a list is left as it is. */
function list(value: unknown): unknown {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item !== '').join(', ')
    : value
}

/** What ends a role's work: its commands, then its text. */
function done(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const { commands, text } = value as { commands?: unknown; text?: unknown }
  const lines: unknown[] = Array.isArray(commands) ? commands : []
  return list([...lines, text])
}

const ROLE_FIELDS = [
  'slug',
  'name',
  'description',
  'mission',
  'rights',
  'scope',
  'forbidden',
  'done',
  'escalation',
] as const

/**
 * Every field of a role the input gives, in the order of the role form: a role is what a coding
 * agent is told, so a card hides none of it. A field given empty (an edit that clears it) is
 * shown, as an empty value; one not given is left out.
 */
const roleRows = (input: Record<string, unknown>): Draft[] =>
  ROLE_FIELDS.filter((field) => Object.hasOwn(input, field)).map((field) => ({
    label: field,
    value: (field === 'done' ? done(input.done) : list(input[field])) ?? '',
    given: true,
  }))

/** The repository a project follows, stored as `[url, branch]`; an empty branch is the default. */
function followed(before: string | null): Draft[] {
  try {
    const [url, branch] = JSON.parse(before ?? '') as [unknown, unknown]
    return [
      { label: 'repository', value: url },
      { label: 'branch', value: branch ?? '', given: true },
    ]
  } catch {
    return []
  }
}

/** Whether an import makes the project follow the repository, stop, or leaves it as it is. */
/** The repository a project follows, with its branch when it names one, in one text. */
function followedNow(before: string | null): unknown {
  const rows = followed(before)
  if (rows.length === 0) return undefined
  const [repository, branch] = rows.map((row) => row.value)
  if (typeof repository !== 'string') return undefined
  return typeof branch === 'string' && branch !== '' ? `${repository} (${branch})` : repository
}

const FOLLOW = { true: 'follow', false: 'stop', undefined: 'unchanged' } as const

const LINK_LABELS: Record<string, ActionRowLabel> = {
  confirmed: 'linkAdded',
  ignored: 'linkIgnored',
  suggested: 'linkSuggested',
}

/** Each link named, on its own line: as many as there are, none cut. */
function linkRows(value: unknown, label: (link: { status?: unknown }) => ActionRowLabel): Draft[] {
  if (!Array.isArray(value)) return []
  return (value as { elementId?: unknown; codeKey?: unknown; status?: unknown }[]).map((link) => ({
    label: label(link),
    value: `${String(link.elementId)} → ${String(link.codeKey)}`,
  }))
}

/** Each rule a creation carries, on its own line with its section: none cut. */
function ruleRows(value: unknown): Draft[] {
  if (!Array.isArray(value)) return []
  return (value as { section?: unknown; text?: unknown }[]).map((rule) => ({
    label: 'text',
    value: `${String(rule.section)}: ${String(rule.text)}`,
  }))
}

/** Each ready-made rule a creation holds, on its own line: its slot, its rule and its text. */
function readyRuleRows(value: unknown): Draft[] {
  if (!Array.isArray(value)) return []
  return (value as { slot?: unknown; rule?: unknown; value?: unknown }[]).map((held) => ({
    label: 'readyRule',
    value:
      typeof held.value === 'string' && held.value !== ''
        ? `${String(held.slot)}: ${String(held.rule)} (${held.value})`
        : `${String(held.slot)}: ${String(held.rule)}`,
  }))
}

/** `before` read as JSON: an object, or none when it is not one. */
function parsed(before: string | null): Record<string, unknown> {
  try {
    const value = JSON.parse(before ?? '') as unknown
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** A changed field of agent conventions, as it becomes and as it was; none when left out. */
function changed(
  input: Record<string, unknown>,
  was: Record<string, unknown>,
  key: string,
  label: ActionRowLabel,
): Draft[] {
  if (!Object.hasOwn(input, key)) return []
  const from = list(was[key] ?? '')
  return [
    {
      label,
      value: list(input[key] ?? ''),
      from: typeof from === 'string' ? from : null,
      given: true,
    },
  ]
}

/** The slugs of a list, one row each. */
function slugRows(value: unknown, label: ActionRowLabel): Draft[] {
  return Array.isArray(value) ? (value as unknown[]).map((slug) => ({ label, value: slug })) : []
}

/** The source a merge keeps for each conflict, by the name the source had when proposed. */
function choiceRows(choices: unknown, before: string | null): Draft[] {
  if (typeof choices !== 'object' || choices === null) return []
  const names = parsed(before)
  const nameOf = (id: unknown) => {
    const source = names[String(id)]
    return typeof source === 'object' && source !== null && 'name' in source
      ? String(source.name)
      : `#${String(id)}`
  }
  const { readyRules, roles } = choices as { readyRules?: unknown; roles?: unknown }
  const rows = (items: unknown, key: 'slot' | 'slug'): Draft[] =>
    Array.isArray(items)
      ? (items as Record<string, unknown>[]).map((item) => ({
          label: 'keptFrom',
          value: `${String(item[key])}: ${nameOf(item.sourceId)}`,
        }))
      : []
  return [...rows(readyRules, 'slot'), ...rows(roles, 'slug')]
}

/** The ids of a list, as `#3, #5`. */
const idList = (value: unknown): unknown =>
  Array.isArray(value) ? value.map((id) => `#${String(id)}`).join(', ') : undefined

/** Everything a decision's input says: each option with what speaks for and against it. */
function decisionRows(input: Record<string, unknown>): Draft[] {
  const options = Array.isArray(input.options)
    ? (input.options as { name?: unknown; pros?: unknown; cons?: unknown }[])
    : []
  return [
    { label: 'question', value: input.title },
    { label: 'context', value: input.context },
    ...options.flatMap((option): Draft[] => [
      { label: 'option', value: option.name },
      { label: 'optionFor', value: option.pros },
      { label: 'optionAgainst', value: option.cons },
    ]),
    { label: 'chosen', value: input.chosen },
    { label: 'consequences', value: input.consequences },
    // Left out, the decision is still open.
    { label: 'status', value: input.status ?? 'proposed' },
    { label: 'linkedRequirements', value: idList(input.requirementIds) },
    { label: 'linkedDiagrams', value: idList(input.diagramIds) },
    // Each part named, on its own line: as many as there are, none cut.
    ...(Array.isArray(input.parts)
      ? (input.parts as { diagramId?: unknown; label?: unknown }[])
      : []
    ).map((part): Draft => ({
      label: 'linkedPart',
      value: `#${String(part.diagramId)}: ${String(part.label)}`,
    })),
  ]
}

/** What the owner would otherwise have to open the target to know. */
const ROWS: Record<
  string,
  (input: Record<string, unknown>, subject: string | null, before: string | null) => Draft[]
> = {
  create_project: (input) => [{ label: 'name', value: input.name }],
  rename_project: (input, subject) => [{ label: 'name', value: input.name, from: subject }],
  create_architecture: (input, subject) => [
    { label: 'title', value: input.title },
    { label: 'in', value: subject },
  ],
  rename_architecture: (input, subject) => [{ label: 'title', value: input.title, from: subject }],
  duplicate_architecture: (_input, subject) => [{ label: 'title', value: subject }],
  // Every rule ends up in a file a coding agent reads: all of them are shown.
  create_agent_config: (input, subject) => [
    { label: 'name', value: input.name },
    { label: 'in', value: subject },
    { label: 'targets', value: list(input.targets) },
    ...readyRuleRows(input.readyRules),
    ...ruleRows(input.rules),
  ],
  add_rule: (input, subject) => [
    { label: 'section', value: input.section },
    { label: 'text', value: input.text },
    { label: 'in', value: subject },
  ],
  edit_rule: (input, subject) => [
    typeof input.text === 'string'
      ? { label: 'text', value: input.text, from: subject }
      : { label: 'text', value: subject },
    { label: 'section', value: input.section },
  ],
  remove_rule: (_input, subject) => [{ label: 'text', value: subject }],
  set_ready_rule: (input, subject) => [
    { label: 'slot', value: input.slot },
    { label: 'readyRule', value: input.rule },
    { label: 'value', value: input.value },
    { label: 'in', value: subject },
  ],
  // `before` holds what the conventions are now: every field changed shows what it was.
  update_agent_config: (input, subject, before) => {
    const was = parsed(before)
    return [
      ...(Object.hasOwn(input, 'name')
        ? changed(input, was, 'name', 'name')
        : [{ label: 'name', value: subject } satisfies Draft]),
      ...changed(input, was, 'targets', 'targets'),
      ...changed(input, was, 'notes', 'notes'),
      // `movesTo` is the name of the project they move to; none takes them out of any project.
      ...(Object.hasOwn(input, 'projectId')
        ? changed({ project: was.movesTo }, was, 'project', 'project')
        : []),
    ]
  },
  // Left out, the rule is every rule of the slot.
  remove_ready_rule: (input, subject) => [
    { label: 'slot', value: input.slot },
    { label: 'readyRule', value: input.rule ?? '', given: true },
    { label: 'in', value: subject },
  ],
  // `before` is a fingerprint of the skills held: never shown.
  change_skills: (input, subject) => [
    ...slugRows(input.add, 'skillAdded'),
    ...slugRows(input.remove, 'skillRemoved'),
    { label: 'in', value: subject },
  ],
  merge_agent_configs: (input, subject, before) => [
    { label: 'name', value: input.name },
    { label: 'sources', value: subject },
    ...choiceRows(input.choices, before),
  ],
  delete_project: (_input, subject) => [{ label: 'name', value: subject }],
  delete_architecture: (_input, subject) => [{ label: 'title', value: subject }],
  delete_agent_config: (_input, subject) => [{ label: 'name', value: subject }],
  set_architecture_sharing: (input, subject, before) => [
    { label: 'title', value: subject },
    { label: 'visibility', value: input.visibility, from: before },
  ],
  regenerate_share_link: (_input, subject) => [{ label: 'title', value: subject }],
  regenerate_access_code: (_input, subject) => [{ label: 'title', value: subject }],
  add_role_from_preset: (input, subject) => [
    { label: 'preset', value: input.preset },
    { label: 'in', value: subject },
  ],
  add_role: (input, subject) => [
    // Left out, the role works in the whole repository.
    ...roleRows({ ...input, scope: input.scope ?? [] }),
    { label: 'in', value: subject },
  ],
  // `before` is a fingerprint of the role: never shown.
  edit_role: (input, subject) => [{ label: 'role', value: subject }, ...roleRows(input)],
  remove_role: (_input, subject) => [{ label: 'role', value: subject }],
  // `before` is the revision the files are rendered from.
  generate_files: (_input, subject, before) => [
    { label: 'in', value: subject },
    { label: 'revision', value: before },
  ],
  // A model that may have read hostile text chose the address: all of it is shown.
  import_code_map_from_github: (input, subject, before) => [
    { label: 'repository', value: input.url },
    // Left out, the repository's default branch.
    { label: 'branch', value: input.branch ?? '', given: true },
    { label: 'follow', value: FOLLOW[String(input.follow) as keyof typeof FOLLOW] },
    // `before` is what the project follows now, when the import changes it.
    { label: 'followedNow', value: followedNow(before) },
    { label: 'in', value: subject },
  ],
  delete_code_map: (_input, subject) => [{ label: 'codeMap', value: subject }],
  stop_following_repository: (_input, subject, before) => [
    ...followed(before),
    { label: 'in', value: subject },
  ],
  // `before` is a fingerprint of the diagram's links: never shown.
  set_diagram_code_links: (input, subject) => [
    { label: 'diagram', value: subject },
    ...linkRows(input.add, (link) =>
      typeof link.status === 'string' && Object.hasOwn(LINK_LABELS, link.status)
        ? LINK_LABELS[link.status]
        : 'linkAdded',
    ),
    ...linkRows(input.remove, () => 'linkRemoved'),
  ],
  resolve_review_finding: (input, subject, before) => [
    { label: 'finding', value: subject },
    { label: 'resolution', value: input.resolution, from: before },
  ],
  delete_code_review: (_input, subject) => [{ label: 'codeReview', value: subject }],
  add_requirement: (input, subject) => [
    { label: 'requirement', value: input.statement },
    { label: 'category', value: input.category },
    { label: 'priority', value: input.priority },
    { label: 'measure', value: input.measure },
    { label: 'in', value: subject },
  ],
  add_decision: (input, subject) => [...decisionRows(input), { label: 'in', value: subject }],
  // `before` is the replaced decision's status: it only has to stay the same.
  supersede_decision: (input, subject) => [
    { label: 'replaces', value: subject },
    ...decisionRows(input),
  ],
}

/** Whether a row is shown: a text, or an empty one the input names. */
function shows(draft: Draft): draft is Draft & { value: string } {
  return typeof draft.value === 'string' && (draft.value !== '' || draft.given === true)
}

/** The lines of an action's card, in order; a value that is missing or not a text is left out. */
export function actionRows({ name, input, subject, before }: ProposedAction): ActionRow[] {
  if (!Object.hasOwn(ROWS, name)) return []
  return ROWS[name](input, subject, before ?? null).flatMap((draft) => {
    if (!shows(draft)) return []
    const { label, value, from } = draft
    return [from == null ? { label, value } : { label, value, from }]
  })
}

export type ActionDomain = 'project' | 'architecture' | 'agent-config' | 'code' | 'design'

const DOMAINS: Record<string, ActionDomain> = {
  create_project: 'project',
  rename_project: 'project',
  create_architecture: 'architecture',
  rename_architecture: 'architecture',
  duplicate_architecture: 'architecture',
  create_agent_config: 'agent-config',
  add_rule: 'agent-config',
  edit_rule: 'agent-config',
  remove_rule: 'agent-config',
  set_ready_rule: 'agent-config',
  update_agent_config: 'agent-config',
  remove_ready_rule: 'agent-config',
  change_skills: 'agent-config',
  merge_agent_configs: 'agent-config',
  delete_project: 'project',
  delete_architecture: 'architecture',
  set_architecture_sharing: 'architecture',
  regenerate_share_link: 'architecture',
  regenerate_access_code: 'architecture',
  delete_agent_config: 'agent-config',
  add_role_from_preset: 'agent-config',
  add_role: 'agent-config',
  edit_role: 'agent-config',
  remove_role: 'agent-config',
  generate_files: 'agent-config',
  import_code_map_from_github: 'code',
  delete_code_map: 'code',
  stop_following_repository: 'code',
  set_diagram_code_links: 'code',
  resolve_review_finding: 'code',
  delete_code_review: 'code',
  add_requirement: 'design',
  add_decision: 'design',
  supersede_decision: 'design',
}

/** What accepting an action changes, so its lists and pages are read again; `null` when unknown. */
export function actionDomain(name: string): ActionDomain | null {
  return Object.hasOwn(DOMAINS, name) ? DOMAINS[name] : null
}

/** What an action takes with it, in the order a card lists it. */
const IMPACT_KINDS = [
  'architectures',
  'diagrams',
  'agentConfigs',
  'codeMaps',
  'codeReviews',
  'rules',
  'readyRules',
  'roles',
  'skills',
  'generations',
  'droppedGenerations',
  'droppedCodeMaps',
  'suggestions',
  'findings',
] as const
export type ImpactKind = (typeof IMPACT_KINDS)[number]

/** The counts of an action's impact, in order; zero and unknown ones are left out. */
export function actionImpact(
  impact: Record<string, number> | null | undefined,
): { kind: ImpactKind; count: number }[] {
  return IMPACT_KINDS.flatMap((kind) => {
    const count = impact?.[kind] ?? 0
    return count > 0 ? [{ kind, count }] : []
  })
}
