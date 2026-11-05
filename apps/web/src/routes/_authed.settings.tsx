// Account and appearance settings. The default account (managed by the server configuration)
// keeps its email and password read-only: only its display name can change here.
import { PASSWORD_POLICY } from '@coreloom-uml/auth-policy'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { InfoIcon } from 'lucide-react'
import { z } from 'zod'

import { useAuth } from '@/auth/auth-context'
import { SettingsLayout } from '@/components/settings-layout'
import { SettingsRow, SettingsSection } from '@/components/settings-section'
import { AccentPicker, ThemeMenu } from '@/components/theme-toggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { client } from '@/lib/client'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed/settings')({
  staticData: { crumb: (t) => t.nav.settings },
  component: SettingsPage,
})

function SettingsPage() {
  const t = useT()
  const { user } = useAuth()
  if (!user) return null
  return (
    <SettingsLayout
      title={t.settings.title}
      description={t.settings.description}
      nav={[{ id: 'account', label: t.settings.account }]}
      active="account"
    >
      <ProfileSection />
      {user.managedByEnvironment ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t.settings.managed}</AlertDescription>
        </Alert>
      ) : (
        <PasswordSection />
      )}
      <SettingsSection title={t.settings.appearance}>
        <SettingsRow label={t.settings.theme}>
          <ThemeMenu />
        </SettingsRow>
        <SettingsRow label={t.settings.accent}>
          <AccentPicker />
        </SettingsRow>
      </SettingsSection>
    </SettingsLayout>
  )
}

function ProfileSection() {
  const t = useT()
  const { user, refresh } = useAuth()
  const managed = user?.managedByEnvironment ?? false
  const save = useMutation({
    mutationFn: (body: { fullName: string | null; email?: string }) =>
      client.api.account.updateProfile({ body }),
  })
  const form = useAppForm({
    defaultValues: { fullName: user?.fullName ?? '', email: user?.email ?? '' },
    validators: {
      onSubmit: z.object({
        fullName: z.string().max(255),
        email: z.email(t.settings.emailInvalid),
      }),
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync({
        fullName: value.fullName.trim() || null,
        ...(managed ? {} : { email: value.email.trim().toLowerCase() }),
      })
      await refresh()
      toast.success(t.settings.saved)
    },
  })
  return (
    <SettingsSection title={t.settings.profile} description={t.settings.profileHint} form={form}>
      <form.AppField name="fullName">
        {(field) => <field.TextField label={t.settings.name} autoComplete="name" />}
      </form.AppField>
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            label={t.settings.email}
            type="email"
            autoComplete="email"
            disabled={managed}
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}

function PasswordSection() {
  const t = useT()
  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      client.api.account.changePassword({ body }),
  })
  const form = useAppForm({
    defaultValues: { currentPassword: '', newPassword: '' },
    validators: {
      onSubmit: z.object({
        currentPassword: z.string().min(1, t.settings.currentPasswordRequired),
        newPassword: z.string().min(PASSWORD_POLICY.minLength, t.settings.passwordHint),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await change.mutateAsync(value)
      } catch {
        toast.error(t.settings.wrongPassword)
        return
      }
      form.reset()
      toast.success(t.settings.passwordChanged)
    },
  })
  return (
    <SettingsSection title={t.settings.password} description={t.settings.passwordHint} form={form}>
      <form.AppField name="currentPassword">
        {(field) => (
          <field.PasswordField label={t.settings.currentPassword} autoComplete="current-password" />
        )}
      </form.AppField>
      <form.AppField name="newPassword">
        {(field) => (
          <field.PasswordField label={t.settings.newPassword} autoComplete="new-password" />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
