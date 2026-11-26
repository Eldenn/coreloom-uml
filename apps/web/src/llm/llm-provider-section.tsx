// Settings, "LLM provider": the user's own provider for proposed rules (bring your own key, or a
// connected ChatGPT or Claude subscription). The kind and the model stay in this browser
// (`useStoredProvider`), kept as soon as they change once the account can call that kind
// (`autoSaved`). A key, with the server URL of a kind that takes one, is saved to the account on
// "Save" (`PUT /llm/api-keys/:kind`, which tests it first) and shown back as its last four
// characters, its server and its date; it can be replaced (a new key, then "Save") or deleted.
// "Test" calls `POST /llm/test` with the kind and the model: it tests the saved key. A
// subscription is connected on the server (`SubscriptionConnection`), and its kinds show only
// while their flag is on.
import { useSelector } from '@tanstack/react-form'
import { PlugZapIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { SettingsSection } from '@/components/settings-section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { useFeature } from '@/lib/feature-flags'
import {
  LLM_API_KEY_MAX_LENGTH,
  LLM_API_KEY_MIN_LENGTH,
  LLM_BASE_URL_MAX_LENGTH,
  LLM_MODEL_MAX_LENGTH,
  providerCallFailure,
  type ProviderInfo,
  type ProviderKind,
  type StoredProvider,
  storeProvider,
  useDeleteApiKey,
  useLlmProviders,
  useSaveApiKey,
  useStoredProvider,
  useTestProvider,
} from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'
import {
  autoSaved,
  isSubscription,
  keyToSave,
  type ProviderFields,
  savedBaseUrl,
  saveProblem,
  toProvider,
} from '@/llm/provider-fields'
import { SubscriptionConnection } from '@/llm/subscription-connection'

/** The flag behind each subscription kind; the API already leaves out a kind whose flag is off. */
function useVisibleKind() {
  const chatgpt = useFeature('llm-subscription-chatgpt')
  const claude = useFeature('llm-subscription-claude')
  const flags: Partial<Record<ProviderKind, boolean>> = {
    'openai-codex': chatgpt,
    'claude-code': claude,
  }
  return (kind: ProviderKind) => flags[kind] ?? true
}

export function LlmProviderSection() {
  const t = useT()
  const providers = useLlmProviders()
  const visible = useVisibleKind()
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
      providers={providers.data.providers.filter((p) => visible(p.kind))}
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
    baseUrl: savedBaseUrl(first),
    apiKey: '',
  }
}

/** The form as this browser's provider and the account's saved server URL left it. */
function initialFields(stored: StoredProvider | null, providers: ProviderInfo[]): ProviderFields {
  const info = stored && providers.find((p) => p.kind === stored.kind)
  if (!stored || !info) return emptyFields(providers)
  return { kind: stored.kind, model: stored.model, baseUrl: savedBaseUrl(info), apiKey: '' }
}

/** The kind's suggestions, plus a typed model name so the field can show it. */
function modelNames(info: ProviderInfo | undefined, model: string): string[] {
  const suggestions = info?.models ?? []
  return model && !suggestions.includes(model) ? [...suggestions, model] : suggestions
}

function useProviderSchema(providers: ProviderInfo[]) {
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
      apiKey: z
        .string()
        .trim()
        .max(LLM_API_KEY_MAX_LENGTH, t.agents.textTooLong(LLM_API_KEY_MAX_LENGTH)),
    })
    .superRefine((fields, ctx) => {
      const info = providers.find((p) => p.kind === fields.kind)
      if (info?.takesBaseUrl && !fields.baseUrl)
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: t.llm.baseUrlRequired })
      else if (info?.takesBaseUrl && !/^https?:\/\/\S+$/i.test(fields.baseUrl))
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: t.llm.baseUrlInvalid })
      if (fields.apiKey && fields.apiKey.length < LLM_API_KEY_MIN_LENGTH)
        ctx.addIssue({
          code: 'custom',
          path: ['apiKey'],
          message: t.llm.apiKeyTooShort(LLM_API_KEY_MIN_LENGTH),
        })
      const problem = saveProblem(fields, info)
      if (problem) ctx.addIssue({ code: 'custom', path: ['apiKey'], message: t.llm[problem] })
    })
}

