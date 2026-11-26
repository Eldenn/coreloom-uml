// The one-time offer for a key an older version of the settings left in this browser's entry:
// save it to the account (`PUT /llm/api-keys/:kind`, which tests it first) or remove it. Either
// way, and when the save fails, the entry is rewritten without it (`dropLegacyCredential`); what
// the account cannot or need not save (`legacySaveBody` answers null) is dropped without asking.
// Mounted once in the signed-in shell, so the offer shows on whatever page the user opens first.
import * as React from 'react'

import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import {
  dropLegacyCredential,
  providerCallFailure,
  useLegacyCredential,
  useLlmProviders,
  useSaveApiKey,
} from '@/lib/llm-provider'
import { legacySaveBody } from '@/lib/llm-provider-body'
import { useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

export function LegacyKeyOffer() {
  const t = useT()
  const legacy = useLegacyCredential()
  const providers = useLlmProviders({ enabled: legacy !== null })
  const save = useSaveApiKey()
  const failureText = useProviderFailureText()
  const known = legacy !== null && providers.data !== undefined
  const body = known ? legacySaveBody(legacy, providers.data.providers) : null
  const drop = known && body === null

  React.useEffect(() => {
    if (drop) dropLegacyCredential()
  }, [drop])

  if (!legacy || !body) return null
  const provider = t.llm.kinds[body.kind]

  const keep = async () => {
    try {
      await save.mutateAsync(body)
      toast.success(t.llm.legacy.saved)
    } catch (error) {
      toast.error(t.llm.legacy.failed(failureText(providerCallFailure(error))))
    } finally {
      dropLegacyCredential()
    }
  }
  const decline = () => {
    dropLegacyCredential()
    toast.success(t.llm.legacy.declined)
  }

  return (
    <Banner
      tone="warning"
      floating
      className="mb-4"
      title={t.llm.legacy.title}
      action={
        <>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending}
            aria-busy={save.isPending || undefined}
            onClick={() => {
              void keep()
            }}
          >
            {save.isPending && <Spinner className="text-current" />}
            {save.isPending ? t.llm.legacy.saving : t.llm.legacy.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={decline}
          >
            {t.llm.legacy.decline}
          </Button>
        </>
      }
    >
      {body.apiKey
        ? t.llm.legacy.text(provider, body.apiKey.slice(-4))
        : t.llm.legacy.textServer(provider, body.baseUrl ?? '')}
    </Banner>
  )
}
