// The header's breadcrumbs: routes describe theirs with `staticData.crumb` (see src/main.tsx).
import type { Project } from '@/lib/projects'
import type { Messages } from '@/messages'

/** One step of the header's breadcrumbs. */
export interface Crumb {
  label: string
  href: string
}

/** Projects › this project: the trail of a project page and of its architectures' editor. */
export function projectCrumbs(t: Messages, project: Project | null | undefined): Crumb[] {
  const trail = [{ label: t.nav.projects, href: '/projects' }]
  return project ? [...trail, { label: project.name, href: `/projects/${project.id}` }] : trail
}

/** The trail of an architecture's editor: its project's, or Architectures when it has none. */
export function architectureCrumbs(t: Messages, project: Project | null | undefined): Crumb[] {
  return project
    ? projectCrumbs(t, project)
    : [{ label: t.nav.architectures, href: '/architectures' }]
}

/** The trail of agent conventions: their project's, or Agent conventions when they have none. */
export function agentConfigCrumbs(t: Messages, project: Project | null | undefined): Crumb[] {
  return project
    ? projectCrumbs(t, project)
    : [{ label: t.nav.agentConfigs, href: '/agent-configs' }]
}
