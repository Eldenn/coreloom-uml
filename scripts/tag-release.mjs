#!/usr/bin/env node
/**
 * Tag the current commit vX.Y.Z (from apps/api/package.json) and push the
 * tag. This is the `publish` command changesets/action runs — see
 * .github/workflows/changesets.yml — which only happens when there are no
 * changesets left pending, i.e. right after the auto-generated
 * "Version Packages" PR is merged. There is nothing to publish to any
 * registry (every workspace package is private); pushing this tag is what
 * actually constitutes "the release" — it triggers release.yml, which in
 * turn triggers deploy-production.yml.
 *
 * Idempotent: if the tag already exists, this is a no-op, so re-running the
 * workflow (or a push to main that isn't a release) never fails or
 * double-tags.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function git(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] })
    .toString('utf8')
    .trim()
}

const version = JSON.parse(readFileSync('apps/api/package.json', 'utf8')).version
const tag = `v${version}`

if (git(['tag', '-l', tag])) {
  console.log(`${tag} already exists — nothing to release.`)
  process.exit(0)
}

git(['tag', '-a', tag, '-m', tag])
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' })
console.log(`Pushed ${tag}.`)
