import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import app from '@adonisjs/core/services/app'
import { z } from 'zod'
import ScanSkillVersionJob from '#app/jobs/scan-skill-version_job'
import {
  SKILL_SCAN_LIMITS,
  SKILL_SCAN_SEVERITIES,
  SkillApprovalProblem,
  SkillScanFailure,
  SkillScanRecommendation,
  SkillScanStatus,
} from '#app/skills/constants/skill-scan'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import SkillVersion from '#app/skills/models/skill-version'
import SkillScanner from '#app/skills/services/skill-scanner'
import { readSkillVersionFiles } from '#app/skills/services/skill-versions'

/** One problem SkillSpector found, where it found it. */
export type SkillScanFinding = {
  /** SkillSpector's pattern id (`P1`, `SC2`…). */
  id: string
  category: string
  pattern: string
  severity: string
  file: string | null
  line: number | null
  /** The text it matched, cut to `SKILL_SCAN_LIMITS.findingText`. */
  text: string
}

/** What `skill_versions.scan` holds. */
export type SkillScan =
  | {
      status: typeof SkillScanStatus.Done
      /** 0 to 100. */
      score: number
      severity: string
      recommendation: string
      /** False when SkillSpector could not read every file (its `analysis_completeness`). */
      complete: boolean
      findings: SkillScanFinding[]
      /** Findings past `SKILL_SCAN_LIMITS.findings`, not kept. */
      moreFindings: number
      version: string
      scannedAt: string
    }
  | { status: typeof SkillScanStatus.Failed; reason: SkillScanFailure; scannedAt: string }

/** The part of SkillSpector's JSON report that is read (2.13.7); any other field is ignored. */
const reportSchema = z.object({
  risk_assessment: z.object({
    score: z.number().min(0).max(100),
    severity: z.string().max(20),
    recommendation: z.string().max(40),
  }),
  issues: z.array(
    z.object({
      id: z.string().max(20),
      category: z.string().max(100),
      pattern: z.string().max(200),
      severity: z.string().max(20),
      finding: z.string().nullish(),
      location: z
        .object({ file: z.string().max(500).nullish(), start_line: z.number().int().nullish() })
        .nullish(),
    }),
  ),
  execution_successful: z.boolean(),
  analysis_completeness: z.object({ is_complete: z.boolean() }),
  metadata: z.object({ skillspector_version: z.string().max(40) }),
})

function severityRank(severity: string): number {
  const rank = (SKILL_SCAN_SEVERITIES as readonly string[]).indexOf(severity)
  return rank === -1 ? SKILL_SCAN_SEVERITIES.length : rank
}

/** SkillSpector's report as `SkillScan`, or null when it is not in the expected shape. */
export function readScanReport(json: string, scannedAt: string): SkillScan | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  const report = reportSchema.safeParse(parsed)
  if (!report.success || !report.data.execution_successful) return null
  const { risk_assessment: risk, issues } = report.data
  const findings = issues
    .map((issue) => ({
      id: issue.id,
      category: issue.category,
      pattern: issue.pattern,
      severity: issue.severity,
      file: issue.location?.file ?? null,
      line: issue.location?.start_line ?? null,
      text: (issue.finding ?? '').slice(0, SKILL_SCAN_LIMITS.findingText),
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  return {
    status: SkillScanStatus.Done,
    score: risk.score,
    severity: risk.severity,
    recommendation: risk.recommendation,
    complete: report.data.analysis_completeness.is_complete,
    findings: findings.slice(0, SKILL_SCAN_LIMITS.findings),
    moreFindings: Math.max(0, findings.length - SKILL_SCAN_LIMITS.findings),
    version: report.data.metadata.skillspector_version,
    scannedAt,
  }
}

/**
 * Scans one copy with SkillSpector and keeps its verdict on the row. The copy's files (read from
 * Drive, never from GitHub again) are written to a folder of their own, scanned and deleted; a
 * scan that gives no verdict is kept as `failed` with why, and the copy can then only be rejected.
 * Run by `ScanSkillVersionJob` on the `skill-scanner` worker only.
 */
export async function scanSkillVersion(version: SkillVersion): Promise<SkillScan> {
  const scannedAt = new Date().toISOString()
  const workDir = await mkdtemp(join(tmpdir(), 'skill-scan-'))
  try {
    const folder = join(workDir, 'skill')
    await writeCopy(folder, await readSkillVersionFiles(version))
    const reportPath = join(workDir, 'report.json')
    const scanner = await app.container.make(SkillScanner)
    const run = await scanner.run(folder, reportPath, workDir)
    const scan = run.missing
      ? failed(SkillScanFailure.Missing, scannedAt)
      : run.timedOut
        ? failed(SkillScanFailure.Timeout, scannedAt)
        : run.exitCode !== 0 && run.exitCode !== 1
          ? failed(SkillScanFailure.Exit, scannedAt)
          : ((await readReport(reportPath, scannedAt)) ??
            failed(SkillScanFailure.Unreadable, scannedAt))
    await version.merge({ scan }).save()
    return scan
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

function failed(reason: SkillScanFailure, scannedAt: string): SkillScan {
  return { status: SkillScanStatus.Failed, reason, scannedAt }
}

async function readReport(path: string, scannedAt: string): Promise<SkillScan | null> {
  const size = await stat(path).then(
    (info) => info.size,
    () => null,
  )
  if (size === null || size > SKILL_SCAN_LIMITS.reportBytes) return null
  return readScanReport(await readFile(path, 'utf8'), scannedAt)
}

/** Writes a copy's files under `folder`, refusing any path that would land outside it. */
async function writeCopy(
  folder: string,
  files: { path: string; executable: boolean; content: string }[],
): Promise<void> {
  const root = resolve(folder)
  for (const file of files) {
    const target = resolve(root, file.path)
    const inside = relative(root, target)
    if (inside === '' || inside.startsWith('..') || inside.split(sep).includes('..')) {
      throw new Error(`a copied file has a path outside its folder: ${file.path}`)
    }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: 'wx' })
    if (file.executable) await chmod(target, 0o755)
  }
}

/**
 * Queues a scan for every pending copy that has no verdict yet or whose scan failed (a worker
 * without the binary, a timeout), so each refresh tries those again. Returns how many.
 */
export async function queueSkillScans(): Promise<number> {
  const versions = await SkillVersion.query()
    .where('status', SkillVersionStatus.Pending)
    .where((query) =>
      query.whereNull('scan').orWhereRaw(`scan->>'status' = ?`, [SkillScanStatus.Failed]),
    )
    .orderBy('id')
  for (const version of versions) await ScanSkillVersionJob.dispatch({ skillVersionId: version.id })
  return versions.length
}

/**
 * Why the admin cannot approve this copy, or null when they may: it needs a complete scan whose
 * recommendation is not SkillSpector's `DO_NOT_INSTALL`. Rejecting is always possible.
 */
export function approvalProblem(version: SkillVersion): SkillApprovalProblem | null {
  const scan = version.scan
  if (!scan) return SkillApprovalProblem.NotScanned
  if (scan.status === SkillScanStatus.Failed) return SkillApprovalProblem.ScanFailed
  if (!scan.complete) return SkillApprovalProblem.ScanIncomplete
  if (scan.recommendation === SkillScanRecommendation.DoNotInstall) {
    return SkillApprovalProblem.DoNotInstall
  }
  return null
}
