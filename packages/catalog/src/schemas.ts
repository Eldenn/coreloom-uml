import { z } from 'zod'
import { DIAGRAM_KINDS } from './diagram-kinds.ts'
import { RESERVED_SECTIONS, SHARED_SECTIONS } from './sections.ts'
import { isSlot } from './slots.ts'
import { Target } from './targets.ts'
import { TOPICS } from './topics.ts'

/** Languages the catalog is written in. Rendered files are always English. */
export const LOCALES = ['en', 'fr'] as const

export const localizedSchema = z.object({ en: z.string().min(1), fr: z.string().min(1) })

export type Localized = z.infer<typeof localizedSchema>

/** How many rules of a group a configuration may hold: one, or any number. */
export const RulePick = { One: 'one', Many: 'many' } as const

export type RulePick = (typeof RulePick)[keyof typeof RulePick]

/** Longest text typed into a rule, and longest `{value}` once inlined in a line. */
export const RULE_VALUE_MAX_LENGTH = 500
export const LINE_VALUE_MAX_LENGTH = 200

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** English, imperative, one line; may contain `{value}`. */
const lineSchema = z
  .string()
  .min(3)
  .max(300)
  .refine((text) => !/[\r\n]/.test(text), { message: 'A line is one line' })

/**
 * A ready-made rule: the lines it writes in its group's section. `{value}` in a line is the text
 * typed into the rule when it takes one (`input`), its id otherwise.
 */
export const readyRuleSchema = z
  .object({
    /** Unique in its group, never reused once removed. */
    id: z.string().regex(KEBAB_CASE),
    /** A short name; without one the screen shows the lines. */
    label: localizedSchema.optional(),
    lines: z.array(lineSchema),
    /** The rule is accepted with a text typed by the owner. */
    input: z.literal(true).optional(),
    /** Cannot be held together with another rule of its group (`many` only). */
    alone: z.literal(true).optional(),
    /**
     * No automatic suggestion: the project holding it does not use, does not do or must not add
     * something, which a text similarity cannot read (a Docker skill looks close to "no container
     * image is built here"). It gets no computed affinity; a skill still fits it through a
     * written affinity or a pair the admin accepted. Marks the rule's text, not what the catalog
     * covers today.
     */
    noAutomaticSuggestion: z.literal(true).optional(),
  })
  .strict()

export type ReadyRule = z.infer<typeof readyRuleSchema>

/**
 * The rules about one aspect of the work, identified by its slot. `lines` are written once,
 * after the accepted rules' own, whenever the configuration holds a rule of the group.
 */
export const ruleGroupSchema = z
  .object({
    slot: z.string().refine(isSlot, { message: 'Unknown slot: declare it in slots.ts' }),
    section: z.string().min(1),
    label: localizedSchema,
    help: localizedSchema.optional(),
    pick: z.enum(RulePick),
    rules: z.array(readyRuleSchema).min(1),
    lines: z.array(lineSchema).min(1).optional(),
  })
  .strict()
  .superRefine((group, ctx) => {
    const ids = group.rules.map((rule) => rule.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Duplicate rule id' })
    }
    group.rules.forEach((rule, index) => {
      if (rule.lines.length === 0 && !group.lines) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', index, 'lines'],
          message: 'A rule writes at least one line, its own or its group’s',
        })
      }
      if (rule.alone && group.pick !== RulePick.Many) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', index, 'alone'],
          message: 'Only a rule of a `many` group can stand alone',
        })
      }
    })
    if (group.pick === RulePick.Many && group.lines?.some((line) => line.includes('{value}'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: '`{value}` in a group line needs a `one` group',
      })
    }
  })

export type RuleGroup = z.infer<typeof ruleGroupSchema>

export const rulePackSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE),
    title: localizedSchema,
    description: localizedSchema,
    /** Sections this pack adds, in render order. */
    sections: z.array(z.string().min(1)),
    groups: z.array(ruleGroupSchema).min(1),
  })
  .strict()
  .superRefine((pack, ctx) => {
    for (const section of pack.sections) {
      if (SHARED_SECTIONS.includes(section) || RESERVED_SECTIONS.includes(section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections'],
          message: `${section} is a shared or reserved section, not a pack's own`,
        })
      }
    }
    const slots = new Set<string>()
    pack.groups.forEach((group, index) => {
      if (slots.has(group.slot)) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index, 'slot'],
          message: 'Two groups feed the same slot',
        })
      }
      slots.add(group.slot)
      if (!pack.sections.includes(group.section) && !SHARED_SECTIONS.includes(group.section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index, 'section'],
          message: `Not one of the pack's sections nor a shared one: ${group.section}`,
        })
      }
    })
  })

export type RulePack = z.infer<typeof rulePackSchema>

/** A ready-made rule a configuration holds: its group's slot, its id and, for an `input` rule, the typed text. */
export const acceptedRuleSchema = z
  .object({
    slot: z.string().min(1),
    rule: z.string().min(1),
    value: z.string().nullable().optional(),
  })
  .strict()

export type AcceptedRule = z.infer<typeof acceptedRuleSchema>

/**
 * How a skill relates to one slot: the rules it fits (`values`) and the ones it goes against
 * (`against`). The catalog test checks each against the group that feeds the slot.
 */
export const slotAffinitySchema = z
  .object({
    slot: z.string().refine(isSlot, { message: 'Unknown slot: declare it in slots.ts' }),
    values: z.array(z.string().regex(KEBAB_CASE)).min(1),
    against: z.array(z.string().regex(KEBAB_CASE)).min(1).optional(),
  })
  .strict()
  .refine((affinity) => !affinity.against?.some((rule) => affinity.values.includes(rule)), {
    message: 'A rule is both fitted and gone against',
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
    /**
     * `skills.sh` when skills.sh's audits vouch for it; `github` when only a GitHub repository the
     * admin trusts listed it (no audit, installs 0 when skills.sh never returned it).
     */
    registry: z.enum(['skills.sh', 'github']),
    /** The skill's id (`owner/repo/slug`), the same whichever source found it. */
    id: z.string().min(1),
    installs: z.number().int().min(0),
    audits: z.array(
      z
        .object({
          provider: z.string().min(1),
          risk: z.enum(AuditRisk),
          analyzedAt: z.string().min(1),
        })
        .strict(),
    ),
    /** The day the search last changed the entry (pin, audits). */
    checkedOn: z.string().regex(DATE),
    /** Git tree SHA of the skill's folder at the pinned commit: it is re-pinned only when this moves. */
    contentSha: z.string().regex(/^[0-9a-f]{40}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.registry === 'skills.sh' && value.audits.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['audits'], message: 'skills.sh vouches with an audit' })
    }
  })

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
    /** The rules and diagrams it fits; at least one of them or a tag. */
    affinities: z.array(skillAffinitySchema),
    /** What it is about: a weak signal, which may make it compatible, never conflicting. */
    topics: z.array(z.enum(TOPICS)).optional(),
    origin: z.enum(SkillOrigin),
    provenance: skillProvenanceSchema.optional(),
  })
  .strict()
  .superRefine((skill, ctx) => {
    if (skill.affinities.length === 0 && !skill.topics?.length) {
      ctx.addIssue({ code: 'custom', path: ['affinities'], message: 'No affinity and no tag' })
    }
    if (new Set(skill.topics).size !== (skill.topics?.length ?? 0)) {
      ctx.addIssue({ code: 'custom', path: ['topics'], message: 'A tag is listed twice' })
    }
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
