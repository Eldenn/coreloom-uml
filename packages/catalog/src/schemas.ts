import { z } from 'zod'
import { DIAGRAM_KINDS } from './diagram-kinds.ts'
import { RESERVED_SECTIONS, SHARED_SECTIONS } from './sections.ts'
import { isSlot } from './slots.ts'
import { Target } from './targets.ts'

/** Languages the catalog is written in. Rendered files are always English. */
export const LOCALES = ['en', 'fr'] as const

export const localizedSchema = z.object({ en: z.string().min(1), fr: z.string().min(1) })

export type Localized = z.infer<typeof localizedSchema>

export const QuestionType = {
  Scale: 'scale',
  Single: 'single',
  Multi: 'multi',
  Text: 'text',
} as const

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType]

/** A scale answer goes from 1 ("strongly disagree") to 5 ("strongly agree"). */
export const SCALE_MIN = 1
export const SCALE_MAX = 5

/** Longest free-text answer, and longest `{value}` once inlined in a fragment. */
export const ANSWER_TEXT_MAX_LENGTH = 500
export const FRAGMENT_VALUE_MAX_LENGTH = 200

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER = /^\d+\.\d+\.\d+$/

const scaleBound = z.number().int().min(SCALE_MIN).max(SCALE_MAX)

/**
 * When a fragment applies. Every condition given must hold. `other` holds when a single-choice
 * answer is the free text of a `freeText` option rather than one of the listed values.
 */
export const fragmentConditionSchema = z
  .object({
    scaleAtLeast: scaleBound.optional(),
    scaleAtMost: scaleBound.optional(),
    equals: z.string().min(1).optional(),
    includes: z.string().min(1).optional(),
    other: z.literal(true).optional(),
    answered: z.literal(true).optional(),
  })
  .strict()
  .refine((when) => Object.values(when).some((value) => value !== undefined), {
    message: 'A fragment needs at least one condition',
  })

export type FragmentCondition = z.infer<typeof fragmentConditionSchema>

export const fragmentSchema = z
  .object({
    when: fragmentConditionSchema,
    /** English, imperative, one line; may contain `{value}` for single and text answers. */
    text: z
      .string()
      .min(3)
      .max(300)
      .refine((text) => !/[\r\n]/.test(text), { message: 'A fragment is one line' }),
  })
  .strict()

export type Fragment = z.infer<typeof fragmentSchema>

export const questionOptionSchema = z
  .object({
    value: z.string().regex(KEBAB_CASE),
    label: localizedSchema,
    /** Cannot be picked together with another option (multi only). */
    exclusive: z.boolean().optional(),
    /** Opens a text field whose content becomes the answer (single only). */
    freeText: z.boolean().optional(),
  })
  .strict()

export type QuestionOption = z.infer<typeof questionOptionSchema>

export const questionSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    type: z.enum(QuestionType),
    slot: z.string().refine(isSlot, { message: 'Unknown slot: declare it in slots.ts' }),
    section: z.string().min(1),
    label: localizedSchema,
    help: localizedSchema.optional(),
    options: z.array(questionOptionSchema).optional(),
    required: z.boolean(),
    fragments: z.array(fragmentSchema),
  })
  .strict()
  .superRefine((question, ctx) => {
    const hasOptions = question.type === 'single' || question.type === 'multi'
    if (hasOptions && (question.options?.length ?? 0) < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Needs at least two options' })
    }
    if (!hasOptions && question.options) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: `A ${question.type} has none` })
    }
    const values = question.options?.map((option) => option.value) ?? []
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Duplicate option value' })
    }
    question.options?.forEach((option, index) => {
      if (option.exclusive && question.type !== 'multi') {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'exclusive'],
          message: 'Only a multi-choice option can be exclusive',
        })
      }
      if (option.freeText && question.type !== 'single') {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'freeText'],
          message: 'Only a single-choice option can open a text field',
        })
      }
    })
    if (question.options && question.options.filter((option) => option.freeText).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'At most one freeText option' })
    }
    question.fragments.forEach((fragment, index) => {
      for (const problem of fragmentProblems(question, fragment, values)) {
        ctx.addIssue({ code: 'custom', path: ['fragments', index], message: problem })
      }
    })
  })

