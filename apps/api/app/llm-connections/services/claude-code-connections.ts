import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type User from '#app/users/models/user'
import llmConfig from '#config/llm'

type Person = Pick<User, 'id'>

/** The account's own `CLAUDE_CONFIG_DIR`, created private (0700) on first use. */
export async function claudeConfigDir(user: Person): Promise<string> {
  const dir = join(llmConfig.claudeCodeHome, String(user.id))
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}
