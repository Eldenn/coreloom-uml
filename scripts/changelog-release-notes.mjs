#!/usr/bin/env node
/**
 * Print the matching version section from apps/api/CHANGELOG.md and
 * apps/web/CHANGELOG.md (both written by `changeset version`, see
 * .github/workflows/changesets.yml) as a GitHub Release body. Used only by
 * release.yml, which writes it to a file: a large release does not fit in an
 * argument. Past BODY_MAX_LENGTH (GitHub refuses a body over 125,000
 * characters) the notes are cut at a line and link to the full changelogs.
 *
 *   node scripts/changelog-release-notes.mjs X.Y.Z [owner/repo]
 */

import { existsSync, readFileSync } from 'node:fs'

const BODY_MAX_LENGTH = 120_000

const version = process.argv[2]
const repository = process.argv[3]
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

let notes = sections.map(([label, body]) => `### ${label}\n\n${body}`).join('\n\n')

if (notes.length > BODY_MAX_LENGTH) {
  const base = repository ? `https://github.com/${repository}/blob/v${version}` : '.'
  const links = sections.map(([label]) => `[${label}](${base}/${label}/CHANGELOG.md)`).join(', ')
  const cut = notes.slice(0, BODY_MAX_LENGTH)
  notes = `${cut.slice(0, cut.lastIndexOf('\n'))}\n\n…\n\nThe notes are cut here; read them whole in ${links}.`
}

process.stdout.write(`${notes}\n`)
