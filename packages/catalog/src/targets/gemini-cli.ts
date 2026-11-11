import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-11. Instructions: Gemini CLI loads GEMINI.md by default; `context.fileName`
 * in its settings can name other files (AGENTS.md included), and GEMINI.md can import a file
 * with `@./path.md`. The pointer is a GEMINI.md that imports AGENTS.md.
 *
 * Settings (`.gemini/settings.json`): `tools.allowed` lists what runs without a confirmation,
 * such as `run_shell_command(npm test)`. Nothing is denied from here: `tools.exclude` is
 * deprecated in favour of the policy engine, whose workspace policies are disabled.
 */
export const geminiCli: TargetTemplate = {
  target: Target.GeminiCli,
  name: 'Gemini CLI',
  verifiedOn: '2026-11-11',
  sources: [
    'https://geminicli.com/docs/cli/gemini-md/',
    'https://geminicli.com/docs/reference/configuration/',
    'https://geminicli.com/docs/reference/policy-engine/',
  ],
  readsAgentsMd: false,
  pointer: { path: 'GEMINI.md', body: '@./AGENTS.md' },
  settings: ({ checks }) =>
    checks.length === 0
      ? null
      : {
          path: '.gemini/settings.json',
          content: JSON.stringify(
            { tools: { allowed: checks.map((command) => `run_shell_command(${command})`) } },
            null,
            2,
          ),
        },
  recommendations: () => [
    {
      title: 'Gemini CLI context file',
      body: 'GEMINI.md imports AGENTS.md. Instead, you can set `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` in `.gemini/settings.json` and leave GEMINI.md out.',
    },
  ],
}
