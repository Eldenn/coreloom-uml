// Settings, "LLM provider": the user's own provider for proposed rules (bring your own key).
// Everything stays in this browser (`useStoredProvider`); "Test" sends the form's values to
// `POST /llm/test` without saving them, and "Forget the key" removes the provider and its key.
import { useSelector } from '@tanstack/react-form'
import { PlugZapIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { SettingsSection } from '@/components/settings-section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { SecretValue } from '@/components/ui/secret-value'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import {
  LLM_API_KEY_MAX_LENGTH,
  LLM_BASE_URL_MAX_LENGTH,
  LLM_MODEL_MAX_LENGTH,
  providerCallFailure,
  type ProviderInfo,
  type ProviderKind,
  type StoredProvider,
  storeProvider,
  useLlmProviders,
  useStoredProvider,
  useTestProvider,
} from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

interface ProviderFields {
  kind: ProviderKind
  model: string
  baseUrl: string
  apiKey: string
}

export function LlmProviderSection() {
  const t = useT()
  const providers = useLlmProviders()
  if (providers.isError)
    return (
      <SettingsSection title={t.llm.providerTitle} description={t.llm.providerHint}>
        <Alert variant="destructive">
          <AlertDescription>{t.llm.loadFailed}</AlertDescription>
        </Alert>
      </SettingsSection>
    )
  if (!providers.data) return <Skeleton className="h-80 w-full" />
  return (
    <ProviderForm
      providers={providers.data.providers}
      allowedBaseUrls={providers.data.allowedBaseUrls}
    />
  )
}

/** A fresh form: the first kind the server lists, with its first suggested model. */
function emptyFields(providers: ProviderInfo[]): ProviderFields {
  const first = providers.at(0)
  return {
    kind: first?.kind ?? 'anthropic',
    model: first?.models.at(0) ?? '',
    baseUrl: '',
    apiKey: '',
  }
}

/** The form as the saved provider left it (never with its key), or a fresh one. */
function initialFields(stored: StoredProvider | null, providers: ProviderInfo[]): ProviderFields {
  if (!stored) return emptyFields(providers)
  return { kind: stored.kind, model: stored.model, baseUrl: stored.baseUrl ?? '', apiKey: '' }
}

/** The kind's suggestions, plus a typed model name so the field can show it. */
function modelNames(info: ProviderInfo | undefined, model: string): string[] {
  const suggestions = info?.models ?? []
  return model && !suggestions.includes(model) ? [...suggestions, model] : suggestions
}

/** The saved key for this kind, if any: kept when the key field is left empty. */
function savedKey(stored: StoredProvider | null, kind: ProviderKind): string | null {
  return stored?.kind === kind && stored.apiKey ? stored.apiKey : null
}

/** The form's values as a provider to save or test. */
function toProvider(
  fields: ProviderFields,
  providers: ProviderInfo[],
  stored: StoredProvider | null,
): StoredProvider {
  return {
    kind: fields.kind,
    model: fields.model.trim(),
    apiKey: fields.apiKey.trim() || (savedKey(stored, fields.kind) ?? ''),
    ...(providers.find((p) => p.kind === fields.kind)?.takesBaseUrl
      ? { baseUrl: fields.baseUrl.trim() }
      : {}),
  }
}

function useProviderSchema(providers: ProviderInfo[], stored: StoredProvider | null) {
  const t = useT()
  return z
    .object({
      kind: z.custom<ProviderKind>((value) => providers.some((p) => p.kind === value)),
      model: z
        .string()
        .trim()
        .min(1, t.llm.modelRequired)
        .max(LLM_MODEL_MAX_LENGTH, t.agents.textTooLong(LLM_MODEL_MAX_LENGTH)),
      baseUrl: z.string().trim().max(LLM_BASE_URL_MAX_LENGTH),
      apiKey: z.string().trim().max(LLM_API_KEY_MAX_LENGTH),
    })
    .superRefine((fields, ctx) => {
      const info = providers.find((p) => p.kind === fields.kind)
      if (info?.takesBaseUrl && !fields.baseUrl)
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: t.llm.baseUrlRequired })
      else if (info?.takesBaseUrl && !/^https?:\/\/\S+$/i.test(fields.baseUrl))
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: t.llm.baseUrlInvalid })
      if (info?.requiresApiKey && !fields.apiKey && !savedKey(stored, fields.kind))
        ctx.addIssue({ code: 'custom', path: ['apiKey'], message: t.llm.apiKeyRequired })
    })
}

/** "Test" with the form's values (checked as for Save, not saved), and its outcome. */
function useConnectionTest() {
  const t = useT()
  const { locale } = useLocale()
  const test = useTestProvider()
  const failureText = useProviderFailureText()
  const [outcome, setOutcome] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = async (provider: StoredProvider) => {
    setOutcome(null)
    try {
      const result = await test.mutateAsync(provider)
      setOutcome(
        result.ok
          ? { ok: true, text: t.llm.testOk(new Intl.NumberFormat(locale).format(result.latencyMs)) }
          : { ok: false, text: failureText({ kind: 'provider', reason: result.reason }) },
      )
    } catch (error) {
      setOutcome({ ok: false, text: failureText(providerCallFailure(error)) })
    }
  }
  const clear = () => {
    setOutcome(null)
  }
  return { run, pending: test.isPending, outcome, clear }
}

