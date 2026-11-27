import {
  REPOSITORY_SANDBOX,
  REPOSITORY_TOOL_LIMITS,
  TERMINAL_LIMITS,
} from '#app/assistant/constants/repository'
import type { OpenRepositorySandbox } from '#app/assistant/services/repository-sandbox'
import { GITHUB_IMPORT_LIMITS } from '#app/code-maps/constants/code-map'
import { GITHUB_SOURCE_LIMITS } from '#app/github/constants/github'

/**
 * The only command lines the API runs in a repository sandbox. All are fixed and read only but
 * for the clone: what varies (a URL, a path, a commit, line numbers, a search) comes in as an
 * environment variable of that one run, checked by the API first (`isRepositoryPath`,
 * `isCommitId`, integers), so nothing the model writes is read by the shell that starts them,
 * and nothing it writes runs. An installation token never reaches a command line, an environment
 * or the standard input of a run: E2B keeps all three. The API writes it to
 * `cloneSecretFile($REPO_ROOT)` (`writeSecret`, `cloneCredential`), and the clone's line reads
 * it, removes the file before anything else and gives it to its one fetching git process only
 * (`GIT_CONFIG_*`). Each caps what it answers inside the sandbox (`head`), and the API cuts it
 * again. The repository's own code is never run: no hook, filter, LFS, submodule or symbolic
 * link. `MAP` is the one line that writes besides the clone: graphify reads the clone
 * (tree-sitter only, no model) and leaves its graph beside it. Tested against this machine's bash
 * and git (`tests/unit/assistant/repository-commands.spec.ts`).
 */

/**
 * Where `CLONE` and `CLONE_AT` read the credential of their fetch, beside the clone: a fixed
 * path, never anything of the secret's. They remove it first thing, whatever happens next.
 */
export const cloneSecretFile = (root: string) => `${root}.auth`

/**
 * An installation token as what `CLONE` and `CLONE_AT` read from `cloneSecretFile`: the base64 of
 * git's basic credential for github.com, one line without newline, which the line turns into
 * git's HTTP header. Not `credential.helper` (refused below), not the URL (git would print and
 * keep it), not `-c` (visible to every process).
 */
export function cloneCredential(token: string): string {
  return Buffer.from(`x-access-token:${token}`).toString('base64')
}

/**
 * Leaves `token` where the next `CLONE` or `CLONE_AT` run with `REPO_ROOT` = `root` reads it,
 * and has the sandbox refuse it, and its credential, in any later line or environment. False
 * when the sandbox did not take it.
 */
export function writeCloneCredential(
  sandbox: Pick<OpenRepositorySandbox, 'writeSecret'>,
  root: string,
  token: string,
): Promise<boolean> {
  return sandbox.writeSecret(cloneSecretFile(root), cloneCredential(token), [token])
}

/**
 * `$REPO_TIMEOUT` of a `CLONE` or `CLONE_AT` the API waits `timeoutMs` for: the line kills its
 * git `cloneKillMarginMs` before, so nothing of the clone is left running once the API gave up.
 */
export function cloneKillSeconds(timeoutMs: number): { REPO_TIMEOUT: string } {
  const seconds = Math.floor((timeoutMs - REPOSITORY_SANDBOX.cloneKillMarginMs) / 1000)
  return { REPO_TIMEOUT: String(Math.max(1, seconds)) }
}

const cap = `head -c ${String(REPOSITORY_SANDBOX.outputMaxBytes)}`

/** Git without anything of the repository's that could run, and without asking for anything. */
const git = [
  'GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_LFS_SKIP_SMUDGE=1',
  'git -c core.symlinks=false -c core.hooksPath=/dev/null -c core.fsmonitor=false',
  '-c protocol.allow=never -c protocol.https.allow=always -c credential.helper=',
  '-c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false',
].join(' ')

/**
 * Reads the credential left in `cloneSecretFile($REPO_ROOT)`, when there is one, and removes the
 * file before anything else, whatever happens next. `$C` is left holding the variables that give
 * git's HTTP header to one process, after any `GIT_CONFIG_*` already set (its count read as a
 * decimal, leading zeros or not); nothing for a public repository. Exits 1 when the file cannot
 * be removed or holds anything but base64.
 */
const credential = [
  `A="${cloneSecretFile('$REPO_ROOT')}"`,
  'H=$(cat -- "$A" 2>/dev/null)',
  'rm -f -- "$A"',
  'test ! -e "$A" || exit 1',
  'C=()',
  'if test -n "$H"; then case "$H" in *[!A-Za-z0-9+/=]*) exit 1 ;; esac',
  `N=\${GIT_CONFIG_COUNT:-0}`,
  'case "$N" in *[!0-9]*) exit 1 ;; esac',
  'N=$((10#$N))',
  [
    'C=("GIT_CONFIG_COUNT=$((N + 1))"',
    '"GIT_CONFIG_KEY_$N=http.https://github.com/.extraheader"',
    '"GIT_CONFIG_VALUE_$N=Authorization: Basic $H")',
  ].join(' '),
  'fi',
  'unset H',
  // A number of seconds (`cloneKillSeconds`), or nothing runs.
  'case "$REPO_TIMEOUT" in "" | *[!0-9]*) exit 1 ;; esac',
].join('; ')

