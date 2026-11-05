import type User from '#app/users/models/user'

/**
 * Resource ownership convention.
 *
 * Ownership across the API is a flat `userId` FK check — no roles, no policy
 * classes, no `@adonisjs/bouncer` (yet). Controllers call this and, when it
 * returns `false`, respond with `response.notFound(...)`: a resource that is
 * not yours is indistinguishable from one that does not exist (404 leaks less
 * than 403).
 */
export function assertOwner(resource: { userId: number }, user: User): boolean {
  return resource.userId === user.id
}
