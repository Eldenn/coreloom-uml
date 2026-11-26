import { TOPICS } from '@coreloom-uml/catalog'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import { type AssistantAction, readAction } from '#app/assistant/actions/action'
import CatalogSkill from '#app/skills/models/catalog-skill'
import { suggestableSkills } from '#app/skills/services/skills-catalog'
import { INSTALLABLE_SQL } from '#app/skills/services/skills-query'

/** Skills one search answers. */
const SKILL_MATCHES_MAX = 10
const SKILL_QUERY_MAX_LENGTH = 100

/*
 * The skills catalog is shared by every account: the assistant reads it to name the skills that
 * fit, and nothing here adds, installs or changes one. A skill with an approved copy may be held
 * by agent conventions (`change_skills`), which the CLI's pull installs.
 */
export const SKILL_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'find_skills',
    description:
      'Searches the catalog of third-party agent skills by words (a language, a framework, a practice), by tag, or both: each skill found has a slug, a name, what it does, its link, its tags, the coding tools that load it and whether agent conventions can hold it (holdable: it has an approved copy, which change_skills adds and the CLI pull command installs). Never create a skill: name the ones that fit in the reply, with their links.',
    input: z
      .object({
        query: z.string().trim().min(1).max(SKILL_QUERY_MAX_LENGTH).optional(),
        topic: z.enum(TOPICS).optional(),
      })
      .refine((input) => input.query !== undefined || input.topic !== undefined, {
        message: 'Give words, a tag, or both',
      }),
    kind: AssistantToolKind.Read,
    async read({ query, topic }) {
      const words = query?.toLowerCase().split(/\s+/) ?? []
      const found = (await suggestableSkills())
        .filter((skill) => {
          if (topic && !skill.topics?.includes(topic)) return false
          const text = [skill.id, skill.name, skill.description.en].join(' ').toLowerCase()
          return words.every((word) => text.includes(word))
        })
        .slice(0, SKILL_MATCHES_MAX)
      const holdable = found.length
        ? await CatalogSkill.query()
            .whereIn(
              'slug',
              found.map((skill) => skill.id),
            )
            .whereRaw(INSTALLABLE_SQL)
        : []
      return found.map((skill) => ({
        slug: skill.id,
        holdable: holdable.some((row) => row.slug === skill.id),
        name: skill.name,
        description: skill.description.en,
        url: skill.url,
        topics: skill.topics ?? [],
        targets: skill.targets,
      }))
    },
  }),
]
