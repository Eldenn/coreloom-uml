import type { Skill } from './schemas.ts'
import { TARGETS } from './targets.ts'

/**
 * The date the skills below were last checked: each URL opened at its pinned tag or commit, its
 * `SKILL.md` read, and the tools of `SKILL_TARGET_SOURCES` confirmed to load Agent Skills.
 * Re-check every entry, and update this date, whenever the catalog's version changes.
 */
export const SKILLS_VERIFIED_ON = '2026-11-08'

/** Where each target documents its support of Agent Skills (`SKILL.md` folders). */
export const SKILL_TARGET_SOURCES = {
  'claude-code': 'https://code.claude.com/docs/en/skills',
  codex: 'https://developers.openai.com/codex/skills',
  cursor: 'https://cursor.com/docs/skills',
  'github-copilot': 'https://code.visualstudio.com/docs/agent-customization/agent-skills',
  'gemini-cli': 'https://geminicli.com/docs/cli/using-agent-skills',
  generic: 'https://agentskills.io',
} as const satisfies Record<(typeof TARGETS)[number], string>

/** Every target that loads skills in the open Agent Skills format. */
const AGENT_SKILLS_TARGETS = [...TARGETS]

const SUPERPOWERS = 'https://github.com/obra/superpowers/tree/v7.0.2/skills'
const VERCEL =
  'https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills'
const ANTHROPIC =
  'https://github.com/anthropics/skills/tree/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills'

/**
 * Third-party skills suggested from a configuration's answers (see `matchSkills`), curated by
 * hand: 6 to 8 entries, each pinned to a tag or a commit, all in the Agent Skills format. They
 * are links only, never installed nor run by Coreloom UML. Any change here bumps
 * `CATALOG_VERSION`.
 */
export const SKILLS: readonly Skill[] = [
  {
    id: 'test-driven-development',
    name: 'Test-driven development (Superpowers)',
    description: {
      en: 'Write the failing test first, watch it fail, then write the least code that passes.',
      fr: 'Écrire d’abord le test qui échoue, le voir échouer, puis écrire le moins de code possible pour le faire passer.',
    },
    url: `${SUPERPOWERS}/test-driven-development`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [
      { slot: 'testing.levels', values: ['unit', 'component'] },
      { slot: 'workflow.changes', scale: { min: 4, max: 5 } },
    ],
  },
  {
    id: 'systematic-debugging',
    name: 'Systematic debugging (Superpowers)',
    description: {
      en: 'Find the root cause of a bug or a failing test before proposing any fix.',
      fr: 'Trouver la cause d’un bug ou d’un test en échec avant de proposer un correctif.',
    },
    url: `${SUPERPOWERS}/systematic-debugging`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [{ slot: 'testing.levels', values: ['unit', 'component', 'e2e'] }],
  },
  {
    id: 'verification-before-completion',
    name: 'Verification before completion (Superpowers)',
    description: {
      en: 'Run the checks and read their output before saying that work is done or passing.',
      fr: 'Lancer les vérifications et lire leur résultat avant d’annoncer qu’un travail est fini ou qu’il passe.',
    },
    url: `${SUPERPOWERS}/verification-before-completion`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [{ slot: 'testing.levels', values: ['unit', 'component', 'e2e'] }],
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming (Superpowers)',
    description: {
      en: 'Ask what you actually want, and agree on a design, before building anything new.',
      fr: 'Demander ce que vous voulez vraiment, et s’accorder sur une conception, avant de construire quoi que ce soit de nouveau.',
    },
    url: `${SUPERPOWERS}/brainstorming`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [{ slot: 'workflow.autonomy', scale: { min: 4, max: 5 } }],
  },
  {
    id: 'writing-plans',
    name: 'Writing plans (Superpowers)',
    description: {
      en: 'Turn a spec into a plan of small, separately testable tasks before touching code.',
      fr: 'Transformer une spécification en un plan de petites tâches testables une à une avant de toucher au code.',
    },
    url: `${SUPERPOWERS}/writing-plans`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [
      { slot: 'workflow.changes', scale: { min: 4, max: 5 } },
      { slot: 'workflow.autonomy', scale: { min: 4, max: 5 } },
    ],
  },
  {
    id: 'react-composition-patterns',
    name: 'React composition patterns (Vercel)',
    description: {
      en: 'Compound components and context providers instead of a growing list of boolean props.',
      fr: 'Des composants composés et des fournisseurs de contexte plutôt qu’une liste croissante de props booléennes.',
    },
    url: `${VERCEL}/composition-patterns`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [{ slot: 'react.granularity', scale: { min: 4, max: 5 } }],
  },
  {
    id: 'react-best-practices',
    name: 'React best practices (Vercel)',
    description: {
      en: 'Performance rules for React and Next.js code: rendering, data fetching and bundle size.',
      fr: 'Des règles de performance pour du code React et Next.js : rendu, chargement des données et taille du bundle.',
    },
    url: `${VERCEL}/react-best-practices`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [
      { slot: 'react.state', values: ['tanstack-query-only', 'zustand', 'redux', 'context'] },
    ],
  },
  {
    id: 'webapp-testing',
    name: 'Web app testing (Anthropic)',
    description: {
      en: 'Drive a local web app with Playwright to check its behaviour, take screenshots and read its logs.',
      fr: 'Piloter une application web locale avec Playwright pour vérifier son comportement, faire des captures et lire ses journaux.',
    },
    url: `${ANTHROPIC}/webapp-testing`,
    targets: AGENT_SKILLS_TARGETS,
    affinities: [{ slot: 'testing.levels', values: ['e2e'] }],
  },
]
