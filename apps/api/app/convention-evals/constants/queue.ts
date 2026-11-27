/**
 * The queue of the convention tests (`RunConventionEvalJob`): listened to by the
 * `convention-evals` worker only (`queue:work --queues=convention-evals`); every other worker
 * names its queues without this one. Kept apart so `config/queue.ts` imports nothing else.
 */
export const CONVENTION_EVALS_QUEUE = 'convention-evals' as const
