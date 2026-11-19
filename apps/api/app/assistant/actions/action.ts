import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import type { ActionFailure, AssistantTargetKind } from '#app/assistant/constants/assistant'
import type User from '#app/users/models/user'

/*
 * What the assistant can do on the account's work, one file per domain. A `read` action runs
 * during the model's loop and answers bounded data of the caller's account only. A `write` action
 * never runs during the loop: it is stored as a proposal, and `apply` runs only when the owner
 * accepts it, through the same service as the matching HTTP route (same checks, same side
 * effects). Never declare an action on the account, its keys or tokens, the administration,
 * the flags or GitHub.
 */

/** The target a write action names is missing or not the caller's: nothing is proposed. */
export const TARGET_NOT_FOUND: unique symbol = Symbol('target not found')

/** What an accepted action created or changed, or why it could not be applied. */
export type ActionApplied =
  | { kind: AssistantTargetKind; id: number }
  | { failure: typeof ActionFailure.NotFound }
  | { failure: typeof ActionFailure.Invalid | typeof ActionFailure.Conflict; message: string }

type ActionBase<S extends z.ZodType> = { name: string; description: string; input: S }

export type ReadActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Read
  read(input: z.output<S>, user: User): Promise<unknown>
}

export type WriteActionDefinition<S extends z.ZodType> = ActionBase<S> & {
  kind: typeof AssistantToolKind.Write
  destructive?: true
  /**
   * Why the input can never be applied, read from the input alone (no query): the model is told
   * and nothing is proposed, so the owner is not shown a card that can only fail.
   */
  problem?(input: z.output<S>): string | null
  /** The display name of the target now (null for a creation), or `TARGET_NOT_FOUND`. */
  subject(input: z.output<S>, user: User): Promise<string | null | typeof TARGET_NOT_FOUND>
  /** Runs inside the transaction (`client`) that stores the action's new status. */
  apply(input: z.output<S>, user: User, client: TransactionClientContract): Promise<ActionApplied>
}

/** An action with its input type erased: every entry point parses the input with `input` first. */
export type AssistantAction =
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Read
      read(input: unknown, user: User): Promise<unknown>
    })
  | (ActionBase<z.ZodType> & {
      kind: typeof AssistantToolKind.Write
      destructive?: true
      problem?(input: unknown): string | null
      subject(input: unknown, user: User): Promise<string | null | typeof TARGET_NOT_FOUND>
      apply(input: unknown, user: User, client: TransactionClientContract): Promise<ActionApplied>
    })

export function readAction<S extends z.ZodType>(
  definition: ReadActionDefinition<S>,
): AssistantAction {
  return {
    ...definition,
    read: (input, user) => definition.read(definition.input.parse(input), user),
  }
}

export function writeAction<S extends z.ZodType>(
  definition: WriteActionDefinition<S>,
): AssistantAction {
  return {
    ...definition,
    problem: (input) => definition.problem?.(definition.input.parse(input)) ?? null,
    subject: (input, user) => definition.subject(definition.input.parse(input), user),
    apply: (input, user, client) => definition.apply(definition.input.parse(input), user, client),
  }
}

/** A positive id, as the routes' `withoutDecimals().min(1)`. */
export const idInput = () => z.number().int().positive()

/** Most items a list action answers: the newest first. */
export const ASSISTANT_READ_LIST_MAX = 50

/** What the model is told of a target that is missing or not the caller's. */
export const NOT_FOUND_SENTENCE = 'Not found: no such item exists in this account.'
