import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: Gemini CLI loads GEMINI.md by default; `context.fileName` in its
 * settings can name other files (AGENTS.md included), and GEMINI.md can import a file with
 * `@./path.md`. The pointer is a GEMINI.md that imports AGENTS.md.
 */
export const geminiCli: TargetTemplate = {
  target: Target.GeminiCli,
  name: 'Gemini CLI',
  verifiedOn: '2026-11-08',
  sources: ['https://geminicli.com/docs/cli/gemini-md/'],
  readsAgentsMd: false,
  pointer: { path: 'GEMINI.md', body: '@./AGENTS.md' },
  recommendations: () => [
    {
      title: 'Gemini CLI context file',
      body: 'GEMINI.md imports AGENTS.md. Instead, you can set `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` in `.gemini/settings.json` and leave GEMINI.md out.',
    },
  ],
}
