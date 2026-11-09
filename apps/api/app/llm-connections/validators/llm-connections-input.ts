import vine from '@vinejs/vine'

/**
 * The code the user copied from Claude's sign-in page, passed as is to the binary's stdin: printable
 * ASCII on one line only, so it cannot feed the binary a second line.
 */
export const claudeCodeInput = vine.create(
  vine.object({
    code: vine
      .string()
      .trim()
      .regex(/^[\x21-\x7E]{1,500}$/),
  }),
)
