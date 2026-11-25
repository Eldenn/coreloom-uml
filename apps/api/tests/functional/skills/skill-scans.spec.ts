import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { TARGETS } from '@coreloom-uml/catalog'
import type { LanguageModel } from '@coreloom-uml/llm'
import { answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import LanguageModels from '#app/llm/services/language-models'
import { SkillStatus } from '#app/skills/constants/skill'
import {
  SKILL_SCANS_QUEUE,
  SkillApprovalProblem,
  SkillScanFailure,
  SkillScanStatus,
} from '#app/skills/constants/skill-scan'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import SkillScanner, { type SkillScannerRun } from '#app/skills/services/skill-scanner'
import {
  queueSkillScans,
  readScanReport,
  type SkillScan,
  scanSkillVersion,
} from '#app/skills/services/skill-scans'
import User from '#app/users/models/user'
import env from '#start/env'
import { captureLogs } from '#tests/helpers/leaks'
import { CLEAN_SCAN, withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const ADMIN = 'skills-admin@example.com'
const REPORT = new URL('../../fixtures/skillspector-report.json', import.meta.url)
const gzipAsync = promisify(gzip)

/** SkillSpector's report on a clean skill: the fixture's, with nothing found. */
async function cleanReport(): Promise<string> {
  const report = JSON.parse(await readFile(REPORT, 'utf8'))
  report.risk_assessment = {
    score: 0,
    severity: 'LOW',
    recommendation: 'SAFE',
    max_issue_severity: 'NONE',
  }
  report.issues = []
  return JSON.stringify(report)
}

/** One `ledger_exceptions` entry of a real 2.13.7 report: a file the static parser gave up on. */
const LEDGER_EXCEPTION = {
  outcome: 'partial',
  phase: 'static',
  reason_code: 'static_parse_limit',
  message:
    'A security-relevant expression could not be fully resolved by the bounded static parser.',
  path: 'scripts/server.cjs',
  start_line: null,
  end_line: null,
  fatal: false,
  analyzers: ['static_patterns_tool_misuse'],
  parser_diagnostic: { cause: 'runtime_dependent', start_line: 537, end_line: 723 },
}

/** SkillSpector's report on a clean skill it could not check whole, naming `exceptions`. */
async function partialReport(exceptions: unknown[]): Promise<string> {
  const report = JSON.parse(await cleanReport())
  report.analysis_completeness.is_complete = false
  report.analysis_completeness.ledger_exceptions = exceptions
  return JSON.stringify(report)
}

/** A pending copy of a skill, its files in (fake) Drive. */
async function pendingCopy(slug = 'deploy-helper'): Promise<SkillVersion> {
  const skill = await CatalogSkill.create({
    slug,
    name: `${slug} (acme)`,
    description: { en: 'Helps with deploys.' },
    url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/skills/${slug}`,
    targets: [...TARGETS],
    affinities: [],
    topics: [],
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    contentSha: 'b'.repeat(40),
    audits: [],
  })
  const files = [
    { path: 'SKILL.md', executable: false, content: '---\nname: x\n---\nDeploy.\n' },
    { path: 'scripts/run.sh', executable: true, content: '#!/bin/sh\necho run\n' },
  ]
  const storageKey = `skill-versions/${slug}/${'b'.repeat(40)}.json.gz`
  await drive.use().put(storageKey, await gzipAsync(JSON.stringify(files)))
  return SkillVersion.create({
    skillId: skill.id,
    contentSha: 'b'.repeat(40),
    repository: 'acme/skills',
    commit: 'a'.repeat(40),
    folder: `skills/${slug}`,
    license: 'MIT',
    files: files.map((file) => ({
      path: file.path,
      size: file.content.length,
      executable: file.executable,
    })),
    bytes: 40,
    storageKey,
    scan: null,
    status: SkillVersionStatus.Pending,
  })
}

type SeenFile = { path: string; executable: boolean; content: string }

/** Swaps the binary for one that writes `report` (when given) and answers `run`. */
function fakeScanner(report: string | null, run: Partial<SkillScannerRun> = {}) {
  const seen: { files: SeenFile[]; env: unknown } = { files: [], env: null }
  app.container.swap(SkillScanner, () => {
    const fake = new SkillScanner()
    fake.run = async (folder, reportPath) => {
      seen.files = await listFiles(folder, folder)
      if (report !== null) await writeFile(reportPath, report)
      return { exitCode: 1, timedOut: false, missing: false, ...run }
    }
    return fake
  })
  return seen
}

async function listFiles(root: string, folder: string): Promise<SeenFile[]> {
  const out: SeenFile[] = []
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)))
    else {
      out.push({
        path: path.slice(root.length + 1),
        executable: ((await stat(path)).mode & 0o100) !== 0,
        content: await readFile(path, 'utf8'),
      })
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

test.group('Skill scans: the report', () => {
  test('reads a real SkillSpector report, the most severe findings first', async ({ assert }) => {
    const scan = readScanReport(await readFile(REPORT, 'utf8'), '2026-11-24T00:00:00.000Z')
    assert.equal(scan?.status, SkillScanStatus.Done)
    if (scan?.status !== SkillScanStatus.Done) return
    assert.equal(scan.score, 100)
    assert.equal(scan.recommendation, 'DO_NOT_INSTALL')
    assert.isTrue(scan.complete)
    assert.deepEqual(scan.gaps, [])
    assert.equal(scan.version, '2.13.7')
    assert.lengthOf(scan.findings, 7)
    assert.deepEqual(scan.findings[0], {
      id: 'P1',
      category: 'Prompt Injection',
      pattern: 'Instruction Override',
      severity: 'HIGH',
      file: 'SKILL.md',
      line: 6,
      text: 'Ignore all previous instructions',
    })
    assert.deepEqual(
      scan.findings.map((finding) => finding.severity),
      ['HIGH', 'HIGH', 'HIGH', 'HIGH', 'HIGH', 'MEDIUM', 'MEDIUM'],
    )
  })

  test('keeps the passages left unchecked, bounded and cut', async ({ assert }) => {
    const noLines = {
      reason_code: 'reference_missing',
      path: 'SKILL.md',
      start_line: 3,
      end_line: 3,
    }
    const scan = readScanReport(
      await partialReport([LEDGER_EXCEPTION, noLines]),
      '2026-11-24T00:00:00.000Z',
    )
    if (scan?.status !== SkillScanStatus.Done) return assert.fail('no verdict')
    assert.isFalse(scan.complete)
    assert.deepEqual(scan.gaps, [
      {
        file: 'scripts/server.cjs',
        startLine: 537,
        endLine: 723,
        reason: 'static_parse_limit',
        message:
          'A security-relevant expression could not be fully resolved by the bounded static parser.',
      },
      { file: 'SKILL.md', startLine: 3, endLine: 3, reason: 'reference_missing', message: '' },
    ])
    assert.equal(scan.moreGaps, 0)

    const many = readScanReport(
      await partialReport(
        Array.from({ length: 60 }, () => ({ ...LEDGER_EXCEPTION, message: 'x'.repeat(1000) })),
      ),
      '2026-11-24T00:00:00.000Z',
    )
    if (many?.status !== SkillScanStatus.Done) return assert.fail('no verdict')
    assert.lengthOf(many.gaps ?? [], 50)
    assert.equal(many.moreGaps, 10)
    assert.lengthOf(many.gaps?.[0]?.message ?? '', 400)
  })

  test('gives no verdict for anything else', async ({ assert }) => {
    const report = JSON.parse(await readFile(REPORT, 'utf8'))
    for (const json of [
      'not json',
      '{}',
      JSON.stringify({ ...report, execution_successful: false }),
      JSON.stringify({ ...report, risk_assessment: { ...report.risk_assessment, score: 'high' } }),
    ]) {
      assert.isNull(readScanReport(json, '2026-11-24T00:00:00.000Z'))
    }
  })

  test('keeps a bounded number of findings, each cut', async ({ assert }) => {
    const report = JSON.parse(await readFile(REPORT, 'utf8'))
    const issue = { ...report.issues[0], finding: 'x'.repeat(1000) }
    report.issues = Array.from({ length: 130 }, () => issue)
    const scan = readScanReport(JSON.stringify(report), '2026-11-24T00:00:00.000Z')
    if (scan?.status !== SkillScanStatus.Done) return assert.fail('no verdict')
    assert.lengthOf(scan.findings, 100)
    assert.equal(scan.moreFindings, 30)
    assert.lengthOf(scan.findings[0]?.text ?? '', 300)
  })
})

test.group('Skill scans', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    drive.fake()
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      drive.restore()
      app.container.restore(SkillScanner)
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test('scans the copy read from Drive and keeps the verdict, which blocks approval', async ({
    client,
    assert,
  }) => {
    const version = await pendingCopy()
    const seen = fakeScanner(await readFile(REPORT, 'utf8'))
    const scan = await scanSkillVersion(version)
    assert.equal(scan.status, SkillScanStatus.Done)

    // The binary got the copy's files, executable bit included.
    assert.deepEqual(
      seen.files.map((file) => [file.path, file.executable]),
      [
        ['SKILL.md', false],
        ['scripts/run.sh', true],
      ],
    )
    assert.equal(seen.files[1]?.content, '#!/bin/sh\necho run\n')

    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const detail = await client
      .get(`/admin/skill-versions/${version.id}`)
      .headers(json)
      .loginAs(admin)
    assert.equal(detail.body().version.scan.recommendation, 'DO_NOT_INSTALL')
    assert.equal(detail.body().version.approvalProblem, SkillApprovalProblem.DoNotInstall)

    const refused = await client
      .patch(`/admin/skill-versions/${version.id}`)
      .headers(json)
      .json({ status: 'approved' })
      .loginAs(admin)
    refused.assertStatus(409)
    assert.equal(refused.body().error.reason, SkillApprovalProblem.DoNotInstall)
    ;(
      await client
        .patch(`/admin/skill-versions/${version.id}`)
        .headers(json)
        .json({ status: 'rejected', overrideReason: 'Read it, the findings are quotes.' })
        .loginAs(admin)
    ).assertStatus(422)
    ;(
      await client
        .patch(`/admin/skill-versions/${version.id}`)
        .headers(json)
        .json({ status: 'approved', overrideReason: 'too short' })
        .loginAs(admin)
    ).assertStatus(422)
    ;(
      await client
        .patch(`/admin/skill-versions/${version.id}`)
        .headers(json)
        .json({ status: 'rejected' })
        .loginAs(admin)
    ).assertStatus(200)
  })

  test('lets the admin override a do-not-install verdict with a reason', async ({
    client,
    assert,
  }) => {
    const version = await pendingCopy()
    fakeScanner(await readFile(REPORT, 'utf8'), { exitCode: 1 })
    await scanSkillVersion(version)
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const approved = await client
      .patch(`/admin/skill-versions/${version.id}`)
      .headers(json)
      .json({ status: 'approved', overrideReason: '  Read it: the findings quote git commands.  ' })
      .loginAs(admin)
    approved.assertStatus(200)
    assert.equal(approved.body().status, 'approved')
    assert.equal(approved.body().overrideReason, 'Read it: the findings quote git commands.')
    await version.refresh()
    assert.equal(version.overrideReason, 'Read it: the findings quote git commands.')
  })

  test('takes no reason to approve a copy scanned clean', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const version = await pendingCopy()
    await version.merge({ scan: CLEAN_SCAN }).save()
    ;(
      await client
        .patch(`/admin/skill-versions/${version.id}`)
        .headers(json)
        .json({ status: 'approved', overrideReason: 'I trust this one anyway.' })
        .loginAs(admin)
    ).assertStatus(422)
  })

  test('lets a copy scanned clean be approved', async ({ client, assert }) => {
    const version = await pendingCopy()
    fakeScanner(await cleanReport(), { exitCode: 0 })
    await scanSkillVersion(version)
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const approved = await client
      .patch(`/admin/skill-versions/${version.id}`)
      .headers(json)
      .json({ status: 'approved' })
      .loginAs(admin)
    approved.assertStatus(200)
    assert.isNull(approved.body().approvalProblem)
  })

  test('keeps why a scan gave no verdict', async ({ assert }) => {
    const clean = await cleanReport()
    const cases: [string | null, Partial<SkillScannerRun>, string][] = [
      [null, { exitCode: null, missing: true }, SkillScanFailure.Missing],
      [null, { exitCode: null, timedOut: true }, SkillScanFailure.Timeout],
      [clean, { exitCode: 2 }, SkillScanFailure.Exit],
      [null, { exitCode: 0 }, SkillScanFailure.Unreadable],
      ['{"risk_assessment": {}}', { exitCode: 0 }, SkillScanFailure.Unreadable],
    ]
    for (const [index, [report, run, reason]] of cases.entries()) {
      const version = await pendingCopy(`skill-${index}`)
      fakeScanner(report, run)
      const scan = await scanSkillVersion(version)
      assert.deepEqual(
        { status: scan.status, reason: 'reason' in scan ? scan.reason : null },
        { status: SkillScanStatus.Failed, reason },
      )
      await version.refresh()
      assert.equal(version.scan?.status, SkillScanStatus.Failed)
    }
  })

  test('a copy scanned incomplete, not scanned or whose scan failed is approved only with a reason', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const cases: [SkillScan | null, SkillApprovalProblem][] = [
      [null, SkillApprovalProblem.NotScanned],
      [{ ...CLEAN_SCAN, complete: false } as SkillScan, SkillApprovalProblem.ScanIncomplete],
      [
        { status: SkillScanStatus.Failed, reason: SkillScanFailure.Timeout, scannedAt: '' },
        SkillApprovalProblem.ScanFailed,
      ],
    ]
    for (const [index, [scan, reason]] of cases.entries()) {
      const version = await pendingCopy(`skill-${index}`)
      await version.merge({ scan }).save()
      const review = (body: object) =>
        client.patch(`/admin/skill-versions/${version.id}`).headers(json).json(body).loginAs(admin)
      const refused = await review({ status: 'approved' })
      refused.assertStatus(409)
      refused.assertBodyContains({ error: { reason } })
      const approved = await review({
        status: 'approved',
        overrideReason: 'Read every file of this copy myself.',
      })
      approved.assertStatus(200)
      assert.equal(approved.body().overrideReason, 'Read every file of this copy myself.')
    }
  })
})

test.group('Skill scans: the queue', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(async () => {
    drive.fake()
    await queue.useQueue(SKILL_SCANS_QUEUE).drain(true)
    return async () => {
      drive.restore()
      await queue.useQueue(SKILL_SCANS_QUEUE).drain(true)
    }
  })

  test('queues the pending copies without a verdict, and those whose scan failed', async ({
    assert,
  }) => {
    const unscanned = await pendingCopy('unscanned')
    const failed = await pendingCopy('failed')
    await failed
      .merge({ scan: { status: SkillScanStatus.Failed, reason: 'timeout', scannedAt: '' } })
      .save()
    const scanned = await pendingCopy('scanned')
    await scanned.merge({ scan: CLEAN_SCAN }).save()
    const decided = await pendingCopy('decided')
    await decided.merge({ status: SkillVersionStatus.Rejected }).save()

    assert.equal(await queueSkillScans(), 2)
    const jobs = await queue.useQueue(SKILL_SCANS_QUEUE).getJobs(['waiting', 'delayed'])
    assert.sameMembers(
      jobs.map((job) => job.data.skillVersionId),
      [unscanned.id, failed.id],
    )
  })
})

/** The fixture key: it must never show up in a response or a log line. */
const KEY = 'sk-fixture-skill-review-never-stored'
const MODEL_CALL = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  locale: 'en',
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

test.group('Skill scans: the model reads a copy', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    drive.fake()
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      drive.restore()
      app.container.restore(SkillScanner)
      app.container.restore(LanguageModels)
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test("keeps what the admin's model says of the findings and the unchecked passages", async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const version = await pendingCopy()
    fakeScanner(await partialReport([{ ...LEDGER_EXCEPTION, path: 'scripts/run.sh' }]), {
      exitCode: 0,
    })
    await scanSkillVersion(version)
    const model = answeringModel(
      JSON.stringify({
        verdict: 'no_risk_seen',
        summary: 'A deploy helper.',
        notes: [
          { ref: 'g1', file: '', assessment: 'benign', comment: 'It only prints a word.' },
          { ref: '', file: 'absent.sh', assessment: 'risky', comment: 'Not a file of the copy.' },
        ],
      }),
    )
    useModel(model)
    const logs = captureLogs()

    const response = await client
      .post(`/admin/skill-versions/${version.id}/model-review`)
      .headers(json)
      .json(MODEL_CALL)
      .loginAs(admin)
    logs.restore()

    response.assertStatus(200)
    assert.deepInclude(response.body().modelReview, {
      verdict: 'no_risk_seen',
      summary: 'A deploy helper.',
      model: 'mistral mistral-small-latest',
      omittedFiles: [],
      notes: [
        {
          about: 'gap',
          label: 'static_parse_limit',
          file: 'scripts/run.sh',
          line: 537,
          assessment: 'benign',
          comment: 'It only prints a word.',
        },
      ],
    })
    // An aid only: what the admin may decide is still what the scan says.
    assert.equal(response.body().approvalProblem, SkillApprovalProblem.ScanIncomplete)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, 'echo run')
    assert.include(prompt, 'g1 | scripts/run.sh:537-723 | static_parse_limit')
    assert.notInclude(JSON.stringify(response.body()), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(logs.lines.join('\n'), 'echo run')

    await version.refresh()
    assert.equal(version.modelReview?.verdict, 'no_risk_seen')
  })

  test('reads a copy that was never scanned, and keeps nothing when the call fails', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const version = await pendingCopy()
    const ask = (user: User) =>
      client
        .post(`/admin/skill-versions/${version.id}/model-review`)
        .headers(json)
        .json(MODEL_CALL)
        .loginAs(user)

    useModel(failingModel(new Error('boom')))
    const failed = await ask(admin)
    failed.assertStatus(502)
    await version.refresh()
    assert.isNull(version.modelReview)

    useModel(
      answeringModel(
        JSON.stringify({ verdict: 'unsure', summary: 'Too little to say.', notes: [] }),
      ),
    )
    const read = await ask(admin)
    read.assertStatus(200)
    assert.equal(read.body().modelReview.verdict, 'unsure')

    const other = await User.create({
      email: 'someone@example.com',
      password: 'a-strong-passphrase',
    })
    ;(await ask(other)).assertStatus(404)
  })
})
