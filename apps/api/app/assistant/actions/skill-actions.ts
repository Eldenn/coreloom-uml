import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import { type AssistantAction, readAction } from '#app/assistant/actions/action'
import { suggestableSkills } from '#app/skills/services/skills-catalog'

/** Skills one search answers. */
const SKILL_MATCHES_MAX = 10
const SKILL_QUERY_MAX_LENGTH = 100

/*
 * The skills catalog is shared by every account and holds links only: the assistant reads it to
 * name the skills that fit, and nothing here adds, installs or changes one.
 */
export const SKILL_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'find_skills',
    description:
      'Searches the catalog of third-party agent skills by words (a language, a framework, a practice): each skill found has a name, what it does, its link and the coding tools that load it. A skill is a link the owner follows, never something to create: name the ones that fit in the reply, with their links.',
    input: z.object({ query: z.string().trim().min(1).max(SKILL_QUERY_MAX_LENGTH) }),
    kind: AssistantToolKind.Read,
    async read({ query }) {
      const words = query.toLowerCase().split(/\s+/)
      return (await suggestableSkills())
        .filter((skill) => {
          const text = [skill.id, skill.name, skill.description.en].join(' ').toLowerCase()
          return words.every((word) => text.includes(word))
        })
        .slice(0, SKILL_MATCHES_MAX)
        .map((skill) => ({
          name: skill.name,
          description: skill.description.en,
          url: skill.url,
          targets: skill.targets,
        }))
    },
  }),
]
