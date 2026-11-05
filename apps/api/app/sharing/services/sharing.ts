import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import encryption from '@adonisjs/core/services/encryption'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import type Architecture from '#app/architectures/models/architecture'
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  ACCESS_GRANT_MAX_AGE,
  SHARE_LINK_PATH,
  SHARE_TOKEN_BYTES,
  SharingPurpose,
} from '#app/sharing/constants/sharing'
import env from '#start/env'

export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}

export function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)]
  }
  return code
}

/** What people type: upper-cased, spaces and dashes dropped. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export function encryptAccessCode(code: string): string {
  return encryption.encrypt(code, { purpose: SharingPurpose.AccessCode })
}

/** RM-23: readable by the owner only, through this service. */
export function readAccessCode(architecture: Architecture): string | null {
  if (!architecture.accessCode) return null
  return encryption.decrypt<string>(architecture.accessCode, SharingPurpose.AccessCode)
}

export function accessCodeMatches(architecture: Architecture, input: string): boolean {
  const expected = readAccessCode(architecture)
  if (!expected) return false
  const given = Buffer.from(normalizeAccessCode(input))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export function shareLink(architecture: Architecture): string | null {
  if (!architecture.shareToken) return null
  return `${env.get('FRONTEND_URL')}${SHARE_LINK_PATH}/${architecture.shareToken}`
}

/** True when the link opens anything at all (RM-21: private keeps the token but closes it). */
export function isShared(architecture: Architecture): boolean {
  return (
    architecture.shareToken !== null && architecture.visibility !== ArchitectureVisibility.Private
  )
}

type AccessGrant = { architectureId: number; v: number }

/** Proof that this browser entered the current code of this architecture. */
export function createAccessGrant(architecture: Architecture): string {
  return encryption.encrypt(
    { architectureId: architecture.id, v: architecture.accessVersion } satisfies AccessGrant,
    { expiresIn: ACCESS_GRANT_MAX_AGE, purpose: SharingPurpose.AccessGrant },
  )
}

/** RM-24: a grant made before the code was regenerated no longer counts. */
export function accessGrantIsValid(architecture: Architecture, grant: string | undefined): boolean {
  if (!grant) return false
  const payload = encryption.decrypt<AccessGrant>(grant, SharingPurpose.AccessGrant)
  return (
    payload !== null &&
    payload.architectureId === architecture.id &&
    payload.v === architecture.accessVersion
  )
}

/**
 * Applies a visibility (RM-20 to RM-24): the first shared visibility mints the
 * token; protected mints a code when there is none; leaving protected drops
 * the code and every grant made with it.
 */
export function applyVisibility(architecture: Architecture, visibility: ArchitectureVisibility) {
  if (visibility !== ArchitectureVisibility.Private && !architecture.shareToken) {
    architecture.shareToken = generateShareToken()
  }
  if (visibility === ArchitectureVisibility.Protected && !architecture.accessCode) {
    architecture.accessCode = encryptAccessCode(generateAccessCode())
    architecture.accessVersion += 1
  }
  if (visibility !== ArchitectureVisibility.Protected && architecture.accessCode) {
    architecture.accessCode = null
    architecture.accessVersion += 1
  }
  architecture.visibility = visibility
}
