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
  ACME_SOURCE,
  FOLDER,
  fakeFetch,
  known,
  NEW_FOLDER,
  NEW_SHA,
  plan,
  type Route,
  routes,
  SHA,
  SKILLS_SH_SOURCE,
  SMITHERY_PAGE,
  SMITHERY_SOURCE,
  skillMd,
  smitheryPages,
  smitherySkill,
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
    sources: [SKILLS_SH_SOURCE],
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
      copied: [],
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
      'Every source failed: nothing was changed',
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
    // A rule one query fits is no longer one the skill goes against.
    assert.deepEqual(
      mergeAffinities(
        [{ slot: 'workflow.autonomy', values: ['agree'], against: ['disagree', 'other'] }],
        { slot: 'workflow.autonomy', values: ['disagree'], against: ['agree'] },
      ),
      [{ slot: 'workflow.autonomy', values: ['agree', 'disagree'], against: ['other'] }],
    )
    assert.deepEqual(
      mergeAffinities([{ diagramKinds: ['c4'] }], { diagramKinds: ['class', 'c4'] }),
      [{ diagramKinds: ['c4', 'class'] }],
    )
  })

  test('renders the report as one line', ({ assert }) => {
    assert.equal(
      renderReport({
        found: 3,
        added: ['a'],
        checked: 2,
        eligible: 1,
        copied: ['a'],
        warnings: ['w'],
      }),
      '3 skills found; 1 new; 2 checked on GitHub; 1 eligible; 1 copied for review; w',
    )
  })
})

const BOTH = { sources: [SKILLS_SH_SOURCE, ACME_SOURCE] }
const down = (status = 500) => ({ status, body: {} })
const allSearches = (route: Route) =>
  Object.fromEntries(
    plan.map((item) => [
      `https://skills.sh/api/search?${new URLSearchParams({ q: item.query })}`,
      route,
    ]),
  )

/** A repository `owner/skills` (MIT) whose tree holds the given skill folders. */
function repository(owner: string, folders: string[], license: string | null = 'MIT') {
  return {
    [`https://api.github.com/repos/${owner}/skills`]: {
      body: { default_branch: 'main', license: license ? { spdx_id: license } : null },
    },
    [`https://api.github.com/repos/${owner}/skills/commits/main`]: { body: { sha: SHA } },
    [`https://api.github.com/repos/${owner}/skills/git/trees/${SHA}?recursive=1`]: {
      body: {
        tree: folders.flatMap((folder, index) => [
          { path: folder, type: 'tree', sha: index.toString(16).padStart(40, '0') },
          { path: `${folder}/SKILL.md`, type: 'blob', sha: 'f'.repeat(40) },
        ]),
      },
    },
  }
}

const github = (owner: string, id = 3) => ({ ...ACME_SOURCE, id, owner })

