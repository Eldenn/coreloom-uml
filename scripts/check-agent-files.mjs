#!/usr/bin/env node
/**
 * Fail when a coding-agent instruction or settings file is tracked by git.
 * AGENTS.md (Authorship) keeps them out of this repository: project rules live
 * in AGENTS.md only. `packages/catalog` is exempt because it holds the
 * templates the product generates for its users (product data, not files this
 * repository uses).
 */

import { execFileSync } from 'node:child_process'

/** File names that a coding agent reads as its own instructions or settings. */
const FORBIDDEN_FILE_NAMES = new Set([
  'CLAUDE.md',
  'CLAUDE.local.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'copilot-instructions.md',
])

/** Folders that hold a coding agent's instructions, settings or plans. */
const FORBIDDEN_DIRECTORIES = new Set([
  '.claude',
  '.cursor',
  '.gemini',
  '.windsurf',
  '.codex',
  '.clinerules',
])

/** Paths where these names are product data. */
const EXEMPT_PREFIXES = ['packages/catalog/']

const tracked = execFileSync('git', ['ls-files', '-z'], { stdio: ['ignore', 'pipe', 'inherit'] })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const offending = tracked.filter((path) => {
  if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) return false
  const segments = path.split('/')
  const name = segments.at(-1)
  return (
    FORBIDDEN_FILE_NAMES.has(name) ||
    segments.slice(0, -1).some((segment) => FORBIDDEN_DIRECTORIES.has(segment))
  )
})

if (offending.length > 0) {
  console.error('Coding-agent files must not be committed (see AGENTS.md, Authorship):')
  for (const path of offending) console.error(`  ${path}`)
  process.exit(1)
}

console.log(`No coding-agent files tracked (${tracked.length} files checked).`)
