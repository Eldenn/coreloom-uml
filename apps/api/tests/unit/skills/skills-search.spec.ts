import { test } from '@japa/runner'
import {
  cleanText,
  type KnownSkill,
  mergeAffinities,
  readFrontmatter,
  renderReport,
  type SearchOptions,
  searchSkills,
} from '#app/skills/services/skills-search'
import {
  FOLDER,
  fakeFetch,
  known,
  NEW_FOLDER,
  NEW_SHA,
  plan,
  type Route,
  routes,
  SHA,
  skillMd,
} from '#tests/unit/skills/skills-search-fixtures'

function run(
  knownSkills: KnownSkill[],
  network: Record<string, Route> = routes(),
  options: Partial<SearchOptions> = {},
) {
  const fake = fakeFetch(network)
  const result = searchSkills({
    known: knownSkills,
    plan,
    fetch: fake.fn,
    githubToken: 'token',
    minInstalls: 500,
    githubChecks: 200,
    ...options,
  })
  return { result, calls: fake.calls }
}

const bySlug = (records: Awaited<ReturnType<typeof searchSkills>>['records']) =>
  new Map(records.map((record) => [record.slug, record]))

test.group('searchSkills', () => {
  test('keeps every skill found, and makes the audited, licensed ones eligible, pinned to a commit', async ({
    assert,
  }) => {
    const { records, report } = await run([]).result
    const found = bySlug(records)
    assert.deepEqual(
      records.map((record) => record.slug),
      ['danger', 'browser-tests', 'c4-docs', 'rare'],
    )

    assert.deepInclude(found.get('browser-tests'), {
      isNew: true,
      origin: 'search',
      registryId: 'acme/skills/browser-tests',
      source: 'acme/skills',
      seen: true,
      checked: true,
      eligible: true,
      ineligibleReason: null,
      name: 'browser-tests (acme)',
      description: { en: 'Drive a browser with Playwright bsafely/b.' },
      url: `https://github.com/acme/skills/tree/${SHA}/skills/browser-tests`,
      license: 'MIT',
      contentSha: FOLDER,
      installs: 4000,
    })
    // Found by two queries: both affinities and both topics.
    assert.deepEqual(found.get('browser-tests')?.affinities, [
      { slot: 'testing.levels', values: ['e2e'] },
      { diagramKinds: ['c4'] },
    ])
    assert.deepEqual(found.get('browser-tests')?.topics, ['testing', 'architecture'])
    assert.deepEqual(found.get('c4-docs')?.audits, [
      { provider: 'gen', risk: 'safe', analyzedAt: '2026-11-02' },
      { provider: 'socket', risk: 'safe', analyzedAt: '2026-11-02' },
    ])

    assert.deepInclude(found.get('danger'), {
      eligible: false,
      ineligibleReason: 'audit snyk: high',
      checked: false,
      url: 'https://skills.sh/risky/skills/danger',
      description: { en: '' },
    })
    assert.deepInclude(found.get('rare'), {
      eligible: false,
      ineligibleReason: 'fewer than 500 installs',
    })
    assert.deepEqual(report, {
      found: 4,
      added: ['danger', 'browser-tests', 'c4-docs', 'rare'],
      checked: 2,
      eligible: 2,
      warnings: [],
    })
  })

  test('reads a repository once for all its skills, and never audits a skill under the threshold', async ({
    assert,
  }) => {
    const { result, calls } = run([])
    await result
    const urls = calls.map((call) => call.url)
    assert.equal(urls.filter((url) => url === 'https://api.github.com/repos/acme/skills').length, 1)
    assert.notInclude(urls.join('\n'), 'skills=rare')
  })

  test('keeps the pin of a skill whose folder did not change, without reading its SKILL.md', async ({
    assert,
  }) => {
    const { result, calls } = run([known()])
    const record = bySlug((await result).records).get('browser-tests')
    assert.deepInclude(record, {
      isNew: false,
      eligible: true,
      checked: true,
      url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/browser-tests`,
      description: {
        en: 'Drive a browser with Playwright bsafely/b.',
        fr: 'Piloter un navigateur.',
      },
      installs: 4000,
    })
    assert.notInclude(calls.map((call) => call.url).join('\n'), '/browser-tests/SKILL.md')
  })

  test('re-pins a skill whose folder changed, keeping its slug and translation', async ({
    assert,
  }) => {
    const { result } = run([known({ slug: 'browser-tests-acme', contentSha: NEW_FOLDER })])
    const record = bySlug((await result).records).get('browser-tests-acme')
    assert.deepInclude(record, {
      isNew: false,
      url: `https://github.com/acme/skills/tree/${SHA}/skills/browser-tests`,
      contentSha: FOLDER,
      // Same English text: the French one is kept.
      description: {
        en: 'Drive a browser with Playwright bsafely/b.',
        fr: 'Piloter un navigateur.',
      },
    })
  })

  test('makes a skill ineligible when its audit now fails or its licence is not open', async ({
    assert,
  }) => {
    const audited = await run(
      [known()],
      routes({
        'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': {
          body: { 'browser-tests': { snyk: { risk: 'medium', analyzedAt: '2026-11-05' } } },
        },
      }),
    ).result
    assert.deepInclude(bySlug(audited.records).get('browser-tests'), {
      eligible: false,
      ineligibleReason: 'audit snyk: medium',
      // Still catalogued with what was known of it.
      url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/browser-tests`,
    })

    const licensed = await run(
      [known()],
      routes({
        'https://api.github.com/repos/acme/skills': {
          body: { default_branch: 'main', license: { spdx_id: 'GPL-3.0' } },
        },
      }),
    ).result
    assert.deepInclude(bySlug(licensed.records).get('browser-tests'), {
      eligible: false,
      checked: true,
      ineligibleReason: 'licence not accepted: GPL-3.0',
    })
  })

  test('checks the most installed skills first, and leaves the rest for a later run', async ({
    assert,
  }) => {
    const { records } = await run(
      [known({ slug: 'c4-docs', registryId: 'acme/skills/c4-docs' })],
      routes(),
      {
        githubChecks: 1,
      },
    ).result
    const found = bySlug(records)
    assert.isTrue(found.get('browser-tests')?.checked)
    // Not checked this time: a pinned skill keeps its pin and stays eligible…
    assert.deepInclude(found.get('c4-docs'), { checked: false, eligible: true })

    const fresh = bySlug((await run([], routes(), { githubChecks: 1 }).result).records)
    // …a new one waits.
    assert.deepInclude(fresh.get('c4-docs'), {
      checked: false,
      eligible: false,
      ineligibleReason: 'not checked on GitHub yet',
    })
  })

  test('re-checks an eligible skill no search returned, with its previous figures', async ({
    assert,
  }) => {
    const gone = known({
      slug: 'old',
      registryId: 'acme/skills/old',
      installs: 800,
      contentSha: 'e'.repeat(40),
    })
    const { records } = await run([gone]).result
    assert.deepInclude(bySlug(records).get('old'), {
      seen: false,
      checked: false,
      eligible: false,
      ineligibleReason: 'no security audit yet',
      installs: 800,
    })
  })

  test('only updates registry figures for manual and blocked skills', async ({ assert }) => {
    const manual = known({
      slug: 'hand-picked',
      origin: 'manual',
      registryId: null,
      url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/c4-docs`,
      contentSha: null,
    })
    const blocked = known({ blocked: true, eligible: false, ineligibleReason: 'kept out' })
    const { result, calls } = run([manual, blocked], {
      ...routes(),
      [`https://api.github.com/repos/acme/skills/contents/skills/c4-docs/SKILL.md?ref=${NEW_SHA}`]:
        { body: {} },
    })
    const { records, report } = await result
    const found = bySlug(records)
    // The manual skill is matched to its registry entry by its GitHub folder.
    assert.deepInclude(found.get('hand-picked'), {
      origin: 'manual',
      registryId: 'acme/skills/c4-docs',
      installs: 2500,
      checked: false,
    })
    assert.deepInclude(found.get('browser-tests'), {
      checked: false,
      eligible: false,
      ineligibleReason: 'kept out',
    })
    assert.isFalse(calls.some((call) => call.url.includes('/skills/browser-tests/SKILL.md')))
    assert.deepEqual(report.warnings, [])
  })

  test('warns when a manual skill’s pin is gone', async ({ assert }) => {
    const manual = known({
      slug: 'hand-picked',
      origin: 'manual',
      registryId: null,
      url: `https://github.com/someone/repo/tree/${SHA}/skills/hand-picked`,
    })
    const { report } = await run([manual]).result
    assert.deepEqual(report.warnings, ['hand-picked: SKILL.md not found at its pin (404)'])
  })

  test('reports a failed search and goes on with the other queries', async ({ assert }) => {
    const { records, report } = await run(
      [],
      routes({ 'https://skills.sh/api/search?q=playwright': { status: 500, body: {} } }),
    ).result
    assert.deepEqual(
      records.map((record) => record.slug),
      ['browser-tests', 'c4-docs'],
    )
    assert.deepEqual(report.warnings, ['search "playwright" failed: 500 from skills.sh'])
  })

  test('stops when every search fails, or an audit request fails', async ({ assert }) => {
    await assert.rejects(
      () => run([], { 'https://skills.sh/api/search*': { status: 503, body: {} } }).result,
      'Every skills.sh search failed: nothing was changed',
    )
    await assert.rejects(
      () =>
        run(
          [],
          routes({
            'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': {
              status: 500,
              body: {},
            },
          }),
        ).result,
      '500 from www.skills.sh',
    )
  })

  test('sends the GitHub token to the GitHub API only', async ({ assert }) => {
    const { result, calls } = run([])
    await result
    assert.isAbove(calls.length, 0)
    for (const call of calls) {
      assert.equal(
        call.auth,
        call.url.startsWith('https://api.github.com/') ? 'Bearer token' : null,
        call.url,
      )
    }
  })
})

