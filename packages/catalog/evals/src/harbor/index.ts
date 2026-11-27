/**
 * The convention evals run through Harbor in E2B sandboxes (decision record, sections 4 to 7 and
 * 13): `prepareHarborRun` exports the tasks of a run and answers the command to start,
 * `readHarborJob` reads the job folder back. The caller (the API's `convention-evals` worker)
 * resolves the credential, starts the command without a shell, grades each final state in a
 * sandbox (a final state is untrusted: never run or read by Git in the worker), filters
 * every output and removes the run's folder.
 */
export {
  CREDENTIAL_ENV_NAMES,
  HARBOR_AGENTS,
  HARBOR_TIMEOUTS,
  HarborAgent,
} from './constants.ts'
export {
  credentialEnvName,
  type HarborCommand,
  type HarborRunInput,
  type HarborTrialInput,
  prepareHarborRun,
} from './export.ts'
export {
  type HarborTrialResult,
  type HarborTrialUsage,
  type HarborUsage,
  readHarborJob,
  readHarborUsage,
} from './read.ts'
