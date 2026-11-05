/**
 * Avatar upload limits, enforced at the HTTP boundary
 * (`POST /account/avatar`). Single source of truth for the accepted file
 * extensions, their `Content-Type`s, and the maximum upload size — referenced
 * by the validator, the controller, and the download route.
 */
export const AVATAR_MAX_SIZE = '5mb' as const

/** File extensions accepted by `request.file('avatar', { extnames })`. */
export const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

export type AvatarExtension = (typeof AVATAR_EXTENSIONS)[number]

export function isAvatarExtension(value: string): value is AvatarExtension {
  return AVATAR_EXTENSIONS.some((ext) => ext === value)
}

/** Extension → `Content-Type`, used when storing and when streaming back. */
export const AVATAR_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const satisfies Record<AvatarExtension, string>