/**
 * Runs `git <args>` with the variables of `$C` in its environment only, never in a command line
 * (`export` in a subshell, then `exec`: `/proc/<pid>/cmdline` is readable by every user,
 * `environ` by the same one only), and kills it, with every process it started, after
 * `$REPO_TIMEOUT` seconds: a clone the API gave up on never goes on. Then exits 124 when it was
 * killed (GNU `timeout` with KILL answers 137), 1 when it failed, and goes on when it succeeded.
 * A git the kernel killed for want of memory also answers 137, so it reads as a timeout too:
 * acceptable, since both mean the clone was too large for the sandbox, and the session's second
 * try (the files of one commit only) is the answer to either.
 */
const fetching = (args: string) =>
  [
    `( test \${#C[@]} -eq 0 || export "\${C[@]}"; exec timeout --signal=KILL "$REPO_TIMEOUT" env ${git} ${args} ) >/dev/null 2>&1`,
    'S=$?',
    'case "$S" in 0) ;; 124 | 137) exit 124 ;; *) exit 1 ;; esac',
  ].join('; ')

/**
 * Fails unless `$<name>` resolves under the repository root (symbolic links and `..` resolved)
 * and out of its `.git`, leaving the resolved root in `$R` and the path in `$P`: the API refuses
 * such a path first (`isRepositoryPath`), this holds even if it did not.
 */
const inside = (name: string) =>
  `R=$(realpath -e -- "$REPO_ROOT") && P=$(realpath -m -- "$R/$${name}") && case "$P/" in "$R"/.git/*) exit 3 ;; "$R"/*) ;; *) exit 3 ;; esac`

/**
 * Clones `$REPO_URL` (`$REPO_BRANCH`, or its default branch) into `$REPO_ROOT`, its Git folder
 * beside it: every commit, folder and file, or with `$REPO_FILTER` (`blob:none`) the files of
 * the checked-out commit only. With `$REPO_DEPTH`, only that many commits (a code map needs
 * one). Nothing is fetched afterwards: the sandbox is cut off the network once the clone is in,
 * and a filtered clone forgets where it came from, so git fails at once on a file it lacks
 * instead of waiting for a network that is gone.
 * The credential of a private repository is read from `cloneSecretFile` (`credential`) and
 * given to the clone only. Exits 4 past `cloneMaxBytes`, 124 past `$REPO_TIMEOUT` seconds
 * (`cloneKillSeconds`), and answers the commit.
 */
export const CLONE = `bash -o pipefail -c '${[
  credential,
  'rm -rf -- "$REPO_ROOT" "$REPO_ROOT.git" || exit 1',
  fetching(
    `clone --quiet \${REPO_FILTER:+--filter="$REPO_FILTER"} --single-branch --no-tags --no-recurse-submodules --template= --separate-git-dir "$REPO_ROOT.git" \${REPO_BRANCH:+--branch "$REPO_BRANCH"} \${REPO_DEPTH:+--depth "$REPO_DEPTH"} -- "$REPO_URL" "$REPO_ROOT"`,
  ),
  `test "$(du -sk -- "$REPO_ROOT" "$REPO_ROOT.git" | awk "{ s += \\$1 } END { print s }")" -le ${String(Math.floor(REPOSITORY_SANDBOX.cloneMaxBytes / 1024))} || exit 4`,
  `test -z "$REPO_FILTER" || ${git} -C "$REPO_ROOT" remote remove origin || exit 1`,
  `${git} -C "$REPO_ROOT" rev-parse HEAD`,
].join('; ')}'`

/**
 * The files of commit `$REPO_COMMIT` of `$REPO_URL` in `$REPO_ROOT`, and nothing of its history:
 * what a drawing or a review reads the source from, at the commit its code map was read at (a
 * full commit id: git fetches no shortened one). Same rules, same credential (given to the
 * fetch only) and same exits as `CLONE`.
 */
