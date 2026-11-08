import type { Skill } from './schemas.ts'
import { SKILLS_DATA } from './skills-data.ts'
import type { TARGETS } from './targets.ts'

/**
 * The date the hand-picked skills were last checked: each URL at its pinned tag or commit, its
 * `SKILL.md`, and the tools of `SKILL_TARGET_SOURCES` confirmed to load Agent Skills.
 */
export const SKILLS_VERIFIED_ON = '2026-11-08'

/** Where each target documents its support of Agent Skills (`SKILL.md` folders). */
export const SKILL_TARGET_SOURCES = {
  'claude-code': 'https://code.claude.com/docs/en/skills',
  codex: 'https://developers.openai.com/codex/skills',
  cursor: 'https://cursor.com/docs/skills',
  'github-copilot': 'https://code.visualstudio.com/docs/agent-customization/agent-skills',
  'gemini-cli': 'https://geminicli.com/docs/cli/using-agent-skills',
  generic: 'https://agentskills.io',
} as const satisfies Record<(typeof TARGETS)[number], string>

/** The most active skills the API's catalog holds; the search keeps the most installed ones. */
export const SKILLS_MAX = 30

/**
 * The hand-picked third-party skills, all in the Agent Skills format, each pinned to a tag or a
 * commit: links only, never installed nor run by Coreloom UML. The API seeds its `skills` table
 * with them; `matchSkills` is given the table's active skills.
 */
export const SKILLS: readonly Skill[] = SKILLS_DATA