interface Outcome {
  ok: boolean
  text: string
}

/** "Test" with the saved key and the form's model; its outcome goes to `report`. */
function useConnectionTest(report: (outcome: Outcome | null) => void) {
  const t = useT()
  const { locale } = useLocale()
  const test = useTestProvider()
  const failureText = useProviderFailureText()
  const run = async (provider: StoredProvider) => {
    report(null)
    try {
      const result = await test.mutateAsync(provider)
      report(
        result.ok
          ? { ok: true, text: t.llm.testOk(new Intl.NumberFormat(locale).format(result.latencyMs)) }
          : { ok: false, text: failureText({ kind: 'provider', reason: result.reason }) },
      )
    } catch (error) {
      report({ ok: false, text: failureText(providerCallFailure(error)) })
    }
  }
  return { run, pending: test.isPending }
}

/**
 * "Save": the key or server URL first, to the account (`keyToSave`; a refusal is reported and
 * nothing else is kept), then the kind and the model in this browser.
 */
function useSaveProvider(providers: ProviderInfo[], report: (outcome: Outcome | null) => void) {
  const t = useT()
  const saveKey = useSaveApiKey()
  const failureText = useProviderFailureText()
  return async (value: ProviderFields): Promise<boolean> => {
    report(null)
    const body = keyToSave(
      value,
      providers.find((p) => p.kind === value.kind),
    )
    if (body) {
      try {
        await saveKey.mutateAsync(body)
      } catch (error) {
        report({ ok: false, text: failureText(providerCallFailure(error)) })
        return false
      }
    }
    storeProvider(toProvider(value))
    toast.success(body ? t.llm.keySaved : t.llm.saved)
    return true
  }
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
  const schema = useProviderSchema(providers)
  // The outcome of "Test", or why "Save" could not save the key, announced under the form.
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const test = useConnectionTest(setOutcome)
  const save = useSaveProvider(providers, setOutcome)
  const keyFieldRef = React.useRef<HTMLDivElement>(null)

  const form = useAppForm({
    defaultValues: initialFields(stored, providers),
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      if (await save(value)) formApi.setFieldValue('apiKey', '')
    },
  })
  const kind = useSelector(form.store, (s) => s.values.kind)
  const model = useSelector(form.store, (s) => s.values.model)
  const info = providers.find((p) => p.kind === kind)
  const models = modelNames(info, model)
  const subscription = isSubscription(info)
  // Testable once the account holds a key for the kind, or the subscription is connected.
  const untestable = info?.connected === false
  const autoSave = () => {
    const next = autoSaved(form.state.values, providers)
    if (next) storeProvider(next)
  }
  const focusKeyField = () => {
    keyFieldRef.current?.querySelector('input')?.focus()
  }

  const footer = (
    <span className="flex flex-wrap items-center gap-2">
      <TestButton
        pending={test.pending}
        untestable={untestable}
        hint={subscription ? t.llm.subscription.connectFirst : t.llm.saveKeyFirst}
        onClick={() => {
          void test.run(toProvider(form.state.values))
        }}
      />
      {stored && (
        <ForgetButton
          onForget={() => {
            setOutcome(null)
            form.reset(emptyFields(providers))
          }}
        />
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
            // A new kind starts from its first suggestion and from its own saved server URL.
            const next = providers.find((p) => p.kind === value)
            form.setFieldValue('model', next?.models.at(0) ?? '')
            form.setFieldValue('baseUrl', savedBaseUrl(next))
            form.setFieldValue('apiKey', '')
            setOutcome(null)
            autoSave()
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
      <form.AppField name="model" listeners={{ onChange: autoSave }}>
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
      {info && subscription ? (
        <SubscriptionConnection provider={info} />
      ) : (
        <>
          {info?.connected && (
            <SavedKey
              provider={info}
              onDeleted={() => {
                setOutcome(null)
                focusKeyField()
              }}
            />
          )}
          <div ref={keyFieldRef}>
            <form.AppField name="apiKey">
              {(field) => (
                <field.PasswordField
                  label={t.llm.apiKey}
                  autoComplete="off"
                  description={<KeyHint provider={info} />}
                />
              )}
            </form.AppField>
          </div>
        </>
      )}
      {/* Mounted empty, so the outcome is announced when it appears. */}
      <div role="status">
        {outcome && (
          <Alert variant={outcome.ok ? 'success' : 'destructive'} role="none">
            <AlertDescription>{outcome.text}</AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsSection>
  )
}

/** "Test", with why it is disabled shown next to it (not only in a tooltip). */
function TestButton({
  pending,
  untestable,
  hint,
  onClick,
}: {
  pending: boolean
  untestable: boolean
  hint: string
  onClick: () => void
}) {
  const t = useT()
  const hintId = React.useId()
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || untestable}
        aria-describedby={untestable ? hintId : undefined}
        aria-busy={pending || undefined}
        onClick={onClick}
      >
        {pending ? <Spinner className="text-current" /> : <PlugZapIcon />}
        {pending ? t.llm.testing : t.llm.test}
      </Button>
      {untestable && <span id={hintId}>{hint}</span>}
    </>
  )
}

/** Forgets the provider kept in this browser; the account's saved keys stay. */
function ForgetButton({ onForget }: { onForget: () => void }) {
  const t = useT()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        storeProvider(null)
        onForget()
        toast.success(t.llm.forgotten)
      }}
    >
      <Trash2Icon /> {t.llm.forget}
    </Button>
  )
}