test.group('searchSkills with sources', () => {
  test('a skill a GitHub source lists is trusted: eligible with no installs and no audit', async ({
    assert,
  }) => {
    const { records, sources } = await run([], routes(), BOTH).result
    assert.deepInclude(bySlug(records).get('lint-rules'), {
      registryId: 'acme/skills/lint-rules',
      source: 'acme/skills',
      origin: 'search',
      installs: 0,
      audits: [],
      foundBy: [2],
      trusted: true,
      eligible: true,
      ineligibleReason: null,
    })
    assert.deepEqual(sources, [
      { sourceId: 1, ok: true, complete: true, error: null },
      { sourceId: 2, ok: true, complete: true, error: null },
    ])
  })

  test('a skill both sources find is one record, found by both, with skills.sh installs', async ({
    assert,
  }) => {
    const { records } = await run([], routes(), BOTH).result
    assert.lengthOf(
      records.filter((record) => record.slug.startsWith('browser-tests')),
      1,
    )
    assert.deepInclude(bySlug(records).get('browser-tests'), { foundBy: [1, 2], installs: 4000 })
  })

  test('a bad audit beats trust', async ({ assert }) => {
    const network = routes({
      'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=lint-rules': {
        body: { 'lint-rules': { snyk: { risk: 'high', analyzedAt: '2026-11-01' } } },
      },
    })
    const { records } = await run([], network, BOTH).result
    assert.deepInclude(bySlug(records).get('lint-rules'), {
      trusted: true,
      eligible: false,
      ineligibleReason: 'audit snyk: high',
    })
  })

  test('skills.sh down does not stop a GitHub source, and a failed audit keeps the last ones', async ({
    assert,
  }) => {
    const network = routes({
      ...allSearches(down()),
      'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': down(),
    })
    const { records, sources, report } = await run([known()], network, BOTH).result
    assert.deepEqual(sources[0], {
      sourceId: 1,
      ok: false,
      complete: false,
      error: 'every search failed',
    })
    assert.deepInclude(bySlug(records).get('lint-rules'), { eligible: true })
    assert.deepInclude(bySlug(records).get('browser-tests'), {
      eligible: true,
      audits: known().audits,
    })
    // Down, skills.sh is not asked for audits at all.
    assert.notExists(report.warnings.find((line) => line.includes('audits not read')))
  })

  test('a trusted skill whose audits cannot be read keeps the last ones', async ({ assert }) => {
    const network = routes({
      'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': down(),
    })
    const { records, report } = await run([known()], network, BOTH).result
    assert.deepInclude(bySlug(records).get('browser-tests'), {
      eligible: true,
      audits: known().audits,
    })
    assert.include(
      report.warnings,
      'browser-tests: audits not read (500 from www.skills.sh), the last ones kept',
    )
  })

  test('every source failing changes nothing', async ({ assert }) => {
    const network = routes({
      ...allSearches(down()),
      'https://api.github.com/repos/acme/skills': down(503),
    })
    await assert.rejects(
      () => run([], network, BOTH).result,
      'Every source failed: nothing was changed',
    )
  })

  test('without skills.sh no request goes to skills.sh', async ({ assert }) => {
    const { result, calls } = run([], routes(), { sources: [ACME_SOURCE] })
    const { records } = await result
    assert.deepEqual(records.map((record) => record.slug).sort(), [
      'browser-tests',
      'c4-docs',
      'lint-rules',
    ])
    assert.notExists(calls.find((call) => call.url.includes('skills.sh')))
  })

  test('a skill only skills.sh found stays eligible on its last figures when skills.sh is off', async ({
    assert,
  }) => {
    const frozen = known({
      slug: 'old-skill',
      registryId: 'other/skills/old-skill',
      url: `https://github.com/other/skills/tree/${SHA}/skills/old-skill`,
      contentSha: '0'.repeat(40),
      installs: 3000,
      description: { en: 'An old skill.' },
    })
    const network = routes(repository('other', ['skills/old-skill']))
    const { result, calls } = run([frozen], network, { sources: [ACME_SOURCE] })
    const { records } = await result
    assert.deepInclude(bySlug(records).get('old-skill'), {
      trusted: false,
      installs: 3000,
      audits: frozen.audits,
      eligible: true,
      checked: true,
    })
    assert.notExists(calls.find((call) => call.url.includes('skills.sh')))
  })

  test('an archived or unlicensed repository lists nothing and says why', async ({ assert }) => {
    const network = routes(repository('closed', ['skills/x'], null))
    const { records, sources } = await run([], network, {
      sources: [SKILLS_SH_SOURCE, github('closed')],
    }).result
    assert.deepEqual(sources[1], {
      sourceId: 3,
      ok: true,
      complete: true,
      error: 'licence not accepted: none',
    })
    assert.notExists(records.find((record) => record.source === 'closed/skills'))
  })

  test('a source lists at most 100 skills, in path order', async ({ assert }) => {
    const folders = Array.from(
      { length: 101 },
      (_, index) => `skills/s-${String(index).padStart(3, '0')}`,
    )
    const { records, report } = await run([], routes(repository('big', folders)), {
      sources: [github('big')],
    }).result
    const listed = records.filter((record) => record.source === 'big/skills')
    assert.lengthOf(listed, 100)
    assert.notExists(listed.find((record) => record.registryId === 'big/skills/s-100'))
    assert.include(report.warnings, 'big/skills: more than 100 skills, the first 100 kept')
  })

  test('trust outlives a run where its source failed', async ({ assert }) => {
    const trusted = known({
      slug: 'gone-skill',
      registryId: 'gone/skills/gone-skill',
      installs: 0,
      audits: [],
      trustedBy: [3],
    })
    const network = routes({ 'https://api.github.com/repos/gone/skills': down() })
    const { records, sources } = await run([trusted], network, {
      sources: [SKILLS_SH_SOURCE, github('gone')],
      githubChecks: 0,
    }).result
    assert.deepInclude(sources[1], { sourceId: 3, ok: false })
    assert.deepInclude(bySlug(records).get('gone-skill'), { trusted: true, eligible: true })
  })

  test('trusted skills are checked on GitHub first', async ({ assert }) => {
    const { records } = await run([], routes(), { ...BOTH, githubChecks: 1 }).result
    const checked = records.filter((record) => record.checked).map((record) => record.slug)
    assert.lengthOf(checked, 1)
    assert.isTrue(bySlug(records).get(checked[0] as string)?.trusted)
  })
})

