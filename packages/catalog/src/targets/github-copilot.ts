import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: GitHub Copilot reads AGENTS.md as project instructions, as an
 * alternative to `.github/copilot-instructions.md`, and the Copilot agent also finds nested
 * ones. In VS Code's local agent, `chat.useAgentsMdFile` includes the root file and
 * `chat.useNestedAgentsMdFiles` (experimental, off by default) the nested ones. No pointer
 * needed.
 */
export const githubCopilot: TargetTemplate = {
  target: Target.GithubCopilot,
  name: 'GitHub Copilot',
  verifiedOn: '2026-11-08',
  sources: [
    'https://code.visualstudio.com/docs/agent-customization/custom-instructions',
    'https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference',
  ],
  readsAgentsMd: true,
  recommendations: () => [
    {
      title: 'GitHub Copilot in VS Code',
      body: 'Copilot reads AGENTS.md as the project instructions. In VS Code, check that the `chat.useAgentsMdFile` setting is on; turn on `chat.useNestedAgentsMdFiles` too if you add AGENTS.md files in subfolders.',
    },
  ],
}
