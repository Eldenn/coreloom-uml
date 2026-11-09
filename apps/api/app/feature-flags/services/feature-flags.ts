import db from '@adonisjs/lucid/services/db'
import {
  evaluateFeatureFlag,
  FEATURE_FLAGS,
  type FeatureFlagDeclaration,
  type FeatureFlagKey,
  type FeatureFlagState,
  featureFlagStateSchema,
} from '@coreloom-uml/feature-flags'
import FeatureFlag from '#app/feature-flags/models/feature-flag'
import FeatureFlagChange from '#app/feature-flags/models/feature-flag-change'
import type User from '#app/users/models/user'

/** Changes shown per flag in the admin screen, newest first. */
export const FEATURE_FLAG_HISTORY_LENGTH = 50

type Person = Pick<User, 'id' | 'email'>

export type AdminFeatureFlag = {
  key: FeatureFlagKey
  name: string
  description: string
  tags: string[]
  state: FeatureFlagState
  history: { id: number; at: string; author: string | null; text: string }[]
}

function declaration(key: FeatureFlagKey): FeatureFlagDeclaration {
  const found = FEATURE_FLAGS.find((flag) => flag.key === key)
  if (!found) throw new Error(`Undeclared feature flag: ${key}`)
  return found
}

/** The stored state, or the declared default when there is none or it no longer parses. */
function parsedState(flag: FeatureFlagDeclaration, stored: unknown): FeatureFlagState {
  if (stored === undefined) return flag.defaultState
  const parsed = featureFlagStateSchema.safeParse(stored)
  return parsed.success ? parsed.data : flag.defaultState
}

async function storedStates(): Promise<Map<string, unknown>> {
  const rows = await FeatureFlag.query().whereIn(
    'key',
    FEATURE_FLAGS.map((flag) => flag.key),
  )
  return new Map(rows.map((row) => [row.key, row.state]))
}

export async function stateOf(key: FeatureFlagKey): Promise<FeatureFlagState> {
  const row = await FeatureFlag.find(key)
  return parsedState(declaration(key), row?.state)
}

function context(user: Person) {
  return { id: String(user.id), email: user.email }
}

export async function isFeatureEnabled(key: FeatureFlagKey, user: Person): Promise<boolean> {
  return evaluateFeatureFlag(key, await stateOf(key), context(user))
}

/** Every declared flag, evaluated for this person. */
export async function evaluateAll(user: Person): Promise<Record<FeatureFlagKey, boolean>> {
  const stored = await storedStates()
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [
      flag.key,
      evaluateFeatureFlag(flag.key, parsedState(flag, stored.get(flag.key)), context(user)),
    ]),
  ) as Record<FeatureFlagKey, boolean>
}

/** What changed, in a line ("Enabled, rollout 25% → 50%"), or null when nothing did. */
export function describeChange(before: FeatureFlagState, after: FeatureFlagState): string | null {
  const parts: string[] = []
  if (before.enabled !== after.enabled) parts.push(after.enabled ? 'Enabled' : 'Disabled')
  if (before.rollout !== after.rollout) {
    parts.push(`rollout ${before.rollout}% → ${after.rollout}%`)
  }
  if (JSON.stringify(before.rules) !== JSON.stringify(after.rules)) {
    parts.push(
      before.rules.length === after.rules.length
        ? 'rules edited'
        : `rules ${before.rules.length} → ${after.rules.length}`,
    )
  }
  if (parts.length === 0) return null
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Stores a flag's new state and a line of history, unless nothing changed. */
export async function updateFlag(
  key: FeatureFlagKey,
  state: FeatureFlagState,
  by: Person,
): Promise<void> {
  await db.transaction(async (trx) => {
    const row = await FeatureFlag.query({ client: trx }).where('key', key).forUpdate().first()
    const text = describeChange(parsedState(declaration(key), row?.state), state)
    if (text === null) return
    await FeatureFlag.updateOrCreate({ key }, { state }, { client: trx })
    await FeatureFlagChange.create({ flagKey: key, userId: by.id, text }, { client: trx })
  })
}

export async function listForAdmin(): Promise<AdminFeatureFlag[]> {
  const stored = await storedStates()
  return Promise.all(
    FEATURE_FLAGS.map(async (flag) => {
      const changes = await FeatureFlagChange.query()
        .where('flag_key', flag.key)
        .preload('user')
        .orderBy('id', 'desc')
        .limit(FEATURE_FLAG_HISTORY_LENGTH)
      return {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        tags: flag.tags,
        state: parsedState(flag, stored.get(flag.key)),
        history: changes.map((change) => ({
          id: change.id,
          at: change.createdAt.toISO() ?? '',
          author: change.user?.email ?? null,
          text: change.text,
        })),
      }
    }),
  )
}
