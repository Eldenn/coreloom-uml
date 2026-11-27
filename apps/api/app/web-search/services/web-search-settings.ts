import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { keyHintOf } from '#app/llm-connections/services/llm-api-keys'
import {
  INSTANCE_OWNER,
  openLlmSecret,
  sealLlmSecret,
} from '#app/llm-connections/services/llm-secrets'
import type { WebSearchKind } from '#app/web-search/constants/web-search'
import WebSearchSetting from '#app/web-search/models/web-search-setting'

/** The saved service as the admin screen shows it: never the key itself. */
export type WebSearchSummary = { kind: WebSearchKind; keyHint: string; verifiedAt: DateTime }

/** The saved row and its opened key, or `null` when none is saved or its key does not open. */
async function openedSetting(): Promise<{ row: WebSearchSetting; apiKey: string } | null> {
  const row = await WebSearchSetting.query().first()
  if (!row) return null
  const apiKey = openLlmSecret(row.sealedKey, LlmSecretPurpose.WebSearchKey, INSTANCE_OWNER)
  return apiKey === null ? null : { row, apiKey }
}

/**
 * The saved service, or `null` when none is saved or its key no longer opens (the encryption key
 * changed). This module is the only code that reads `web_search_settings`.
 */
export async function savedWebSearch(): Promise<WebSearchSummary | null> {
  const opened = await openedSetting()
  if (!opened) return null
  const { kind, keyHint, verifiedAt } = opened.row
  return { kind, keyHint, verifiedAt }
}

/** The service and its key, as a search uses them; `null` like `savedWebSearch`. */
export async function webSearchKey(): Promise<{ kind: WebSearchKind; apiKey: string } | null> {
  const opened = await openedSetting()
  return opened ? { kind: opened.row.kind, apiKey: opened.apiKey } : null
}

/** Whether a search can run: a service is saved and its key opens. */
export async function webSearchReady(): Promise<boolean> {
  return (await openedSetting()) !== null
}

/**
 * Stores the service and its key, sealed, replacing any other service in the same transaction:
 * one at a time. The caller has already checked the key (`WebSearch.check`).
 */
export async function saveWebSearch(
  kind: WebSearchKind,
  apiKey: string,
): Promise<WebSearchSummary> {
  const row = await db.transaction(async (trx) => {
    await WebSearchSetting.query({ client: trx }).whereNot('kind', kind).delete()
    return WebSearchSetting.updateOrCreate(
      { kind },
      {
        sealedKey: sealLlmSecret(apiKey, LlmSecretPurpose.WebSearchKey, INSTANCE_OWNER),
        keyHint: keyHintOf(apiKey),
        verifiedAt: DateTime.now(),
      },
      { client: trx },
    )
  })
  return { kind: row.kind, keyHint: row.keyHint, verifiedAt: row.verifiedAt }
}

/** Deletes the saved service; deleting when none is saved does nothing. */
export async function deleteWebSearch(): Promise<void> {
  await WebSearchSetting.query().delete()
}
