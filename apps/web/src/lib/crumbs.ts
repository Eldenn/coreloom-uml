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