test.group('searchSkills when a source is down', () => {
  test('skills.sh fully down freezes its skills instead of stopping the run', async ({
    assert,
  }) => {
    const frozen = known({
      slug: 'old-skill',
      registryId: 'other/skills/old-skill',
      url: `https://github.com/other/skills/tree/${SHA}/skills/old-skill`,
      contentSha: '0'.repeat(40),
      description: { en: 'An old skill.' },
    })
    const network = routes({
      ...allSearches(down()),
      'https://www.skills.sh/tele/audit*': down(),
      ...repository('other', ['skills/old-skill']),
    })
    const { records, sources } = await run([frozen], network, BOTH).result
    assert.deepInclude(sources[0], { sourceId: 1, ok: false })
    assert.deepInclude(bySlug(records).get('old-skill'), { eligible: true, audits: frozen.audits })
    assert.deepInclude(bySlug(records).get('lint-rules'), { eligible: true })
  })

  test('a trusted repository that fails leaves its skills as they are', async ({ assert }) => {
    const trusted = known({
      slug: 'gone-skill',
      registryId: 'gone/skills/gone-skill',
      url: `https://github.com/gone/skills/tree/${SHA}/skills/gone-skill`,
      installs: 0,
      audits: [],
      trustedBy: [3],
    })
    const network = routes({ 'https://api.github.com/repos/gone/skills': down() })
    const { records, sources } = await run([trusted], network, {
      sources: [SKILLS_SH_SOURCE, github('gone')],
    }).result
    assert.deepInclude(sources[1], { sourceId: 3, ok: false })
    assert.deepInclude(bySlug(records).get('gone-skill'), {
      trusted: true,
      eligible: true,
      checked: false,
      contentSha: FOLDER,
    })
  })

  test('a repository typed in another case is the same repository', async ({ assert }) => {
    const acmeTree =
      routes()[`https://api.github.com/repos/acme/skills/git/trees/${SHA}?recursive=1`]
    const network = routes({
      'https://api.github.com/repos/ACME/Skills': {
        body: { full_name: 'acme/skills', default_branch: 'main', license: { spdx_id: 'MIT' } },
      },
      'https://api.github.com/repos/ACME/Skills/commits/main': { body: { sha: SHA } },
      [`https://api.github.com/repos/ACME/Skills/git/trees/${SHA}?recursive=1`]: acmeTree as Route,
    })
    const { records } = await run([], network, {
      sources: [SKILLS_SH_SOURCE, { ...ACME_SOURCE, owner: 'ACME', repo: 'Skills' }],
    }).result
    assert.lengthOf(
      records.filter((record) => record.slug.startsWith('browser-tests')),
      1,
    )
    assert.deepInclude(bySlug(records).get('browser-tests'), {
      registryId: 'acme/skills/browser-tests',
      foundBy: [1, 2],
    })
  })
})

const ACME_TREE = `https://api.github.com/repos/acme/skills/git/trees/${SHA}?recursive=1`
const MARKETPLACE = `https://raw.githubusercontent.com/acme/skills/${SHA}/.claude-plugin/marketplace.json`

/** `acme/skills` with a `.claude-plugin/marketplace.json` listing `plugins`. */
function marketplace(plugins: unknown[]): Record<string, Route> {
  const tree = (routes()[ACME_TREE]?.body as { tree: unknown[] }).tree
  return {
    [ACME_TREE]: {
      body: {
        tree: [
          ...tree,
          { path: '.claude-plugin/marketplace.json', type: 'blob', sha: '9'.repeat(40) },
        ],
      },
    },
    [MARKETPLACE]: { body: { name: 'acme', plugins } },
  }
}

const rawSkill = (owner: string, folder: string) => ({
  [`https://raw.githubusercontent.com/${owner}/skills/${SHA}/${folder}/SKILL.md`]: {
    body: skillMd(folder.split('/').at(-1) as string, 'A skill from a marketplace.'),
  },
})

