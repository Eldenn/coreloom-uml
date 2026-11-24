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

/**
 * The folder of the repository each target loads Agent Skills from, one sub-folder per skill named
 * after its `name` (read on the pages of `SKILL_TARGET_SOURCES` on `SKILL_FOLDERS_VERIFIED_ON`).
 * Codex, Cursor and Gemini CLI all read `.agents/skills`; Claude Code reads only `.claude/skills`;
 * VS Code reads `.github/skills` for Copilot.
 */
export const SKILL_FOLDERS = {
  'claude-code': '.claude/skills',
  codex: '.agents/skills',
  cursor: '.agents/skills',
  'github-copilot': '.github/skills',
  'gemini-cli': '.agents/skills',
  generic: '.agents/skills',
} as const satisfies Record<(typeof TARGETS)[number], string>

export const SKILL_FOLDERS_VERIFIED_ON = '2026-11-24'

/**
 * A skill's `name` as the Agent Skills specification allows it, which is also its folder's name
 * (Cursor and VS Code refuse a folder named otherwise).
 */
export const SKILL_NAME = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The most active skills the API's catalog holds; the search keeps the most installed ones. */
export const SKILLS_MAX = 30

/**
 * The hand-picked third-party skills, all in the Agent Skills format, each pinned to a tag or a
 * commit, never run by Coreloom UML: the CLI installs only a copy the admin approved (`skills add`,
 * `GET /skills/:slug/copy`). The API seeds its `skills` table
 * with them; `matchSkills` is given the table's active skills.
 */
export const SKILLS: readonly Skill[] = SKILLS_DATA
