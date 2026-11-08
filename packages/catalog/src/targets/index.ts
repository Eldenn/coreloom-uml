import { Target } from '../targets.ts'
import { claudeCode } from './claude-code.ts'
import { codex } from './codex.ts'
import { cursor } from './cursor.ts'
import { geminiCli } from './gemini-cli.ts'
import { generic } from './generic.ts'
import { githubCopilot } from './github-copilot.ts'
import type { TargetTemplate } from './types.ts'

export const TARGET_TEMPLATES: Readonly<Record<Target, TargetTemplate>> = {
  [Target.Generic]: generic,
  [Target.Codex]: codex,
  [Target.Cursor]: cursor,
  [Target.GithubCopilot]: githubCopilot,
  [Target.ClaudeCode]: claudeCode,
  [Target.GeminiCli]: geminiCli,
}
