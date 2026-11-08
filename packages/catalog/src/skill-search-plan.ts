import type { SkillAffinity } from './schemas.ts'

/**
 * What the API's weekly search (`app/skills/services/skills-search.ts`) looks for on skills.sh:
 * each query files what it finds under a topic (the Skills screen's filters) and, when it relates
 * to a question or to diagrams, gives it an affinity, which is what makes a skill suggestible. A
 * skill found by several queries gets all their topics and affinities. Change a found skill's
 * affinities here, never in the database: the next refresh rebuilds them from this plan.
 */
export type SkillSearchQuery = { query: string; topic: SkillTopic; affinity?: SkillAffinity }

export const SkillTopic = {
  Testing: 'testing',
  TypeScript: 'typescript',
  React: 'react',
  Frontend: 'frontend',
  Workflow: 'workflow',
  Tooling: 'tooling',
  Architecture: 'architecture',
  Databases: 'databases',
  Backend: 'backend',
  Security: 'security',
} as const

export type SkillTopic = (typeof SkillTopic)[keyof typeof SkillTopic]

export const SKILL_TOPICS = Object.values(SkillTopic) as readonly SkillTopic[]

const UML_KINDS = [
  'class',
  'sequence',
  'state',
  'usecase',
  'activity',
  'deployment',
  'component',
  'package',
] as const

export const SKILL_SEARCH_PLAN: readonly SkillSearchQuery[] = [
  // Testing
  {
    query: 'test driven development',
    topic: SkillTopic.Testing,
    affinity: { slot: 'testing.levels', values: ['unit', 'component'] },
  },
  {
    query: 'vitest',
    topic: SkillTopic.Testing,
    affinity: { slot: 'testing.levels', values: ['unit', 'component'] },
  },
  {
    query: 'react testing library',
    topic: SkillTopic.Testing,
    affinity: { slot: 'testing.levels', values: ['component'] },
  },
  {
    query: 'playwright',
    topic: SkillTopic.Testing,
    affinity: { slot: 'testing.levels', values: ['e2e'] },
  },
  // TypeScript
  {
    query: 'typescript strict',
    topic: SkillTopic.TypeScript,
    affinity: { slot: 'typescript.strict', values: ['all', 'partial'] },
  },
  {
    query: 'typescript type safety',
    topic: SkillTopic.TypeScript,
    affinity: { slot: 'typescript.any', scale: { min: 4, max: 5 } },
  },
  // React
  {
    query: 'react composition',
    topic: SkillTopic.React,
    affinity: { slot: 'react.granularity', scale: { min: 4, max: 5 } },
  },
  {
    query: 'tanstack query',
    topic: SkillTopic.React,
    affinity: { slot: 'react.state', values: ['tanstack-query-only'] },
  },
  {
    query: 'zustand',
    topic: SkillTopic.React,
    affinity: { slot: 'react.state', values: ['zustand'] },
  },
  {
    query: 'redux toolkit',
    topic: SkillTopic.React,
    affinity: { slot: 'react.state', values: ['redux'] },
  },
  {
    query: 'tailwind',
    topic: SkillTopic.Frontend,
    affinity: { slot: 'react.styling', values: ['tailwind'] },
  },
  {
    query: 'css modules',
    topic: SkillTopic.Frontend,
    affinity: { slot: 'react.styling', values: ['css-modules'] },
  },
  // Workflow
  {
    query: 'implementation plan',
    topic: SkillTopic.Workflow,
    affinity: { slot: 'workflow.changes', scale: { min: 4, max: 5 } },
  },
  {
    query: 'brainstorming',
    topic: SkillTopic.Workflow,
    affinity: { slot: 'workflow.autonomy', scale: { min: 4, max: 5 } },
  },
  // Tooling
  {
    query: 'pnpm',
    topic: SkillTopic.Tooling,
    affinity: { slot: 'tooling.package-manager', values: ['pnpm'] },
  },
  {
    query: 'bun',
    topic: SkillTopic.Tooling,
    affinity: { slot: 'tooling.package-manager', values: ['bun'] },
  },
  // The project's own diagrams
  {
    query: 'c4 architecture',
    topic: SkillTopic.Architecture,
    affinity: { diagramKinds: ['c4', 'component', 'deployment'] },
  },
  {
    query: 'mermaid diagrams',
    topic: SkillTopic.Architecture,
    affinity: { diagramKinds: ['class', 'sequence', 'state', 'er', 'c4'] },
  },
  { query: 'plantuml', topic: SkillTopic.Architecture, affinity: { diagramKinds: [...UML_KINDS] } },
  { query: 'uml', topic: SkillTopic.Architecture, affinity: { diagramKinds: [...UML_KINDS] } },
  {
    query: 'database schema design',
    topic: SkillTopic.Databases,
    affinity: { diagramKinds: ['er'] },
  },
  {
    query: 'architecture decision record',
    topic: SkillTopic.Architecture,
    affinity: { diagramKinds: ['c4', 'component', 'deployment', 'package'] },
  },
  // Broader topics, catalogued for the Skills screen without being suggested
  { query: 'nextjs', topic: SkillTopic.React },
  { query: 'react native', topic: SkillTopic.React },
  { query: 'web design', topic: SkillTopic.Frontend },
  { query: 'accessibility', topic: SkillTopic.Frontend },
  { query: 'code review', topic: SkillTopic.Workflow },
  { query: 'debugging', topic: SkillTopic.Workflow },
  { query: 'git', topic: SkillTopic.Tooling },
  { query: 'postgres', topic: SkillTopic.Databases },
  { query: 'api design', topic: SkillTopic.Backend },
  { query: 'node', topic: SkillTopic.Backend },
  { query: 'security', topic: SkillTopic.Security },
]
