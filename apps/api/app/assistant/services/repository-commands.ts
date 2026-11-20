import { REPOSITORY_SANDBOX, REPOSITORY_TOOL_LIMITS } from '#app/assistant/constants/repository'

/**
 * The only command lines the API runs in a repository sandbox. All are fixed and read only but
 * for the clone: what varies (a URL, a path, a commit, line numbers, a search) comes in as an
 * environment variable of that one run, checked by the API first (`isRepositoryPath`,
 * `isCommitId`, integers), so nothing the model writes is read by the shell that starts them,
 * and nothing it writes runs. An installation token reaches git the same way (`GIT_CONFIG_*`,
 * read by that one git process): it is never written to a file of the sandbox. Each caps what it
 * answers inside the sandbox (`head`), and the API cuts it again. The repository's own code is
 * never run: no hook, filter, LFS, submodule or symbolic link. Tested against this machine's
 * bash and git (`tests/unit/assistant/repository-commands.spec.ts`).
 */

const cap = `head -c ${String(REPOSITORY_SANDBOX.outputMaxBytes)}`

/** Git without anything of the repository's that could run, and without asking for anything. */
const git = [
  'GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_LFS_SKIP_SMUDGE=1',
  'git -c core.symlinks=false -c core.hooksPath=/dev/null -c core.fsmonitor=false',
  '-c protocol.allow=never -c protocol.https.allow=always -c credential.helper=',
  '-c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false',
].join(' ')

/**
 * Fails unless `$<name>` resolves under the repository root (symbolic links and `..` resolved)
 * and out of its `.git`, leaving the resolved root in `$R` and the path in `$P`: the API refuses
 * such a path first (`isRepositoryPath`), this holds even if it did not.
 */
const inside = (name: string) =>
  `R=$(realpath -e -- "$REPO_ROOT") && P=$(realpath -m -- "$R/$${name}") && case "$P/" in "$R"/.git/*) exit 3 ;; "$R"/*) ;; *) exit 3 ;; esac`

/**
 * Clones `$REPO_URL` (`$REPO_BRANCH`, or its default branch) into `$REPO_ROOT`: every commit and
 * folder, the files of the checked-out commit only (older ones are fetched when `GIT_SHOW` or
 * `GIT_BLAME` needs them), its Git folder beside it. Exits 4 past `cloneMaxBytes`, and answers
 * the commit.
 */
export const CLONE = `bash -o pipefail -c 'rm -rf -- "$REPO_ROOT" "$REPO_ROOT.git" && ${git} clone --quiet --filter=blob:none --single-branch --no-tags --no-recurse-submodules --template= --separate-git-dir "$REPO_ROOT.git" \${REPO_BRANCH:+--branch "$REPO_BRANCH"} -- "$REPO_URL" "$REPO_ROOT" >/dev/null 2>&1 || exit 1; test "$(du -sk -- "$REPO_ROOT" "$REPO_ROOT.git" | awk "{ s += \\$1 } END { print s }")" -le ${String(Math.floor(REPOSITORY_SANDBOX.cloneMaxBytes / 1024))} || exit 4; ${git} -C "$REPO_ROOT" rev-parse HEAD'`

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
