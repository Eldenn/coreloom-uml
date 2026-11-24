import { ROLE_PRESETS } from './roles/presets/agency-agents.ts'
import { PRESET_TOPICS } from './roles/presets/topics.ts'
import type { Skill } from './schemas.ts'
import type { Target } from './targets.ts'
import type { Topic } from './topics.ts'

/** At most this many ready-made roles are suggested, each with this many skills at most. */
export const ROLE_SUGGESTIONS_MAX = 5
export const ROLE_SKILLS_MAX = 3

export type RoleSuggestion = {
  preset: string
  /** The tags it shares with the configuration. */
  topics: Topic[]
  /** Skills sharing its tags, that load in one of the configuration's targets. */
  skills: { id: string; name: string; url: string }[]
}

/**
 * The ready-made roles sharing a tag with the configuration's (`heldTopics`), the most tags
 * shared first, then in catalog order; a role without tags is never suggested. Each comes with
 * the skills sharing its own tags, the most shared first, then in the order given.
 */
export function suggestRoles(
  topics: readonly Topic[],
  skills: readonly Skill[],
  targets: readonly Target[],
): RoleSuggestion[] {
  const loadable = skills.filter((skill) => skill.targets.some((t) => targets.includes(t)))
  return ROLE_PRESETS.map((preset) => {
    const own = PRESET_TOPICS[preset.slug] ?? []
    return { preset: preset.slug, own, topics: own.filter((topic) => topics.includes(topic)) }
  })
    .filter((role) => role.topics.length > 0)
    .sort((a, b) => b.topics.length - a.topics.length)
    .slice(0, ROLE_SUGGESTIONS_MAX)
    .map(({ preset, own, topics: shared }) => ({
      preset,
      topics: shared,
      skills: ranked(loadable, own).map(({ id, name, url }) => ({ id, name, url })),
    }))
}

function ranked(skills: readonly Skill[], topics: readonly Topic[]): Skill[] {
  const count = (skill: Skill) =>
    skill.topics?.filter((topic) => topics.includes(topic)).length ?? 0
  return skills
    .filter((skill) => count(skill) > 0)
    .sort((a, b) => count(b) - count(a))
    .slice(0, ROLE_SKILLS_MAX)
}
