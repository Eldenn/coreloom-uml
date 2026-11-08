// The hand-picked skills (`origin: 'manual'`), each checked by hand at its pinned tag or commit.
// `node ace skills:setup` copies them into the API's `skills` table on every deploy, where the
// weekly search adds the skills it finds on skills.sh (`origin: 'search'`).
import type { Skill } from './schemas.ts'

export const SKILLS_DATA: readonly Skill[] = [
  {
    id: 'test-driven-development',
    name: 'Test-driven development (Superpowers)',
    description: {
      en: 'Write the failing test first, watch it fail, then write the least code that passes.',
      fr: 'Écrire d’abord le test qui échoue, le voir échouer, puis écrire le moins de code possible pour le faire passer.',
    },
    url: 'https://github.com/obra/superpowers/tree/v7.0.2/skills/test-driven-development',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'testing.levels',
        values: ['unit', 'component'],
      },
      {
        slot: 'workflow.changes',
        scale: {
          min: 4,
          max: 5,
        },
      },
    ],
  },
  {
    id: 'systematic-debugging',
    name: 'Systematic debugging (Superpowers)',
    description: {
      en: 'Find the root cause of a bug or a failing test before proposing any fix.',
      fr: 'Trouver la cause d’un bug ou d’un test en échec avant de proposer un correctif.',
    },
    url: 'https://github.com/obra/superpowers/tree/v7.0.2/skills/systematic-debugging',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'testing.levels',
        values: ['unit', 'component', 'e2e'],
      },
    ],
  },
  {
    id: 'verification-before-completion',
    name: 'Verification before completion (Superpowers)',
    description: {
      en: 'Run the checks and read their output before saying that work is done or passing.',
      fr: 'Lancer les vérifications et lire leur résultat avant d’annoncer qu’un travail est fini ou qu’il passe.',
    },
    url: 'https://github.com/obra/superpowers/tree/v7.0.2/skills/verification-before-completion',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'testing.levels',
        values: ['unit', 'component', 'e2e'],
      },
    ],
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming (Superpowers)',
    description: {
      en: 'Ask what you actually want, and agree on a design, before building anything new.',
      fr: 'Demander ce que vous voulez vraiment, et s’accorder sur une conception, avant de construire quoi que ce soit de nouveau.',
    },
    url: 'https://github.com/obra/superpowers/tree/v7.0.2/skills/brainstorming',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'workflow.autonomy',
        scale: {
          min: 4,
          max: 5,
        },
      },
    ],
  },
  {
    id: 'writing-plans',
    name: 'Writing plans (Superpowers)',
    description: {
      en: 'Turn a spec into a plan of small, separately testable tasks before touching code.',
      fr: 'Transformer une spécification en un plan de petites tâches testables une à une avant de toucher au code.',
    },
    url: 'https://github.com/obra/superpowers/tree/v7.0.2/skills/writing-plans',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'workflow.changes',
        scale: {
          min: 4,
          max: 5,
        },
      },
      {
        slot: 'workflow.autonomy',
        scale: {
          min: 4,
          max: 5,
        },
      },
    ],
  },
  {
    id: 'react-composition-patterns',
    name: 'React composition patterns (Vercel)',
    description: {
      en: 'Compound components and context providers instead of a growing list of boolean props.',
      fr: 'Des composants composés et des fournisseurs de contexte plutôt qu’une liste croissante de props booléennes.',
    },
    url: 'https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/composition-patterns',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'react.granularity',
        scale: {
          min: 4,
          max: 5,
        },
      },
    ],
  },
  {
    id: 'react-best-practices',
    name: 'React best practices (Vercel)',
    description: {
      en: 'Performance rules for React and Next.js code: rendering, data fetching and bundle size.',
      fr: 'Des règles de performance pour du code React et Next.js : rendu, chargement des données et taille du bundle.',
    },
    url: 'https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'react.state',
        values: ['tanstack-query-only', 'zustand', 'redux', 'context'],
      },
    ],
  },
  {
    id: 'webapp-testing',
    name: 'Web app testing (Anthropic)',
    description: {
      en: 'Drive a local web app with Playwright to check its behaviour, take screenshots and read its logs.',
      fr: 'Piloter une application web locale avec Playwright pour vérifier son comportement, faire des captures et lire ses journaux.',
    },
    url: 'https://github.com/anthropics/skills/tree/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/webapp-testing',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        slot: 'testing.levels',
        values: ['e2e'],
      },
    ],
  },
  {
    id: 'c4-architecture',
    name: 'C4 architecture (softaworks)',
    description: {
      en: 'Document a system with C4 model diagrams in Mermaid: context, containers, components and deployment.',
      fr: 'Documenter un système avec des diagrammes du modèle C4 en Mermaid : contexte, conteneurs, composants et déploiement.',
    },
    url: 'https://github.com/softaworks/agent-skills/tree/3027f20f3181758385a1bb8c022d4041dfb4de84/skills/c4-architecture',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        diagramKinds: ['c4', 'component', 'deployment'],
      },
    ],
  },
  {
    id: 'mermaid-diagrams',
    name: 'Mermaid diagrams (softaworks)',
    description: {
      en: 'Write class, sequence, state, entity-relationship and C4 diagrams in Mermaid syntax.',
      fr: 'Écrire des diagrammes de classes, de séquence, d’états, entité-association et C4 en syntaxe Mermaid.',
    },
    url: 'https://github.com/softaworks/agent-skills/tree/3027f20f3181758385a1bb8c022d4041dfb4de84/skills/mermaid-diagrams',
    targets: ['generic', 'codex', 'cursor', 'github-copilot', 'claude-code', 'gemini-cli'],
    origin: 'manual',
    affinities: [
      {
        diagramKinds: ['class', 'sequence', 'state', 'er', 'c4'],
      },
    ],
  },
]
