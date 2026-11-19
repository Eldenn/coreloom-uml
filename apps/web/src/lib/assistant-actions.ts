// Pure helpers of the actions the assistant proposes on the account's work (a project, an
// architecture, agent conventions): what a card shows of one and what accepting it changes. Kept
// free of the API client so they run in Node tests.

/** What a card reads of an action: its name, the input the model gave, the target's name. */
export interface ProposedAction {
  name: string
  input: Record<string, unknown>
  /** The name of the target when the action was proposed; `null` when it has none. */
  subject: string | null
  /** The state the action changes, as it was when proposed (a visibility). */
  before?: string | null
}

export type ActionRowLabel =
  'name' | 'title' | 'section' | 'text' | 'slot' | 'readyRule' | 'value' | 'in' | 'visibility'

/** One line of a card; with `from`, the value replaces it. */
export interface ActionRow {
  label: ActionRowLabel
  value: string
  from?: string
}

interface Draft {
  label: ActionRowLabel
  value: unknown
  from?: string | null
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
  delete_project: (_input, subject) => [{ label: 'name', value: subject }],
  delete_architecture: (_input, subject) => [{ label: 'title', value: subject }],
  delete_agent_config: (_input, subject) => [{ label: 'name', value: subject }],
  set_architecture_sharing: (input, subject, before) => [
    { label: 'title', value: subject },
    { label: 'visibility', value: input.visibility, from: before },
  ],
  regenerate_share_link: (_input, subject) => [{ label: 'title', value: subject }],
  regenerate_access_code: (_input, subject) => [{ label: 'title', value: subject }],
}

/** The lines of an action's card, in order; a value that is missing or not a text is left out. */
export function actionRows({ name, input, subject, before }: ProposedAction): ActionRow[] {
  if (!Object.hasOwn(ROWS, name)) return []
  return ROWS[name](input, subject, before ?? null).flatMap(({ label, value, from }) => {
    if (typeof value !== 'string' || value === '') return []
    return [from == null ? { label, value } : { label, value, from }]
  })
}

export type ActionDomain = 'project' | 'architecture' | 'agent-config'

const DOMAINS: Record<string, ActionDomain> = {
  create_project: 'project',
  rename_project: 'project',
  create_architecture: 'architecture',
  rename_architecture: 'architecture',
  duplicate_architecture: 'architecture',
  add_rule: 'agent-config',
  edit_rule: 'agent-config',
  remove_rule: 'agent-config',
  set_ready_rule: 'agent-config',
  delete_project: 'project',
  delete_architecture: 'architecture',
  set_architecture_sharing: 'architecture',
  regenerate_share_link: 'architecture',
  regenerate_access_code: 'architecture',
  delete_agent_config: 'agent-config',
}

/** What accepting an action changes, so its lists and pages are read again; `null` when unknown. */
export function actionDomain(name: string): ActionDomain | null {
  return Object.hasOwn(DOMAINS, name) ? DOMAINS[name] : null
}

/** What a deletion takes with it, in the order a card lists it. */
const IMPACT_KINDS = [
  'architectures',
  'diagrams',
  'agentConfigs',
  'codeMaps',
  'codeReviews',
  'rules',
  'readyRules',
  'roles',
  'generations',
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
