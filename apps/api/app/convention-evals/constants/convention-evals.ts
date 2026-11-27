/**
 * The queue of the convention evals (decision record, section 4): listened to by the
 * `convention-evals` worker only (`queue:work --queues=convention-evals`), the one image holding
 * Harbor and our Harbor classes. Every other worker names its queues without this one.
 */
export const CONVENTION_EVALS_QUEUE = 'convention-evals' as const
