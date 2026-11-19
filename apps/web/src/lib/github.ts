// Query and mutation hooks for the GitHub App: the user's connection (the repositories it reads
// for them), and the repository a project follows on each push (the pattern of src/lib/query.ts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client } from '@/lib/client'

export type GithubConnection = Awaited<ReturnType<typeof client.api.github.connection.show>>
export type GithubRepository = GithubConnection['repositories'][number]
export type GithubFollow = NonNullable<
  Awaited<ReturnType<typeof client.api.projects.codeMaps.follow.show>>['follow']
>
export type GithubConnectionTarget = 'install' | 'authorize'

export const githubKeys = {
  connection: ['github', 'connection'] as const,
  follows: ['github', 'follow'] as const,
  follow: (projectId: number) => ['github', 'follow', projectId] as const,
}

/** Whether the server has a GitHub App, and the repositories the user reaches through it. */
export function useGithubConnection() {
  return useQuery({
    queryKey: githubKeys.connection,
    queryFn: () => client.api.github.connection.show({}),
  })
}

/**
 * Opens GitHub: its page to install the App (or change its repositories), or its authorization
 * page, which comes back to `/github/callback` with a code. `state` carries on a connection
 * GitHub came back from without one (after an installation).
 */
export function useStartGithubConnection() {
  return useMutation({
    mutationFn: async (body: {
      target: GithubConnectionTarget
      returnTo?: string
      state?: string
    }) => {
      const { url } = await client.api.github.connection.start({ body })
      window.location.assign(url)
    },
  })
}

/** Hands GitHub's code to the API, which keeps the repositories the user reaches (no token). */
export function useCompleteGithubConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { code: string; state: string }) =>
      client.api.github.connection.store({ body }),
    onSuccess: (connection) => {
      queryClient.setQueryData(githubKeys.connection, {
        available: connection.available,
        login: connection.login,
        repositories: connection.repositories,
      })
    },
  })
}

/** Forgets the user's repositories here; the App stays installed on GitHub. */
export function useDisconnectGithub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.api.github.connection.destroy({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['github'] }),
  })
}

/** The repository a project reads again on each push, or null. */
export function useGithubFollow(projectId: number, enabled = true) {
  return useQuery({
    queryKey: githubKeys.follow(projectId),
    queryFn: async () =>
      (await client.api.projects.codeMaps.follow.show({ params: { id: projectId } })).follow,
    enabled,
  })
}

export function useStopGithubFollow(projectId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.api.projects.codeMaps.follow.destroy({ params: { id: projectId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: githubKeys.follow(projectId) }),
  })
}

/** The connected repository a URL names, as the API matches it (GitHub names ignore case). */
export function connectedRepository(
  repositories: GithubRepository[],
  url: string,
): GithubRepository | undefined {
  const match = /github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i.exec(url.trim())
  if (!match) return undefined
  const owner = match[1].toLowerCase()
  const name = match[2].toLowerCase()
  return repositories.find(
    (repository) =>
      repository.owner.toLowerCase() === owner && repository.name.toLowerCase() === name,
  )
}
