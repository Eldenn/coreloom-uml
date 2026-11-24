import type { SkillAffinity } from './schemas.ts'
import { Topic } from './topics.ts'

/**
 * What the API's weekly search (`app/skills/services/skills-search.ts`) looks for on skills.sh:
 * each query files what it finds under a topic (the Skills screen's filters, and a weak signal
 * that makes it suggestible, `matchSkills`) and, when it relates to rules or to diagrams, gives
 * it an affinity, the strong signal, which may also make it conflicting. A
 * skill found by several queries gets all their topics and affinities. Change a found skill's
 * affinities here, never in the database: the next refresh rebuilds them from this plan.
 */
export type SkillSearchQuery = { query: string; topic: Topic; affinity?: SkillAffinity }

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
    topic: Topic.Testing,
    affinity: { slot: 'testing.levels', values: ['unit', 'component'] },
  },
  {
    query: 'vitest',
    topic: Topic.Testing,
    affinity: { slot: 'testing.levels', values: ['unit', 'component'] },
  },
  {
    query: 'react testing library',
    topic: Topic.Testing,
    affinity: { slot: 'testing.levels', values: ['component'] },
  },
  {
    query: 'playwright',
    topic: Topic.Testing,
    affinity: { slot: 'testing.levels', values: ['e2e'] },
  },
  // TypeScript
  {
    query: 'typescript strict',
    topic: Topic.TypeScript,
    affinity: { slot: 'typescript.strict', values: ['all', 'partial'] },
  },
  {
    query: 'typescript type safety',
    topic: Topic.TypeScript,
    affinity: { slot: 'typescript.any', values: ['agree'], against: ['disagree'] },
  },
  // React
  {
    query: 'react composition',
    topic: Topic.React,
    affinity: { slot: 'react.granularity', values: ['agree'], against: ['disagree'] },
  },
  {
    query: 'tanstack query',
    topic: Topic.React,
    affinity: { slot: 'react.state', values: ['tanstack-query-only'] },
  },
  {
    query: 'zustand',
    topic: Topic.React,
    affinity: { slot: 'react.state', values: ['zustand'] },
  },
  {
    query: 'redux toolkit',
    topic: Topic.React,
    affinity: { slot: 'react.state', values: ['redux'] },
  },
  {
    query: 'tailwind',
    topic: Topic.Frontend,
    affinity: { slot: 'react.styling', values: ['tailwind'] },
  },
  {
    query: 'css modules',
    topic: Topic.Frontend,
    affinity: { slot: 'react.styling', values: ['css-modules'] },
  },
  // Workflow
  {
    query: 'implementation plan',
    topic: Topic.Workflow,
    affinity: { slot: 'workflow.changes', values: ['agree'], against: ['disagree'] },
  },
  {
    query: 'brainstorming',
    topic: Topic.Workflow,
    affinity: {
      slot: 'workflow.autonomy',
      values: ['agree', 'ask-before-writing'],
      against: ['disagree'],
    },
  },
  // Tooling
  {
    query: 'pnpm',
    topic: Topic.Tooling,
    affinity: { slot: 'tooling.package-manager', values: ['pnpm'] },
  },
  {
    query: 'bun',
    topic: Topic.Tooling,
    affinity: { slot: 'tooling.package-manager', values: ['bun'] },
  },
  // The project's own diagrams
  {
    query: 'c4 architecture',
    topic: Topic.Architecture,
    affinity: { diagramKinds: ['c4', 'component', 'deployment'] },
  },
  {
    query: 'mermaid diagrams',
    topic: Topic.Architecture,
    affinity: { diagramKinds: ['class', 'sequence', 'state', 'er', 'c4'] },
  },
  { query: 'plantuml', topic: Topic.Architecture, affinity: { diagramKinds: [...UML_KINDS] } },
  { query: 'uml', topic: Topic.Architecture, affinity: { diagramKinds: [...UML_KINDS] } },
  {
    query: 'database schema design',
    topic: Topic.Databases,
    affinity: { diagramKinds: ['er'] },
  },
  {
    query: 'architecture decision record',
    topic: Topic.Architecture,
    affinity: { diagramKinds: ['c4', 'component', 'deployment', 'package'] },
  },
  // Broader topics: suggested on their tag alone (a weak signal, see `matchSkills`)
  { query: 'nextjs', topic: Topic.React },
  { query: 'react native', topic: Topic.React },
  { query: 'web design', topic: Topic.Frontend },
  { query: 'accessibility', topic: Topic.Frontend },
  { query: 'code review', topic: Topic.Workflow },
  { query: 'debugging', topic: Topic.Workflow },
  { query: 'git', topic: Topic.Tooling },
  { query: 'postgres', topic: Topic.Databases },
  { query: 'api design', topic: Topic.Backend },
  { query: 'node', topic: Topic.Backend },
  { query: 'security', topic: Topic.Security },
]
