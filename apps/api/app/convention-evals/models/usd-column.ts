/** A dollar amount column: Postgres answers a `decimal` as a string. */
export const usdColumn = {
  consume: (value: unknown) => (value === null || value === undefined ? null : Number(value)),
}