export type Question = z.infer<typeof questionSchema>

function fragmentProblems(question: Question, fragment: Fragment, values: string[]): string[] {
  const { when } = fragment
  const problems: string[] = []
  const isScale = question.type === 'scale'
  if ((when.scaleAtLeast !== undefined || when.scaleAtMost !== undefined) && !isScale) {
    problems.push('Scale conditions apply to scale questions only')
  }
  if (when.equals !== undefined) {
    if (question.type !== 'single') problems.push('`equals` applies to single questions only')
    else if (!values.includes(when.equals)) problems.push(`Unknown option: ${when.equals}`)
  }
  if (when.includes !== undefined) {
    if (question.type !== 'multi') problems.push('`includes` applies to multi questions only')
    else if (!values.includes(when.includes)) problems.push(`Unknown option: ${when.includes}`)
  }
  if (when.other && !question.options?.some((option) => option.freeText)) {
    problems.push('`other` needs a freeText option')
  }
  if (fragment.text.includes('{value}') && question.type !== 'single' && question.type !== 'text') {
    problems.push('`{value}` is only filled for single and text answers')
  }
  return problems
}

export const questionnaireSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    /** Bumped on any change to a question, an option or a fragment. */
    version: z.string().regex(SEMVER),
    title: localizedSchema,
    description: localizedSchema,
    /** Sections this questionnaire adds, in render order. */
    sections: z.array(z.string().min(1)),
    questions: z.array(questionSchema).min(1),
    /** questionId → removed option → replacement option (`null` drops the answer). */
    migrations: z.record(z.string(), z.record(z.string(), z.string().nullable())).optional(),
  })
  .strict()
  .superRefine((questionnaire, ctx) => {
    for (const section of questionnaire.sections) {
      if (SHARED_SECTIONS.includes(section) || RESERVED_SECTIONS.includes(section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections'],
          message: `${section} is a shared or reserved section, not a questionnaire's own`,
        })
      }
    }
    const ids = new Set<string>()
    const slots = new Set<string>()
    questionnaire.questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({ code: 'custom', path: ['questions', index, 'id'], message: 'Duplicate id' })
      }
      ids.add(question.id)
      if (slots.has(question.slot)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'slot'],
          message: 'Two questions feed the same slot',
        })
      }
      slots.add(question.slot)
      if (
        !questionnaire.sections.includes(question.section) &&
        !SHARED_SECTIONS.includes(question.section)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'section'],
          message: `Not one of the questionnaire's sections nor a shared one: ${question.section}`,
        })
      }
    })
  })

export type Questionnaire = z.infer<typeof questionnaireSchema>

/**
 * An answer: a scale value, a single choice or text, or the values of a multiple choice. A
 * single choice whose `freeText` option was picked stores the typed text.
 */
export const answerValueSchema = z.union([z.number(), z.string(), z.array(z.string())])

export type AnswerValue = z.infer<typeof answerValueSchema>

/**
 * How a skill relates to one slot: a range on an agreement scale, or the options it fits. The
 * catalog test checks each against the question that feeds the slot.
 */
export const slotAffinitySchema = z
  .object({
    slot: z.string().refine(isSlot, { message: 'Unknown slot: declare it in slots.ts' }),
    scale: z
      .object({ min: scaleBound, max: scaleBound })
      .strict()
      .refine((range) => range.min <= range.max, { message: '`min` is above `max`' })
      .optional(),
    values: z.array(z.string().regex(KEBAB_CASE)).min(1).optional(),
  })
  .strict()
  .refine((affinity) => (affinity.scale === undefined) !== (affinity.values === undefined), {
    message: 'An affinity has either a scale range or values',
  })

