import { CONVENTION_EVAL_LIMITS } from '#app/convention-evals/constants/convention-evals'
import { EVAL_SANDBOX_PATHS } from '#app/convention-evals/constants/eval-sandbox'

/**
 * The only command lines the harness runs in a trial's sandbox (path II). All are fixed: what
 * varies (the model's command, a task id, a commit) comes in as an environment variable of that
 * one run, so the shell that starts them reads nothing the model wrote. The sandbox is cut off
 * every network before the first of them and holds no secret, so a command of the model (`SHELL`)
 * can send nothing anywhere. Each caps its output inside the sandbox; the API cuts it again.
 * Tested against this machine's bash (`tests/unit/convention-evals/eval-commands.spec.ts`).
 */

/** Every run gets these, and nothing else of ours. */
export const BASE_ENVS = {
  TRIAL_ROOT: EVAL_SANDBOX_PATHS.trialRoot,
  TRIAL_ARCHIVE: EVAL_SANDBOX_PATHS.trialArchive,
  GRADER_ROOT: EVAL_SANDBOX_PATHS.graderRoot,
  GRADER_ARCHIVE: EVAL_SANDBOX_PATHS.graderArchive,
} as const

/**
 * Run as root before anything else: takes passwordless sudo away from `user`, the model's user.
 * E2B's template build gives it back at its last step whatever the recipe did (a line of
 * /etc/sudoers and the group `sudo`), so it is done in each sandbox. Fails unless `sudo` is then
 * refused to `user`: with it, the model would be root and could leave a process the grading
 * step's `kill -1` does not reach.
 */
export const DENY_SUDO = `bash -c 'sed -i "/^user[[:space:]]/d" /etc/sudoers && rm -f /etc/sudoers.d/user && gpasswd -d user sudo >/dev/null 2>&1; visudo -c >/dev/null && ! su -s /bin/sh user -c "sudo -n true" >/dev/null 2>&1'`

/**
 * Unpacks the trial's workspace (built on the worker: the fixture, its conventions, a bare
 * `origin`) into `$TRIAL_ROOT` and points `origin` at the bare repository where it now lies.
 */
export const SETUP = `bash -c 'mkdir -p -- "$TRIAL_ROOT" && tar -xzf "$TRIAL_ARCHIVE" -C "$TRIAL_ROOT" && rm -f -- "$TRIAL_ARCHIVE" && git -C "$TRIAL_ROOT/repo" remote set-url origin "$TRIAL_ROOT/origin.git"'`

/**
 * One command of the model, `$SHELL_COMMAND`, from the repository's root: killed after
 * `shellSeconds`, its output (stdout and stderr) capped at `shellOutputMaxBytes`.
 */
export const SHELL = `bash -c 'cd -- "$TRIAL_ROOT/repo" && timeout -k 2 ${String(CONVENTION_EVAL_LIMITS.shellSeconds)} bash -c "$SHELL_COMMAND" 2>&1 < /dev/null | head -c ${String(CONVENTION_EVAL_LIMITS.shellOutputMaxBytes)}; exit "\${PIPESTATUS[0]}"'`

/**
 * Run as root once the model is done: stops whatever the model's user left running (frozen first,
 * so a fork loop cannot outrun the kill), again until none is left, at most 20 rounds. Fails when
 * one is still there, and the trial is then not graded: nothing of the model may change the
 * repository while root reads it.
 */
export const STOP_AGENT = `bash -c 'for round in $(seq 20); do pkill -STOP -u user; pkill -KILL -u user; pgrep -u user >/dev/null || exit 0; sleep 0.1; done; exit 1'`

/**
 * Run as root: hands the trial to root (no process of the model's user can touch it any more),
 * unpacks the graders and runs them on `$TASK_ID` from `$BASE_COMMIT`. Answers one JSON line
 * (`TrialGrades`). The hidden test runs the model's code here, in the sandbox, never on a server
 * of ours.
 */
export const GRADE = `bash -c 'chown -R root:root -- "$TRIAL_ROOT" && mkdir -p -- "$GRADER_ROOT" && tar -xzf "$GRADER_ARCHIVE" -C "$GRADER_ROOT" && cd /tmp && timeout -k 2 ${String(CONVENTION_EVAL_LIMITS.gradeSeconds)} node "$GRADER_ROOT/packages/catalog/evals/src/grade-cli.ts" "$TASK_ID" "$TRIAL_ROOT/repo" "$BASE_COMMIT" "$TRIAL_ROOT/origin.git" 2>/dev/null | head -c 20000; exit "\${PIPESTATUS[0]}"'`
