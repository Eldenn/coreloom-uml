/**
 * PostgreSQL error codes (SQLSTATE) referenced by name instead of as bare
 * string literals. Extend as new codes are needed.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PgErrorCode = {
  /** `unique_violation` — a row would break a UNIQUE constraint or index. */
  UniqueViolation: '23505',
} as const
