/**
 * The filter every text of a convention test goes through before anything stores or logs it: a
 * trial's transcript, Harbor's outputs, a grader's reason. It looks for the credential of the run
 * (its exact value and its base64, base64url, hex and URL-encoded forms, the encoded ones at any
 * alignment, and also in the text with its white space removed, since `base64` and `xxd -p` wrap
 * their lines) and for the shapes of the secrets a trial could reach (`SECRET_PATTERNS`). A match
 * is never redacted and kept: the trial and the run are `leaked` and no output is stored at all.
 */

/**
 * Not after a letter, a digit, `_` or `-`: a key starts a token, so a kebab-case name that holds
 * `sk-` (`task-management-system-v2`, `desk-booking-…`, `risk-assessment-…`) is no key.
 */
const START = '(?<![A-Za-z0-9_-])'

/** The key shapes looked for beside the run's own credential. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  // Anthropic API and OAuth keys.
  new RegExp(`${START}sk-ant-[A-Za-z0-9_-]{20,}`),
  // OpenAI keys (project, service account, admin and legacy).
  new RegExp(`${START}sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}`),
  // E2B keys and access tokens.
  new RegExp(`${START}e2b_[A-Za-z0-9]{20,}`),
  new RegExp(`${START}sk_e2b_[A-Za-z0-9]{20,}`),
  // GitHub tokens: classic, OAuth, user-to-server, server-to-server, refresh, fine-grained.
  new RegExp(`${START}gh[pousr]_[A-Za-z0-9]{30,}`),
  new RegExp(`${START}github_pat_[A-Za-z0-9_]{40,}`),
  // A ChatGPT subscription's tokens are JWTs.
  new RegExp(`${START}eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}`),
]

/** A secret shorter than this is not looked for as such (it would match by chance). */
const MIN_SECRET_LENGTH = 8

/**
 * What of `encoded(prefix + secret)` does not depend on what comes before and after the secret
 * in the text: base64 shifts with the secret's offset modulo 3, so each of the three offsets
 * gives its own core.
 */
function base64Cores(secret: string, encode: (bytes: Buffer) => string): string[] {
  const cores: string[] = []
  for (let offset = 0; offset < 3; offset++) {
    const encoded = encode(
      Buffer.concat([Buffer.alloc(offset), Buffer.from(secret, 'utf8')]),
    ).replace(/=+$/, '')
    // Drop the characters that mix in the bytes before, and the last group, which mixes in after.
    const start = Math.ceil((offset * 4) / 3)
    const end = encoded.length - 4
    if (end - start >= MIN_SECRET_LENGTH) cores.push(encoded.slice(start, end))
  }
  return cores
}

/** Every form of `secret` a text may hold it in. */
export function secretForms(secret: string): string[] {
  if (secret.length < MIN_SECRET_LENGTH) return []
  const hex = Buffer.from(secret, 'utf8').toString('hex')
  return [
    ...new Set([
      secret,
      encodeURIComponent(secret),
      hex,
      hex.toUpperCase(),
      ...base64Cores(secret, (bytes) => bytes.toString('base64')),
      ...base64Cores(secret, (bytes) => bytes.toString('base64url')),
    ]),
  ]
}

/** Looks for secrets in the texts of one trial, against the forms of the run's credentials. */
export class SecretFilter {
  readonly #forms: string[]

  constructor(secrets: readonly string[]) {
    this.#forms = secrets.flatMap(secretForms)
  }

  /** Whether `text` holds a credential of the run or a secret's shape. */
  leaks(text: string): boolean {
    // Wrapped output (`base64` at 76 columns, `xxd -p` at 60) reads whole once unwrapped.
    const unwrapped = text.replace(/\s+/g, '')
    if (this.#forms.some((form) => text.includes(form) || unwrapped.includes(form))) return true
    return SECRET_PATTERNS.some((pattern) => pattern.test(text))
  }
}
