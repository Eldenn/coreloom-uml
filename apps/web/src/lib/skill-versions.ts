// The admin's review of the skills' copies (`/admin/skill-versions`): only an approved copy is
// ever installed in a repository.
import { useMutation, useQuery } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { queryClient } from '@/lib/query'

export type SkillVersionsList = Awaited<ReturnType<typeof client.api.admin.skillVersions.index>>
export type SkillVersion = SkillVersionsList['data'][number]
export type SkillVersionStatus = SkillVersion['status']
export type SkillVersionDetail = Awaited<ReturnType<typeof client.api.admin.skillVersions.show>>

const KEY = ['admin', 'skill-versions'] as const

export function useSkillVersions(status: SkillVersionStatus, page: number) {
  return useQuery({
    queryKey: [...KEY, 'list', status, page],
    queryFn: () => client.api.admin.skillVersions.index({ query: { status, page } }),
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
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'rejected' }) =>
      client.api.admin.skillVersions.update({ params: { id: String(id) }, body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}
