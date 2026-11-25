import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { SKILLS, TARGETS, TOPICS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import { SEED_TOPICS } from '#app/skills/constants/seed-topics'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import {
  classifySkillTopics,
  effectiveTopics,
  namedTopics,
  topicsFromProbabilities,
} from '#app/skills/services/skill-topics'
import { suggestableSkills, syncManualSkills } from '#app/skills/services/skills-catalog'
import { Http, pageDescription, SKILLS_SH_PAGES } from '#app/skills/services/skills-search'
import { trainTopicHead } from '#app/skills/services/topic-head'
import User from '#app/users/models/user'
import env from '#start/env'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const ADMIN = 'topics-admin@example.com'

/** The words the fake model reads: one dimension each, plus one always set. */
const WORDS = ['test', 'secret', 'deploy', 'docs']

/**
 * Swaps the model for one that reads which of `WORDS` a text holds, deterministic and
 * separable, so the real head learns from it. Records the texts it read and whether it was closed.
 */
function fakeModel() {
  const model = { read: [] as string[], closed: 0 }
  app.container.swap(SkillEmbedder, () => {
    const fake = new SkillEmbedder()
    fake.embed = async (texts) => {
      model.read.push(...texts)
      return texts.map((text) => [...WORDS.map((word) => (text.includes(word) ? 1 : 0)), 0.1])
    }
    fake.close = async () => {
      model.closed += 1
    }
    return fake
  })
  return model
}

function foundSkill(
  slug: string,
  description: string,
  searchTopics: string[],
  registryId: string | null = null,
) {
  return CatalogSkill.create({
    slug,
    name: slug,
    description: { en: description },
    url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/${slug}`,
    targets: [...TARGETS],
    affinities: [],
    searchTopics,
    topics: searchTopics,
    registryId,
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    audits: [],
  })
}

const ABOUT = {
  testing: 'Write a test for a web app, with its runner, fixtures and coverage reports.',
  security: 'Find a leaked secret in a repository and rotate it before it is abused.',
  devops: 'Deploy a service to a cluster, with rollbacks and health checks on each step.',
} as const

/** Labelled skills, as the admin left them: `count` of each tag of `ABOUT`. */
async function labelled(count: number) {
  for (const [topic, description] of Object.entries(ABOUT)) {
    for (let i = 0; i < count; i++) {
      const skill = await foundSkill(`${topic}-${i}`, description, ['workflow'])
      await skill.merge({ reviewedTopics: [topic] }).save()
    }
  }
}

test.group('Skill topics (tagger)', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      app.container.restore(SkillEmbedder)
    }
  })

  test('keeps the tags given at least the threshold, the likeliest first', ({ assert }) => {
    assert.deepEqual(topicsFromProbabilities({ testing: 0.7, frontend: 0.2 }), ['testing'])
    assert.deepEqual(topicsFromProbabilities({ ai: 0.2, docs: 0.1, nope: 0.9 }), [])
    assert.deepEqual(
      topicsFromProbabilities({ react: 0.31, frontend: 0.35, typescript: 0.32, docs: 0.3 }),
      ['frontend', 'typescript', 'react'],
    )
  })

  test("the admin's tags come first, then the tagger's, then the search's", ({ assert }) => {
    assert.deepEqual(effectiveTopics(['testing'], null), ['testing'])
    assert.deepEqual(effectiveTopics(['testing'], []), ['testing'])
    assert.deepEqual(effectiveTopics(['testing'], ['frontend']), ['frontend'])
    assert.deepEqual(effectiveTopics(['testing'], ['frontend'], ['security']), ['security'])
    assert.deepEqual(effectiveTopics(['testing'], ['frontend'], []), ['frontend'])
  })

  test('the seed tags are tags of the catalog', ({ assert }) => {
    assert.isAbove(Object.keys(SEED_TOPICS).length, 200)
    for (const topic of Object.values(SEED_TOPICS)) assert.include(TOPICS, topic)
  })

  test('the head learns the tag of each region and stays the same for the same rows', ({
    assert,
  }) => {
    const rows = [
      ...[0, 1, 2].map((i) => ({ vector: [1, 0.1 * i, 0], topic: 'testing' })),
      ...[0, 1, 2].map((i) => ({ vector: [0, 1, 0.1 * i], topic: 'security' })),
      ...[0, 1, 2].map((i) => ({ vector: [0.1 * i, 0, 1], topic: 'devops' })),
    ]
    const head = trainTopicHead(rows)
    const best = (vector: number[]) =>
      Object.entries(head(vector)).sort((a, b) => b[1] - a[1])[0]?.[0]
    assert.equal(best([0.9, 0.05, 0]), 'testing')
    assert.equal(best([0, 0.8, 0.1]), 'security')
    assert.equal(best([0.05, 0, 0.9]), 'devops')
    const sum = Object.values(head([1, 1, 1])).reduce((a, b) => a + b, 0)
    assert.closeTo(sum, 1, 1e-9)
    assert.deepEqual(trainTopicHead(rows)([0.3, 0.2, 0.1]), head([0.3, 0.2, 0.1]))
  })

  test('reads each skill once per text, never a short one, and tags from the labels', async ({
    assert,
  }) => {
    await labelled(4)
    const browser = await foundSkill('browser', 'Drive a browser to test a web app end to end.', [
      'workflow',
    ])
    const short = await foundSkill('short', 'An audit skill.', ['frontend'])
    const model = fakeModel()

    const report = await classifySkillTopics()
    assert.deepEqual(report, { embedded: 13, labels: 12, tagged: 13, skipped: 1 })
    assert.notInclude(model.read, `short\nAn audit skill.`)
    assert.equal(model.closed, 1)
    await browser.refresh()
    await short.refresh()
    assert.deepEqual([browser.taggerTopics, browser.topics], [['testing'], ['testing']])
    assert.deepEqual(browser.searchTopics, ['workflow'])
    assert.deepEqual([short.taggerTopics, short.topics], [null, ['frontend']])

    // Nothing changed: nothing is read or written again. A new description is read.
    assert.deepEqual(await classifySkillTopics(), {
      embedded: 0,
      labels: 12,
      tagged: 0,
      skipped: 1,
    })
    assert.equal(model.closed, 1)
    await browser.merge({ description: { en: 'Now it can deploy a web app to a cluster.' } }).save()
    const third = await classifySkillTopics()
    assert.deepEqual([third.embedded, third.tagged], [1, 1])
    await browser.refresh()
    assert.deepEqual(browser.taggerTopics, ['devops'])
    assert.lengthOf(await db.from('skill_embeddings'), 13)
  })

  test("learns from the seed and from the admin's main tag", async ({ assert }) => {
    await labelled(3)
    const [seededId, seededTopic] = Object.entries(SEED_TOPICS)[0] ?? ['', 'docs']
    await foundSkill('seeded', 'All about docs for a project, the docs a team keeps.', [], seededId)
    const unlabelled = await foundSkill(
      'guide',
      'How to write docs that stay true as the code changes.',
      ['workflow'],
    )
    fakeModel()

    const report = await classifySkillTopics()
    assert.equal(report.labels, 10)
    await unlabelled.refresh()
    assert.deepEqual(unlabelled.taggerTopics, [seededTopic])

    // The admin's main tag replaces the seed's, and the next run learns it.
    const seeded = await CatalogSkill.findByOrFail('slug', 'seeded')
    await seeded.merge({ reviewedTopics: ['security', 'docs'] }).save()
    await classifySkillTopics()
    await unlabelled.refresh()
    assert.deepEqual(unlabelled.taggerTopics, ['security'])
  })

  test('tags nothing with too few labels', async ({ assert }) => {
    await labelled(2)
    const browser = await foundSkill(
      'browser',
      'Drive a browser to test a web app from end to end.',
      ['workflow'],
    )
    fakeModel()
    const report = await classifySkillTopics()
    assert.deepEqual([report.embedded, report.labels, report.tagged], [7, 0, 0])
    await browser.refresh()
    assert.isNull(browser.taggerTopics)
  })

  test('a hand-picked skill is suggested with the tags it was given', async ({ assert }) => {
    await labelled(4)
    await syncManualSkills()
    fakeModel()
    await classifySkillTopics()

    const [first] = SKILLS
    if (!first) return
    const row = await CatalogSkill.findByOrFail('slug', first.id)
    assert.deepEqual(row.searchTopics, [...(first.topics ?? [])])
    assert.isNotNull(row.taggerTopics)
    const suggested = (await suggestableSkills()).find((skill) => skill.id === first.id)
    assert.deepEqual(suggested?.topics, row.topics)
  })

  test('adds the narrow tags the text names', async ({ assert }) => {
    assert.deepEqual(namedTopics('gsap-react\nGSAP animations in React components.'), ['react'])
    assert.deepEqual(namedTopics('animate-expo\nNative animations for Expo apps.'), ['mobile'])
    assert.deepEqual(namedTopics('reactive\nReactive streams in Rust.'), [])
    await labelled(4)
    const tests = await foundSkill(
      'react-tests',
      'Write a test for React components and hooks.',
      [],
    )
    fakeModel()
    await classifySkillTopics()
    await tests.refresh()
    assert.deepEqual(tests.topics, ['testing', 'react'])
  })

  test('lets only the admin set the tags of a skill, or give them back, and queues a run', async ({
    client,
    assert,
  }) => {
    const dispatched: unknown[] = []
    const own = Object.getOwnPropertyDescriptor(ClassifySkillTopicsJob, 'dispatch')
    Object.defineProperty(ClassifySkillTopicsJob, 'dispatch', {
      configurable: true,
      writable: true,
      value: async (data: unknown) => {
        dispatched.push(data)
      },
    })
    try {
      const skill = await foundSkill('browser', ABOUT.testing, ['workflow'])
      await skill.merge({ taggerTopics: ['testing'], topics: ['testing'] }).save()
      const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
      const other = await User.create({
        email: 'someone@example.com',
        password: 'a-very-strong-passphrase',
      })
      const path = '/admin/skills/browser/topics'
      const ask = (topics: unknown, user?: User) => {
        const request = client.patch(path).headers(json).json({ topics })
        return user ? request.loginAs(user) : request
      }

      ;(await ask(['security'])).assertStatus(401)
      ;(await ask(['security'], other)).assertStatus(404)
      ;(await ask(['nope'], admin)).assertStatus(422)
      ;(await ask(['docs', 'docs', 'docs', 'docs'], admin)).assertStatus(422)
      ;(
        await client
          .patch('/admin/skills/nope/topics')
          .headers(json)
          .json({ topics: null })
          .loginAs(admin)
      ).assertStatus(404)
      assert.lengthOf(dispatched, 0)

      const set = await ask(['security', 'testing'], admin)
      set.assertStatus(200)
      set.assertBody({ topics: ['security', 'testing'], reviewedTopics: ['security', 'testing'] })
      const shown = await client.get('/skills/browser').headers(json).loginAs(other)
      assert.equal(shown.body().skill.topicsSource, 'reviewed')

      const back = await ask(null, admin)
      back.assertBody({ topics: ['testing'], reviewedTopics: null })
      await skill.refresh()
      assert.isNull(skill.reviewedAt)
      assert.deepEqual(dispatched, [{}, {}])
    } finally {
      if (own) Object.defineProperty(ClassifySkillTopicsJob, 'dispatch', own)
      else delete (ClassifySkillTopicsJob as unknown as Record<string, unknown>).dispatch
    }
  })

  test('reads the description of a skill on its skills.sh page', async ({ assert }) => {
    const page =
      '<html><head><meta name="description" content="React &amp; Next.js performance rules from Vercel &#x27;s team"/></head></html>'
    const http = new Http(async (url) => {
      assert.equal(String(url), `${SKILLS_SH_PAGES}/vercel-labs/agent-skills/react-best`)
      return new Response(page, { status: 200 })
    })
    assert.equal(
      await pageDescription(http, 'vercel-labs/agent-skills/react-best'),
      "React & Next.js performance rules from Vercel 's team",
    )
    const empty = new Http(async () => new Response('<html></html>', { status: 200 }))
    assert.equal(await pageDescription(empty, 'a/b/c'), '')
  })
})
