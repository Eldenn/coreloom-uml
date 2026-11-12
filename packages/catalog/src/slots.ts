/**
 * The slot registry: one stable identifier per aspect of the work. Every question feeds exactly
 * one slot, and skills match answers through slots, so a slot is declared once here and never
 * renamed or reused. Two questionnaires combined in one configuration may not feed the same slot.
 */
export const SLOTS = {
  'typescript.any': 'Use of `any` and explicit typing',
  'typescript.strict': 'TypeScript strict mode',
  'react.granularity': 'Size of React components',
  'react.state': 'Shared state management',
  'react.styling': 'Styling approach',
  'testing.levels': 'Kinds of tests the assistant writes',
  'style.comments': 'What code comments are for',
  'workflow.changes': 'Size of changes',
  'workflow.autonomy': 'When the assistant asks before deciding',
  'tooling.package-manager': 'Package manager',
  'tooling.checks': 'Checks to run before handing back',
  'api.style': 'Style of the API',
  'api.compatibility': 'Changes to released endpoints',
  'api.validation': 'Validation of request inputs',
  'errors.handling': 'How errors are handled',
  'logging.style': 'How the code logs',
  'logging.sensitive-data': 'Sensitive data in logs',
  'database.access': 'How the database is reached',
  'database.migrations': 'Who changes the database schema',
  'database.layering': 'Where database queries live',
  'git.branching': 'Where a task is worked on',
  'git.commit-messages': 'Commit message convention',
  'git.commit-permission': 'What the assistant may commit and push',
  'git.pull-request-size': 'Size of a pull request',
  'git.never-commit': 'What is never committed',
  'git.history': 'Rewriting pushed history',
  'git.attribution': 'Crediting the assistant in commits',
  'git.ci-workflow': 'CI workflow that checks every change',
  'security.secrets': 'Reading and printing secrets',
  'security.dependencies': 'Adding a dependency',
  'security.version-pins': 'Exact versions or ranges',
  'security.input-trust': 'What input is trusted',
  'security.destructive-commands': 'Commands that delete or overwrite',
  'security.network': 'Network access',
  'security.sensitive-code': 'Changes to authentication and cryptography code',
} as const satisfies Record<string, string>

export type Slot = keyof typeof SLOTS

export function isSlot(value: string): value is Slot {
  return Object.hasOwn(SLOTS, value)
}
