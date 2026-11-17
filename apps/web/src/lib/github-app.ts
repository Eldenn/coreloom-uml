// Query and mutation hooks for the server's GitHub App, as the admin manages it in the settings:
// created on GitHub from a manifest (GitHub's "manifest flow"), shown, removed. The API never
// answers its secrets.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client } from '@/lib/client'

export type GithubAppStatus = Awaited<ReturnType<typeof client.api.admin.githubApp.show>>

export const githubAppKey = ['admin', 'github-app'] as const

export function useGithubApp(enabled: boolean) {
  return useQuery({
    queryKey: githubAppKey,
    queryFn: () => client.api.admin.githubApp.show({}),
    enabled,
  })
}

/**
 * Sends the browser to GitHub with the manifest: a form posted to GitHub's page (a plain link
 * cannot carry it), where the admin confirms the App's name. GitHub comes back to
 * `/github/app-created` with a code.
 */
export function useCreateGithubApp() {
  return useMutation({
    mutationFn: async (body: { organization?: string; public: boolean }) => {
      const { url, manifest } = await client.api.admin.githubApp.start({ body })
      const form = document.createElement('form')
      form.method = 'post'
      form.action = url
      const field = document.createElement('input')
      field.type = 'hidden'
      field.name = 'manifest'
      field.value = JSON.stringify(manifest)
      form.append(field)
      document.body.append(form)
      form.submit()
    },
  })
}

/** Hands GitHub's code to the API, which keeps the App and its secrets (encrypted). */
export function useCompleteGithubApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { code: string; state: string }) =>
      client.api.admin.githubApp.store({ body }),
    onSuccess: async (status) => {
      queryClient.setQueryData(githubAppKey, status)
      await queryClient.invalidateQueries({ queryKey: ['github'] })
    },
  })
}

/** Forgets the App here, and every user's repositories read through it. */
export function useRemoveGithubApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => client.api.admin.githubApp.destroy({}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: githubAppKey })
      await queryClient.invalidateQueries({ queryKey: ['github'] })
    },
  })
}