// ponytail: fetches every file of the commit to read a few; a partial fetch if it gets slow.
export const CLONE_AT = `bash -o pipefail -c '${[
  credential,
  `rm -rf -- "$REPO_ROOT" "$REPO_ROOT.git" && ${git} init --quiet --template= --separate-git-dir "$REPO_ROOT.git" -- "$REPO_ROOT" >/dev/null 2>&1 && cd -- "$REPO_ROOT" || exit 1`,
  fetching(
    'fetch --quiet --depth 1 --no-tags --no-recurse-submodules -- "$REPO_URL" "$REPO_COMMIT"',
  ),
  `${git} checkout --quiet --detach FETCH_HEAD >/dev/null 2>&1 || exit 1`,
  `test "$(du -sk -- "$REPO_ROOT" "$REPO_ROOT.git" | awk "{ s += \\$1 } END { print s }")" -le ${String(Math.floor(REPOSITORY_SANDBOX.cloneMaxBytes / 1024))} || exit 4`,
  `${git} rev-parse HEAD`,
].join('; ')}'`

/**
 * The whole text file `$READ_PATH`, cut one byte past `GITHUB_SOURCE_LIMITS.fileBytes` so the
 * API tells a larger file and leaves it out. Fails on a missing, empty or binary file.
 */
export const READ_FILE = `bash -c '${inside('READ_PATH')} && cd -- "$R" && test -f "./$READ_PATH" && grep -qI "" -- "./$READ_PATH" && head -c ${String(GITHUB_SOURCE_LIMITS.fileBytes + 1)} -- "./$READ_PATH"'`

/**
 * Runs `$SHELL_COMMAND`, a command of the model, from the clone, its two outputs as one, cut
 * like any other (byte by byte, `dd`, where `head` would hold everything back until the end: the
 * owner follows the output as it is printed) and killed after `shellSeconds`. The command comes in as an environment
 * variable, so the shell that starts it reads nothing the model wrote. Run it only in a sandbox
 * cut off the network (`isolate`), and never hand that sandbox a token afterwards: what the
 * command leaves running could read it.
 */
export const SHELL = `bash -c 'cd -- "$REPO_ROOT" && timeout -k 2 ${String(REPOSITORY_SANDBOX.shellSeconds)} bash -c "$SHELL_COMMAND" 2>&1 < /dev/null | dd bs=1 count=${String(REPOSITORY_SANDBOX.outputMaxBytes)} status=none; exit "\${PIPESTATUS[0]}"'`

/** Where the owner's terminal keeps its folder between two commands: beside the clone. */
export const terminalCwdFile = (root: string) => `${root}.terminal.cwd`

/**
 * `SHELL` for the owner's own terminal, with what makes it one: `$SHELL_COMMAND` starts in the
 * folder the command before it ended in (kept in a file beside the clone, the clone's root when
 * it is gone) and leaves its own there, and its process is noted for `STOP_TERMINAL`. Its own
 * limits (`TERMINAL_LIMITS`) and the same rule as `SHELL`: only in a sandbox cut off the
 * network, which never gets a token afterwards.
 */
export const TERMINAL = `S="$REPO_ROOT.terminal"; export S; cd -- "$REPO_ROOT" || exit 1; cd -- "$(cat "$S.cwd" 2>/dev/null)" 2>/dev/null; { echo "$BASHPID" > "$S.pid"; exec timeout -k 2 ${String(TERMINAL_LIMITS.seconds)} bash -c 'trap "pwd > \\"\\$S.cwd\\"" EXIT; eval "$SHELL_COMMAND"'; } 2>&1 < /dev/null | dd bs=1 count=${String(TERMINAL_LIMITS.outputMaxBytes)} status=none; code="\${PIPESTATUS[0]}"; rm -f "$S.pid"; exit "$code"`

/** Stops the command `TERMINAL` is running, and what it started (Ctrl+C). */
export const STOP_TERMINAL = `kill -TERM "$(cat "$REPO_ROOT.terminal.pid" 2>/dev/null)" 2>/dev/null; true`

/** What `MAP` exits with when the clone cannot be mapped. */
export const MAP_EXIT = { extraction: 2, tooLarge: 4, tooManyFiles: 5 } as const

/** Where `MAP` leaves the graph, gzipped: beside the clone, like its Git folder. */
export const mapFile = (root: string) => `${root}.graph.gz`

/**
 * Maps the clone in `$REPO_ROOT` with graphify and leaves `graph.json`, gzipped, in
 * `mapFile($REPO_ROOT)`; answers the branch cloned. The history goes first (graphify has no use
 * for it), with a `graphify-out/` the repository committed, which is never trusted nor reused.
 * `$MAP_IGNORE` becomes the `.graphifyignore` unless the repository has its own, which wins. Run
 * it without the token the clone had: graphify reads code that may be hostile.
 */
