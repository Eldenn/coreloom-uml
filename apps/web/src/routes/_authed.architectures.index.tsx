// Architectures now live in projects: the old list address opens the projects.
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/architectures/')({
  beforeLoad: () => {
    throw redirect({ to: '/projects', replace: true })
  },
})