function ProviderForm({
  providers,
  allowedBaseUrls,
}: {
  providers: ProviderInfo[]
  allowedBaseUrls: string[]
}) {
  const t = useT()
  const stored = useStoredProvider()
  const schema = useProviderSchema(providers, stored)
  const test = useConnectionTest()

  const form = useAppForm({
    defaultValues: initialFields(stored, providers),
    validators: { onSubmit: schema },
    onSubmit: ({ value, formApi }) => {
      storeProvider(toProvider(value, providers, stored))
      formApi.setFieldValue('apiKey', '')
      toast.success(t.llm.saved)
    },
  })
  const kind = useSelector(form.store, (s) => s.values.kind)
  const model = useSelector(form.store, (s) => s.values.model)
  const info = providers.find((p) => p.kind === kind)
  const saved = savedKey(stored, kind)
  const models = modelNames(info, model)

  const footer = (
    <span className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={test.pending}
        aria-busy={test.pending || undefined}
        onClick={() => {
          void (async () => {
            await form.validate('submit')
            if (form.state.isValid) await test.run(toProvider(form.state.values, providers, stored))
          })()
        }}
      >
        {test.pending ? <Spinner className="text-current" /> : <PlugZapIcon />}
        {test.pending ? t.llm.testing : t.llm.test}
      </Button>
      {stored && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            storeProvider(null)
            test.clear()
            form.reset(emptyFields(providers))
            toast.success(t.llm.forgotten)
          }}
        >
          <Trash2Icon /> {t.llm.forget}
        </Button>
      )}
    </span>
  )

  return (
    <SettingsSection
      title={t.llm.providerTitle}
      description={t.llm.providerHint}
      form={form}
      footer={footer}
    >
      <form.AppField
        name="kind"
        listeners={{
          onChange: ({ value }) => {
            // A new kind starts from its first suggestion; a base URL only fits some kinds.
            const next = providers.find((p) => p.kind === value)
            form.setFieldValue('model', next?.models.at(0) ?? '')
            if (!next?.takesBaseUrl) form.setFieldValue('baseUrl', '')
            test.clear()
          },
        }}
      >
        {(field) => (
          <field.SelectField
            label={t.llm.kind}
            options={providers.map((p) => ({ value: p.kind, label: t.llm.kinds[p.kind] }))}
          />
        )}
      </form.AppField>
      <form.AppField name="model">
        {(field) => (
          <field.ComboboxField
            label={t.llm.model}
            description={t.llm.modelHint}
            placeholder={t.llm.modelPlaceholder}
            searchPlaceholder={t.llm.modelSearch}
            options={models.map((name) => ({ value: name, label: name }))}
            onCreate={() => undefined}
          />
        )}
      </form.AppField>
      {info?.takesBaseUrl && (
        <form.AppField name="baseUrl">
          {(field) => (
            <field.TextField
              label={t.llm.baseUrl}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder={allowedBaseUrls.at(0) ?? 'http://localhost:11434'}
              description={<BaseUrlHint allowed={allowedBaseUrls} />}
            />
          )}
        </form.AppField>
      )}
      {saved && <SavedKey value={saved} />}
      <form.AppField name="apiKey">
        {(field) => (
          <field.PasswordField
            label={t.llm.apiKey}
            autoComplete="off"
            description={<KeyHint saved={!!saved} optional={info?.requiresApiKey === false} />}
          />
        )}
      </form.AppField>
      {test.outcome && (
        <Alert variant={test.outcome.ok ? 'success' : 'destructive'} role="status">
          <AlertDescription>{test.outcome.text}</AlertDescription>
        </Alert>
      )}
    </SettingsSection>
  )
}

function BaseUrlHint({ allowed }: { allowed: string[] }) {
  const t = useT()
  return allowed.length > 0 ? t.llm.baseUrlAllowed(allowed.join(', ')) : t.llm.baseUrlNoneAllowed
}

function KeyHint({ saved, optional }: { saved: boolean; optional: boolean }) {
  const t = useT()
  if (saved) return t.llm.apiKeyKeep
  return optional ? t.llm.apiKeyOptional : t.llm.apiKeyRequiredHint
}

/** The key saved in this browser, masked, so the user can tell which one it is. */
function SavedKey({ value }: { value: string }) {
  const t = useT()
  return (
    <Field>
      <FieldLabel>{t.llm.savedKey}</FieldLabel>
      <SecretValue
        value={value}
        label={t.llm.savedKey}
        visibleStart={3}
        visibleEnd={4}
        copy={false}
      />
    </Field>
  )
}