test.group('skills search helpers', () => {
  test('reads plain, quoted and folded frontmatter', ({ assert }) => {
    assert.deepEqual(readFrontmatter(skillMd('a', 'plain text')), {
      name: 'a',
      description: 'plain text',
    })
    assert.deepEqual(readFrontmatter("---\nname: 'b'\ndescription: >\n  folded\n  text\n---\n"), {
      name: 'b',
      description: 'folded text',
    })
    assert.deepEqual(readFrontmatter('no frontmatter'), {})
  })

  test('cleans text to one line without HTML or markers, and cuts it', ({ assert }) => {
    assert.equal(cleanText('a\n<b>c</b> coreloom-uml:begin', 100), 'a bc/b begin')
    assert.equal(cleanText('x'.repeat(10), 5), 'xxxx…')
  })

  test('merges values and kinds of the same affinity', ({ assert }) => {
    assert.deepEqual(
      mergeAffinities([{ slot: 'testing.levels', values: ['e2e'] }, { diagramKinds: ['c4'] }], {
        slot: 'testing.levels',
        values: ['unit', 'e2e'],
      }),
      [{ slot: 'testing.levels', values: ['e2e', 'unit'] }, { diagramKinds: ['c4'] }],
    )
    assert.deepEqual(
      mergeAffinities([{ diagramKinds: ['c4'] }], { diagramKinds: ['class', 'c4'] }),
      [{ diagramKinds: ['c4', 'class'] }],
    )
  })

  test('renders the report as one line', ({ assert }) => {
    assert.equal(
      renderReport({ found: 3, added: ['a'], checked: 2, eligible: 1, warnings: ['w'] }),
      '3 skills found; 1 new; 2 checked on GitHub; 1 eligible; w',
    )
  })
})
