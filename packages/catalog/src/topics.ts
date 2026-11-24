/**
 * The tags shared by the ready-made rules (through their slot), the skills (through the search
 * query that found them, or by hand) and the ready-made roles (by hand, `PRESET_TOPICS`): what
 * crosses agent conventions with the skills and roles worth suggesting to them.
 */
export const Topic = {
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
  Ai: 'ai',
  Data: 'data',
  Devops: 'devops',
  Mobile: 'mobile',
  Docs: 'docs',
} as const

export type Topic = (typeof Topic)[keyof typeof Topic]

export const TOPICS = Object.values(Topic) as readonly Topic[]

/** The tags of every slot of a prefix (`<prefix>.<name>`); a test keeps every prefix listed. */
export const SLOT_PREFIX_TOPICS: Readonly<Record<string, readonly Topic[]>> = {
  agents: [Topic.Ai],
  llm: [Topic.Ai],
  api: [Topic.Backend],
  errors: [Topic.Backend],
  logging: [Topic.Backend],
  backend: [Topic.Backend],
  database: [Topic.Databases],
  perf: [Topic.Frontend],
  frontend: [Topic.Frontend],
  react: [Topic.React],
  typescript: [Topic.TypeScript],
  testing: [Topic.Testing],
  style: [Topic.Docs],
  workflow: [Topic.Workflow],
  tooling: [Topic.Tooling],
  git: [Topic.Tooling],
  security: [Topic.Security],
  design: [Topic.Architecture],
  system: [Topic.Architecture],
}

/** Tags a slot has on top of its prefix's. */
export const SLOT_TOPICS: Readonly<Record<string, readonly Topic[]>> = {
  'git.ci-workflow': [Topic.Devops],
  'backend.container-image': [Topic.Devops],
  'backend.observability': [Topic.Devops],
  'backend.database-tests': [Topic.Testing],
  'backend.endpoint-tests': [Topic.Testing],
  'frontend.test-runner': [Topic.Testing],
  'frontend.test-style': [Topic.Testing],
  'frontend.test-network': [Topic.Testing],
  'frontend.e2e-tool': [Topic.Testing],
  'frontend.hosting': [Topic.Devops],
  'frontend.preview-deploys': [Topic.Devops],
  'system.health-probes': [Topic.Devops],
  'system.monitoring-scope': [Topic.Devops],
  'system.alerting': [Topic.Devops],
  'llm.vector-store': [Topic.Data],
  'agents.evals': [Topic.Testing],
  'llm.eval-tool': [Topic.Testing],
}

/** A slot's tags: its prefix's, then its own. */
export function slotTopics(slot: string): Topic[] {
  const prefix = slot.slice(0, slot.indexOf('.'))
  return [...new Set([...(SLOT_PREFIX_TOPICS[prefix] ?? []), ...(SLOT_TOPICS[slot] ?? [])])]
}

/** The tags of these slots, each once, in `TOPICS` order. */
export function topicsOfSlots(slots: Iterable<string>): Topic[] {
  const found = new Set([...slots].flatMap(slotTopics))
  return TOPICS.filter((topic) => found.has(topic))
}
