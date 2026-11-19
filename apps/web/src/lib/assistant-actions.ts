// Pure helpers of the actions the assistant proposes on the account's work (a project, an
// architecture, agent conventions): what a card shows of one and what accepting it changes. Kept
// free of the API client so they run in Node tests.

/** What a card reads of an action: its name, the input the model gave, the target's name. */
export interface ProposedAction {
  name: string
  input: Record<string, unknown>
  /** The name of the target when the action was proposed; `null` when it has none. */
  subject: string | null
}

export type ActionRowLabel =
  'name' | 'title' | 'section' | 'text' | 'slot' | 'readyRule' | 'value' | 'in'

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
const ROWS: Record<string, (input: Record<string, unknown>, subject: string | null) => Draft[]> = {
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
}

/** The lines of an action's card, in order; a value that is missing or not a text is left out. */
export function actionRows({ name, input, subject }: ProposedAction): ActionRow[] {
  if (!Object.hasOwn(ROWS, name)) return []
  return ROWS[name](input, subject).flatMap(({ label, value, from }) => {
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
}

/** What accepting an action changes, so its lists and pages are read again; `null` when unknown. */
export function actionDomain(name: string): ActionDomain | null {
  return Object.hasOwn(DOMAINS, name) ? DOMAINS[name] : null
}