export type SlotAffinity = z.infer<typeof slotAffinitySchema>

/** A skill that fits projects holding at least one diagram of these kinds (never a −1). */
export const diagramAffinitySchema = z
  .object({ diagramKinds: z.array(z.enum(DIAGRAM_KINDS)).min(1) })
  .strict()

export type DiagramAffinity = z.infer<typeof diagramAffinitySchema>

export const skillAffinitySchema = z.union([slotAffinitySchema, diagramAffinitySchema])

export type SkillAffinity = z.infer<typeof skillAffinitySchema>

export function isSlotAffinity(affinity: SkillAffinity): affinity is SlotAffinity {
  return 'slot' in affinity
}

/** Where a skill was found, how it fares in its registry's security audits and when. */
export const AuditRisk = {
  Safe: 'safe',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
  Unknown: 'unknown',
} as const

export type AuditRisk = (typeof AuditRisk)[keyof typeof AuditRisk]

/** The audit risks a skill may have and still be suggested. */
export const ACCEPTED_AUDIT_RISKS: readonly AuditRisk[] = [AuditRisk.Safe, AuditRisk.Low]

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const skillProvenanceSchema = z
  .object({
    registry: z.literal('skills.sh'),
    /** The skill's id in the registry (`owner/repo/slug`). */
    id: z.string().min(1),
    installs: z.number().int().min(0),
    audits: z
      .array(
        z
          .object({
            provider: z.string().min(1),
            risk: z.enum(AuditRisk),
            analyzedAt: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    /** The day the search last changed the entry (pin, audits). */
    checkedOn: z.string().regex(DATE),
    /** Git tree SHA of the skill's folder at the pinned commit: it is re-pinned only when this moves. */
    contentSha: z.string().regex(/^[0-9a-f]{40}$/),
  })
  .strict()

export type SkillProvenance = z.infer<typeof skillProvenanceSchema>

/** Who added a skill: a person (in this catalog), or the API's weekly search on skills.sh. */
export const SkillOrigin = { Manual: 'manual', Search: 'search' } as const

export type SkillOrigin = (typeof SkillOrigin)[keyof typeof SkillOrigin]

/**
 * A third-party skill the screen and the CLI may point to. Links only: there is no install
 * command, and the URL is pinned to a tag or a commit. An entry found by the search has its
 * provenance and may lack a French description (English is shown instead).
 */
export const skillSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    name: z.string().min(1).max(80),
    description: z
      .object({ en: z.string().min(1).max(300), fr: z.string().min(1).max(300).optional() })
      .strict(),
    url: z.url({ protocol: /^https$/ }),
    /** The tools that load it. */
    targets: z.array(z.enum(Target)).min(1),
    affinities: z.array(skillAffinitySchema).min(1),
    origin: z.enum(SkillOrigin),
    provenance: skillProvenanceSchema.optional(),
  })
  .strict()
  .superRefine((skill, ctx) => {
    const slots = skill.affinities.filter(isSlotAffinity).map((affinity) => affinity.slot)
    if (new Set(slots).size !== slots.length) {
      ctx.addIssue({ code: 'custom', path: ['affinities'], message: 'A slot is listed twice' })
    }
    if (skill.affinities.filter((affinity) => !isSlotAffinity(affinity)).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['affinities'],
        message: 'One diagram affinity at most',
      })
    }
    if (new Set(skill.targets).size !== skill.targets.length) {
      ctx.addIssue({ code: 'custom', path: ['targets'], message: 'A target is listed twice' })
    }
    if (skill.origin === SkillOrigin.Search && !skill.provenance) {
      ctx.addIssue({ code: 'custom', path: ['provenance'], message: 'A found skill needs one' })
    }
  })

export type Skill = z.infer<typeof skillSchema>
