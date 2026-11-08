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
} as const satisfies Record<string, string>

export type Slot = keyof typeof SLOTS

export function isSlot(value: string): value is Slot {
  return Object.hasOwn(SLOTS, value)
}