test.group('searchSkills with Smithery', () => {
  test('lists the verified skills of good quality, trusted like a repository', async ({
    assert,
  }) => {
    const tree = 'https://github.com/acme/skills/tree/main/skills'
    const network = routes(
      smitheryPages([
        smitherySkill(`${tree}/lint-rules`),
        smitherySkill(`${tree}/c4-docs`, { verified: false }),
        smitherySkill(`${tree}/browser-tests`, { qualityScore: 0.5 }),
        smitherySkill('https://gitlab.com/acme/skills/tree/main/skills/elsewhere'),
      ]),
    )
    const { result, calls } = run([], network, { sources: [SMITHERY_SOURCE] })
    const { records, sources } = await result
    assert.deepEqual(
      records.map((record) => record.slug),
      ['lint-rules'],
    )
    assert.deepInclude(records[0], {
      registryId: 'acme/skills/lint-rules',
      source: 'acme/skills',
      foundBy: [4],
      trusted: true,
      eligible: true,
      installs: 0,
      url: `https://github.com/acme/skills/tree/${SHA}/skills/lint-rules`,
    })
    assert.deepEqual(sources, [{ sourceId: 4, ok: true, complete: true, error: null }])
    assert.isFalse(calls.some((call) => call.url.includes('skills.sh')))
  })

  test('a page that fails keeps the pages before it, as a partial run', async ({ assert }) => {
    const network = routes({
      ...smitheryPages(
        [smitherySkill('https://github.com/acme/skills/tree/main/skills/lint-rules')],
        [],
      ),
      [`${SMITHERY_PAGE}2`]: down(),
    })
    const { records, sources } = await run([], network, { sources: [SMITHERY_SOURCE] }).result
    assert.deepInclude(bySlug(records).get('lint-rules'), { foundBy: [4] })
    assert.deepEqual(sources, [{ sourceId: 4, ok: true, complete: false, error: 'page 2 failed' }])
  })

  test('Smithery down does not stop skills.sh', async ({ assert }) => {
    const network = routes({ [`${SMITHERY_PAGE}1`]: down() })
    const { records, sources } = await run([], network, {
      sources: [SKILLS_SH_SOURCE, SMITHERY_SOURCE],
    }).result
    assert.deepInclude(sources[1], { sourceId: 4, ok: false })
    assert.deepInclude(bySlug(records).get('browser-tests'), { eligible: true })
  })

  test('a skill whose repository moved is ineligible, and the run goes on', async ({ assert }) => {
    const network = routes({
      ...smitheryPages([
        smitherySkill('https://github.com/old/skills/tree/main/skills/moved'),
        smitherySkill('https://github.com/acme/skills/tree/main/skills/lint-rules'),
      ]),
      'https://api.github.com/repos/old/skills': { status: 301, body: {} },
    })
    const { records } = await run([], network, { sources: [SMITHERY_SOURCE] }).result
    assert.deepInclude(bySlug(records).get('moved'), {
      checked: true,
      eligible: false,
      ineligibleReason: 'moved: /repos/old/skills',
    })
    assert.deepInclude(bySlug(records).get('lint-rules'), { eligible: true })
  })

  test('a skill skills.sh also finds, in another case, is one record', async ({ assert }) => {
    const network = routes(
      smitheryPages([
        smitherySkill('https://github.com/ACME/Skills/tree/main/skills/browser-tests'),
      ]),
    )
    const { records } = await run([], network, {
      sources: [SKILLS_SH_SOURCE, SMITHERY_SOURCE],
    }).result
    assert.lengthOf(
      records.filter((record) => record.slug.startsWith('browser-tests')),
      1,
    )
    assert.deepInclude(bySlug(records).get('browser-tests'), {
      registryId: 'acme/skills/browser-tests',
      foundBy: [1, 4],
      trusted: true,
    })
  })
})

