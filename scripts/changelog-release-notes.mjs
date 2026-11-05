#!/usr/bin/env node
/**
 * Print a GITHUB_OUTPUT-formatted multiline value combining the matching
 * version section from apps/api/CHANGELOG.md and apps/web/CHANGELOG.md
 * (both written by `changeset version`, see .github/workflows/changesets.yml)
 * for a GitHub Release body. Used only by release.yml.
 *
 *   node scripts/changelog-release-notes.mjs X.Y.Z
 */

import { existsSync, readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/changelog-release-notes.mjs X.Y.Z')
  process.exit(1)
}

function extractSection(path, version) {
  if (!existsSync(path)) return null
  const lines = readFileSync(path, 'utf8').split('\n')
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${version}`)
  if (headingIndex === -1) return null

  let nextHeadingIndex = lines.findIndex((line, i) => i > headingIndex && /^## /.test(line))
  if (nextHeadingIndex === -1) nextHeadingIndex = lines.length

  return lines
    .slice(headingIndex + 1, nextHeadingIndex)
    .join('\n')
    .trim()
}

const sections = [
  ['apps/api', extractSection('apps/api/CHANGELOG.md', version)],
  ['apps/web', extractSection('apps/web/CHANGELOG.md', version)],
].filter(([, body]) => body)

if (sections.length === 0) {
  console.error(
    `No "## ${version}" section found in apps/api/CHANGELOG.md or apps/web/CHANGELOG.md.`,
  )
  process.exit(1)
}

const notes = sections.map(([label, body]) => `### ${label}\n\n${body}`).join('\n\n')

process.stdout.write(`notes<<RELEASE_NOTES_EOF\n${notes}\nRELEASE_NOTES_EOF\n`)