export const MAP = `bash -c 'cd -- "$REPO_ROOT" && B=$(${git} rev-parse --abbrev-ref HEAD) || exit 1; rm -rf -- .git "$REPO_ROOT.git" graphify-out; test "$(find . -type f | head -n ${String(GITHUB_IMPORT_LIMITS.maxFiles + 1)} | wc -l)" -le ${String(GITHUB_IMPORT_LIMITS.maxFiles)} || exit ${String(MAP_EXIT.tooManyFiles)}; test -e .graphifyignore || printf "%s" "$MAP_IGNORE" > .graphifyignore; export GRAPHIFY_BACKEND=none GRAPHIFY_QUERY_LOG_DISABLE=1; graphify update . --no-cluster --force >/dev/null 2>&1 && graphify cluster-only . --no-viz --no-label >/dev/null 2>&1 || exit ${String(MAP_EXIT.extraction)}; G=graphify-out/graph.json; test -f "$G" && test ! -L "$G" && gzip -c "$G" > "${mapFile('$REPO_ROOT')}" || exit ${String(MAP_EXIT.extraction)}; test "$(stat -c %s "${mapFile('$REPO_ROOT')}")" -le ${String(GITHUB_IMPORT_LIMITS.graphBytes)} || exit ${String(MAP_EXIT.tooLarge)}; printf "%s\\n" "$B"'`

/** The entries under `$LIST_PATH` (the root when empty), folders ending in `/`, sorted. */
export const LIST = `bash -c '${inside('LIST_PATH')} && cd -- "$P" && find . -mindepth 1 -maxdepth ${String(REPOSITORY_TOOL_LIMITS.listDepth)} -name .git -prune -o \\( -type d -printf "%P/\\n" -o -type f -printf "%P\\n" \\) | sort | head -n ${String(REPOSITORY_TOOL_LIMITS.listEntries)} | ${cap}'`

/**
 * Lines `$READ_FROM` to `$READ_TO` of the text file `$READ_PATH`, after one line holding the
 * file's line count. Fails on a missing, empty or binary file.
 */
export const READ = `bash -c '${inside('READ_PATH')} && cd -- "$R" && test -f "./$READ_PATH" && grep -qI "" -- "./$READ_PATH" && wc -l < "./$READ_PATH" && sed -n "$READ_FROM,\${READ_TO}p" -- "./$READ_PATH" | ${cap}'`

/**
 * The lines holding `$SEARCH_QUERY` (a fixed string, any case) under `$SEARCH_PATH`, as
 * `path:line:text`, binary files left out. Answers nothing, and succeeds, when none does.
 */
export const SEARCH = `bash -c '${inside('SEARCH_PATH')} && cd -- "$R" && test -e "./$SEARCH_PATH" && { grep -rnIFi --exclude=.git -m ${String(REPOSITORY_TOOL_LIMITS.searchPerFile)} -e "$SEARCH_QUERY" -- "./$SEARCH_PATH" | sed "s|^\\./||" | cut -c 1-${String(REPOSITORY_TOOL_LIMITS.searchLineLength)} | head -n ${String(REPOSITORY_TOOL_LIMITS.searchLines)} | ${cap}; true; }'`

/** The newest commits touching `$LOG_PATH` (the whole repository when empty), one a line. */
export const GIT_LOG = `bash -c '${inside('LOG_PATH')} && cd -- "$R" && O=$(${git} log -n ${String(REPOSITORY_TOOL_LIMITS.logCommits)} --no-merges --date=short --format="%h %ad %an: %s" -- "./$LOG_PATH" 2>/dev/null) && printf "%s\\n" "$O" | cut -c 1-${String(REPOSITORY_TOOL_LIMITS.searchLineLength)} | ${cap}'`

/**
 * Commit `$SHOW_COMMIT`: its message, the files it changed and its changes (to `$SHOW_PATH`
 * only when set), cut to `showLines`. Fails on a commit the clone does not hold.
 */
export const GIT_SHOW = `bash -c '${inside('SHOW_PATH')} && cd -- "$R" && ${git} cat-file -e "$SHOW_COMMIT^{commit}" 2>/dev/null && { ${git} show --no-ext-diff --no-textconv --no-color --stat --patch --date=short --format="commit %H%nAuthor: %an%nDate: %ad%n%n%B" "$SHOW_COMMIT" -- "./$SHOW_PATH" 2>/dev/null | head -n ${String(REPOSITORY_TOOL_LIMITS.showLines)} | ${cap}; true; }'`

/**
 * Who last changed lines `$BLAME_FROM` to `$BLAME_TO` of the file `$BLAME_PATH`, in which
 * commit and when. Fails on a missing file or lines past its end.
 */
export const GIT_BLAME = `bash -c '${inside('BLAME_PATH')} && cd -- "$R" && test -f "./$BLAME_PATH" && O=$(${git} blame --date=short -L "$BLAME_FROM,$BLAME_TO" -- "./$BLAME_PATH" 2>/dev/null) && printf "%s\\n" "$O" | cut -c 1-${String(REPOSITORY_TOOL_LIMITS.searchLineLength)} | ${cap}'`