test.group('searchSkills with a marketplace', () => {
  test("a repository's marketplace.json says which of its folders are skills", async ({
    assert,
  }) => {
    const network = routes(
      marketplace([{ name: 'tests', source: './', skills: ['./skills/browser-tests'] }]),
    )
    const { records } = await run([], network, { sources: [ACME_SOURCE] }).result
    assert.deepEqual(
      records.map((record) => record.slug),
      ['browser-tests'],
    )
    assert.deepInclude(records[0], { foundBy: [2], trusted: true, eligible: true })
  })

  test('the plugins it lists from other repositories are trusted too', async ({ assert }) => {
    const network = routes({
      ...marketplace([
        {
          name: 'ext',
          source: {
            source: 'git-subdir',
            url: 'https://github.com/other/skills.git',
            path: 'plugins/ext',
          },
        },
        { name: 'third', source: { source: 'github', repo: 'third/skills' } },
        { name: 'packaged', source: { source: 'npm', package: 'packaged' } },
      ]),
      ...repository('other', ['plugins/ext/skills/ext-skill', 'plugins/ext/docs/not-a-skill']),
      ...rawSkill('other', 'plugins/ext/skills/ext-skill'),
      ...repository('third', ['skills/third-skill']),
      ...rawSkill('third', 'skills/third-skill'),
    })
    const { records, sources } = await run([], network, { sources: [ACME_SOURCE] }).result
    assert.sameMembers(
      records.map((record) => record.slug),
      ['ext-skill', 'third-skill'],
    )
    assert.deepInclude(bySlug(records).get('ext-skill'), {
      registryId: 'other/skills/ext-skill',
      source: 'other/skills',
      foundBy: [2],
      trusted: true,
      eligible: true,
      url: `https://github.com/other/skills/tree/${SHA}/plugins/ext/skills/ext-skill`,
    })
    assert.deepEqual(sources, [{ sourceId: 2, ok: true, complete: true, error: null }])
  })

  test('a listed repository that fails leaves its skills as they are, the run goes on', async ({
    assert,
  }) => {
    const trusted = known({
      slug: 'gone-skill',
      registryId: 'gone/skills/gone-skill',
      url: `https://github.com/gone/skills/tree/${SHA}/skills/gone-skill`,
      installs: 0,
      audits: [],
      trustedBy: [2],
    })
    const network = routes({
      ...marketplace([
        { name: 'gone', source: { source: 'github', repo: 'gone/skills' } },
        { name: 'local', source: './', skills: ['./skills/lint-rules'] },
      ]),
      'https://api.github.com/repos/gone/skills': down(),
    })
    const { records, sources } = await run([trusted], network, { sources: [ACME_SOURCE] }).result
    assert.deepInclude(sources[0], { sourceId: 2, ok: true, complete: false })
    assert.deepInclude(bySlug(records).get('lint-rules'), { eligible: true })
    assert.deepInclude(bySlug(records).get('gone-skill'), {
      trusted: true,
      eligible: true,
      checked: false,
      contentSha: FOLDER,
    })
  })
})

test.group('searchSkills, review fixes', () => {
  test('a redirect from skills.sh stops the run instead of reading as no audit', async ({
    assert,
  }) => {
    const network = routes({
      'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': {
        status: 301,
        body: {},
      },
    })
    await assert.rejects(() => run([], network).result, '301 from www.skills.sh')
  })

  test('a GitHub error on one Smithery repository leaves that skill unchecked, the run goes on', async ({
    assert,
  }) => {
    const network = routes({
      ...smitheryPages([
        smitherySkill('https://github.com/blocked/skills/tree/main/skills/blocked'),
        smitherySkill('https://github.com/acme/skills/tree/main/skills/lint-rules'),
      ]),
      'https://api.github.com/repos/blocked/skills': { status: 451, body: {} },
    })
    const { records, report } = await run([], network, { sources: [SMITHERY_SOURCE] }).result
    assert.deepInclude(bySlug(records).get('blocked'), {
      eligible: false,
      ineligibleReason: 'not checked on GitHub yet',
    })
    assert.deepInclude(bySlug(records).get('lint-rules'), { eligible: true })
    assert.isTrue(report.warnings.some((line) => line.startsWith('blocked:')))
  })

  test('a marketplace with many plugins of one other repository reads it once, whole', async ({
    assert,
  }) => {
    const folders = Array.from({ length: 35 }, (_, index) => `plugins/p${index}/skills/s${index}`)
    const network = routes({
      ...marketplace(
        folders.map((_, index) => ({
          name: `p${index}`,
          source: {
            source: 'git-subdir',
            url: 'https://github.com/other/skills.git',
            path: `plugins/p${index}`,
          },
        })),
      ),
      ...repository('other', folders),
    })
    const { records, sources } = await run([], network, {
      sources: [ACME_SOURCE],
      githubChecks: 0,
    }).result
    assert.lengthOf(records, 35)
    assert.deepEqual(sources, [{ sourceId: 2, ok: true, complete: true, error: null }])
  })
})
