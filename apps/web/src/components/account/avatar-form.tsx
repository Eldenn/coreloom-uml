import {
  AvatarUpload,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@coreloom-uml/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ME_QUERY_KEY, useAuth } from '../../auth/auth-context'
import { apiBaseUrl, client, getErrorMessage } from '../../lib/client'

export function AvatarForm() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  // Cache-buster: the avatar URL is stable (`/account/avatar`), so bump this on
  // every successful mutation to force <img> to re-fetch.
  const [version, setVersion] = useState(0)

  const invalidateMe = () => {
    setVersion(Date.now())
    return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
  }

  const upload = useMutation({
    // Raw fetch: the Tuyau client has no typed `body` slot for a route without a
    // Vine validator, so a multipart POST can't go through it.
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('avatar', file)
      const res = await fetch(`${apiBaseUrl}/account/avatar`, {
        method: 'POST',
        credentials: 'include',
        body,
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error?.message ?? t('account:avatar.error'))
      }
    },
    onSuccess: invalidateMe,
    onError: (err) => setError(getErrorMessage(err, t('account:avatar.error'))),
  })

  const remove = useMutation({
    mutationFn: () => client.api.account.avatarDestroy({}),
    onSuccess: invalidateMe,
    onError: (err) => setError(getErrorMessage(err, t('account:avatar.error'))),
  })

  const pending = upload.isPending || remove.isPending
  const src = user?.avatarUrl ? `${apiBaseUrl}${user.avatarUrl}?v=${version}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account:avatar.title')}</CardTitle>
        <CardDescription>{t('account:avatar.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AvatarUpload
          value={src}
          fallback={(user?.fullName ?? user?.email ?? '?').charAt(0).toUpperCase()}
          uploading={pending}
          error={error}
          onFileSelected={(file) => {
            setError(null)
            upload.mutate(file)
          }}
        />
        {user?.avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => {
              setError(null)
              remove.mutate()
            }}
          >
            {t('account:avatar.remove')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
