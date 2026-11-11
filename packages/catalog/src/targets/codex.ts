import { HASH_MARKERS, wrapManagedBlock } from '../render/managed-block.ts'
import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/** From this `workflow.autonomy` answer up, Codex asks before writing anything. */
const READ_ONLY_FROM = 5

/**
 * Verified 2026-11-11. Instructions: Codex reads AGENTS.md natively, from the project root down
 * to the working directory (one file per directory, `AGENTS.override.md` first, 32 KiB in total
 * by default). No pointer needed.
 *
 * Settings: a trusted project's `.codex/config.toml` overrides the user's. `approval_policy` is
 * `on-request` or `never` (`untrusted` is no longer supported, `on-failure` is deprecated);
 * `sandbox_mode` is `read-only`, `workspace-write` or `danger-full-access`. Only the first of
 * each is ever written here, and the sandbox comes from the autonomy answer.
 */
export const codex: TargetTemplate = {
  target: Target.Codex,
  name: 'Codex',
  verifiedOn: '2026-11-11',
  sources: [
    'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
    'https://learn.chatgpt.com/docs/config-file/config-reference',
  ],
  readsAgentsMd: true,
  settings: ({ autonomy }) =>
    autonomy === null
      ? null
      : {
          path: '.codex/config.toml',
          content: wrapManagedBlock(
            `approval_policy = "on-request"\nsandbox_mode = "${autonomy >= READ_ONLY_FROM ? 'read-only' : 'workspace-write'}"`,
            HASH_MARKERS,
          ),
        },
  recommendations: ({ autonomy }) =>
    autonomy === null
      ? []
      : [
          {
            title: 'Codex project settings',
            body: 'Codex loads `.codex/config.toml` only in a project you trust.',
          },
        ],
}
