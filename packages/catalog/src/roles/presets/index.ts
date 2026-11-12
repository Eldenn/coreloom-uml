import { type Right, ROLE_LIST_MAX, type Role } from '../role.ts'
import { AGENCY_AGENTS_COMMIT, type RolePreset } from './agency-agents.ts'

export {
  AGENCY_AGENTS_COMMIT,
  AGENCY_AGENTS_REPOSITORY,
  ROLE_PRESETS,
  type RolePreset,
} from './agency-agents.ts'

/**
 * The presets that advise or review without writing code, classified by hand from their mission:
 * re-read a mission after vendoring a new commit before adding or keeping its slug here.
 */
export const READ_ONLY_PRESETS: ReadonlySet<string> = new Set([
  // Audits documents against parsers and hands back scorecards.
  'ats-validator-architect',
  // Delivers architecture designs and specifications.
  'backend-architect',
  'code-reviewer',
  // Reads and traces code to explain it.
  'codebase-onboarding-engineer',
  // Sizes power systems and reviews drawings; hands rules over as specifications, not code.
  'electrical-engineer',
  // Coordinates the response and writes post-mortems.
  'incident-response-commander',
  // Service management process, no code.
  'it-service-manager',
  // Designs and reviews agent pipelines.
  'multi-agent-systems-architect',
  // Designs, compares trade-offs and records decisions.
  'software-architect',
])

const READ_ONLY_RIGHTS: readonly Right[] = ['read', 'run-checks']
const WRITING_RIGHTS: readonly Right[] = ['read', 'write', 'run-checks', 'shell', 'commit']

/** A role copied from a preset: default rights, done when the project's checks pass. */
export function presetRole(preset: RolePreset, checks: readonly string[]): Role {
  return {
    slug: preset.slug,
    name: preset.name,
    description: preset.description,
    mission: preset.mission,
    rights: [...(READ_ONLY_PRESETS.has(preset.slug) ? READ_ONLY_RIGHTS : WRITING_RIGHTS)],
    scope: [],
    forbidden: [],
    done: { commands: checks.slice(0, ROLE_LIST_MAX), text: null },
    escalation: null,
    source: { preset: preset.slug, commit: AGENCY_AGENTS_COMMIT },
  }
}