function BaseUrlHint({ allowed }: { allowed: string[] }) {
  const t = useT()
  return allowed.length > 0 ? t.llm.baseUrlAllowed(allowed.join(', ')) : t.llm.baseUrlNoneAllowed
}

function KeyHint({ provider }: { provider: ProviderInfo | undefined }) {
  const t = useT()
  if (provider?.keyHint) return t.llm.apiKeyReplace
  return provider?.requiresApiKey === false ? t.llm.apiKeyOptional : t.llm.apiKeyRequiredHint
}

/**
 * The key the account saved for this kind, as the API answers it (its last four characters,
 * its server, the date it was checked: never the key), and its deletion.
 */
function SavedKey({ provider, onDeleted }: { provider: ProviderInfo; onDeleted: () => void }) {
  const t = useT()
  const { locale } = useLocale()
  const remove = useDeleteApiKey()
  const label = t.llm.kinds[provider.kind]
  const verified = provider.verifiedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(provider.verifiedAt))
    : null
  const deleteKey = async () => {
    try {
      await remove.mutateAsync(provider.kind)
      toast.success(t.llm.keyDeleted)
      onDeleted()
    } catch {
      toast.error(t.llm.keyDeleteFailed)
    }
  }
  return (
    <Field>
      <FieldLabel asChild>
        <span>{t.llm.savedKey}</span>
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-foreground">
          {provider.keyHint ? t.llm.savedKeyHint(provider.keyHint) : t.llm.savedKeyNone}
        </span>
        {provider.baseUrl && (
          <span className="text-muted-foreground">{t.llm.savedKeyServer(provider.baseUrl)}</span>
        )}
        {verified && (
          <span className="text-muted-foreground">{t.llm.savedKeyVerified(verified)}</span>
        )}
        <Popconfirm
          title={t.llm.deleteKeyConfirm(label)}
          description={t.llm.deleteKeyText}
          confirmLabel={t.llm.deleteKey}
          destructive
          align="start"
          onConfirm={deleteKey}
        >
          <Button type="button" variant="ghost" size="sm">
            <Trash2Icon /> {t.llm.deleteKey}
          </Button>
        </Popconfirm>
      </div>
    </Field>
  )
}
