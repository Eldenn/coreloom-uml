// The admin's review of the skills' copies (`/admin/skill-versions`): only an approved copy is
// ever installed in a repository. Its queries live under the skills keys, so the catalog's live
// updates and a decision reload them with the list and its counts.
import { useMutation, useQuery } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { queryClient } from '@/lib/query'
import { skillKeys } from '@/lib/skills'

export type SkillVersion = Awaited<
  ReturnType<typeof client.api.admin.skillVersions.index>
>['data'][number]

const KEY = [...skillKeys.all, 'copies'] as const

/** Every copy of one skill, newest first. */
export function useSkillCopies(slug: string) {
  return useQuery({
    queryKey: [...KEY, 'list', slug],
    // ponytail: the first page only (the API's default size); page it if a skill outgrows it.
    queryFn: () => client.api.admin.skillVersions.index({ query: { skill: slug } }),
  })
}

export function useSkillVersion(id: number | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => client.api.admin.skillVersions.show({ params: { id: String(id) } }),
    enabled: id !== null,
  })
}

export function useReviewSkillVersion() {
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number
      status: 'approved' | 'rejected'
      /** Only to approve a copy SkillSpector recommends not installing. */
      overrideReason?: string
    }) => client.api.admin.skillVersions.update({ params: { id: String(id) }, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: skillKeys.all }),
  })
}

/** Asks for a copy of a skill's files now; it shows up once the queue has made it. */
export function useCaptureSkillCopy() {
  return useMutation({
    mutationFn: (slug: string) => client.api.admin.skillVersions.store({ body: { slug } }),
  })
}
