/**
 * The scan of each copy of a skill by NVIDIA's SkillSpector (`ScanSkillVersionJob`), run only by
 * the `skill-scanner` worker, whose image holds the binary (see infra/skill-scanner/README.md).
 */
export const SKILL_SCANS_QUEUE = 'skill-scans' as const

/** The SkillSpector release the image installs and the report format was read from. */
export const SKILLSPECTOR_TESTED_VERSION = '2.13.7'

export const SKILL_SCAN_LIMITS = {
  /** A scan running longer is killed and recorded `failed`. */
  timeoutMs: 120_000,
  /** The report file read back; a larger one is `failed`. */
  reportBytes: 4 * 1024 * 1024,
  /** Kept per copy, the most severe first; the count of the others is kept too. */
  findings: 100,
  /** Each finding's quoted text, cut past this. */
  findingText: 300,
} as const

export const SkillScanStatus = {
  /** SkillSpector ran to the end: its verdict is kept. */
  Done: 'done',
  /** It could not give one: the copy can only be rejected. */
  Failed: 'failed',
} as const

export type SkillScanStatus = (typeof SkillScanStatus)[keyof typeof SkillScanStatus]

/** Why a scan gave no verdict. */
export const SkillScanFailure = {
  /** No `skillspector` on this worker's PATH. */
  Missing: 'missing',
  Timeout: 'timeout',
  /** It exited with an error (code 2 or a signal). */
  Exit: 'exit',
  /** Its report was missing, too large or not in the expected shape. */
  Unreadable: 'unreadable',
} as const

export type SkillScanFailure = (typeof SkillScanFailure)[keyof typeof SkillScanFailure]

/** SkillSpector's recommendations (`risk_assessment.recommendation`). */
export const SkillScanRecommendation = {
  Safe: 'SAFE',
  Caution: 'CAUTION',
  DoNotInstall: 'DO_NOT_INSTALL',
} as const

export type SkillScanRecommendation =
  (typeof SkillScanRecommendation)[keyof typeof SkillScanRecommendation]

/** SkillSpector's severities, the most severe first. */
export const SKILL_SCAN_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

export type SkillScanSeverity = (typeof SKILL_SCAN_SEVERITIES)[number]

/** Why the admin cannot approve a copy (`approvalProblem`). */
export const SkillApprovalProblem = {
  NotScanned: 'not_scanned',
  ScanFailed: 'scan_failed',
  ScanIncomplete: 'scan_incomplete',
  DoNotInstall: 'do_not_install',
} as const

export type SkillApprovalProblem = (typeof SkillApprovalProblem)[keyof typeof SkillApprovalProblem]
