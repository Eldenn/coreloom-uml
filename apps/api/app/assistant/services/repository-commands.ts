import { REPOSITORY_SANDBOX, REPOSITORY_TOOL_LIMITS } from '#app/assistant/constants/repository'

/**
 * The only command lines the API runs in a repository sandbox. All are fixed and read only but
 * for unpacking the archive: what varies (a path, line numbers, a search) comes in as an
 * environment variable of that one run, checked by the API first (`isRepositoryPath`, integers),
 * so nothing the model writes is read by the shell that starts them, and nothing it writes runs.
 * Each caps what it answers inside the sandbox (`head`), and the API cuts it again. The
 * repository's own code is never run. Tested against this machine's bash
 * (`tests/unit/assistant/repository-commands.spec.ts`).
 */

const cap = `head -c ${String(REPOSITORY_SANDBOX.outputMaxBytes)}`

/**
 * Fails unless `$<name>` resolves under the repository root (symbolic links and `..` resolved),
 * leaving the resolved root in `$R` and the path in `$P`: the API refuses such a path first
 * (`isRepositoryPath`), this holds even if it did not.
 */
const inside = (name: string) =>
  `R=$(realpath -e -- "$REPO_ROOT") && P=$(realpath -m -- "$R/$${name}") && case "$P/" in "$R"/*) ;; *) exit 3 ;; esac`

/** Unpacks `$ARCHIVE_PATH` (regular files only, from the analyzer) into `$REPO_ROOT`. */
export const UNPACK = `bash -o pipefail -c 'mkdir -p "$REPO_ROOT" && tar -xzf "$ARCHIVE_PATH" -C "$REPO_ROOT" --no-same-owner --no-same-permissions && rm -f "$ARCHIVE_PATH"'`

/** The entries under `$LIST_PATH` (the root when empty), folders ending in `/`, sorted. */
export const LIST = `bash -c '${inside('LIST_PATH')} && cd -- "$P" && find . -mindepth 1 -maxdepth ${String(REPOSITORY_TOOL_LIMITS.listDepth)} \\( -type d -printf "%P/\\n" -o -type f -printf "%P\\n" \\) | sort | head -n ${String(REPOSITORY_TOOL_LIMITS.listEntries)} | ${cap}'`

/**
 * Lines `$READ_FROM` to `$READ_TO` of the text file `$READ_PATH`, after one line holding the
 * file's line count. Fails on a missing, empty or binary file.
 */
export const READ = `bash -c '${inside('READ_PATH')} && cd -- "$R" && test -f "./$READ_PATH" && grep -qI "" -- "./$READ_PATH" && wc -l < "./$READ_PATH" && sed -n "$READ_FROM,\${READ_TO}p" -- "./$READ_PATH" | ${cap}'`

/**
 * The lines holding `$SEARCH_QUERY` (a fixed string, any case) under `$SEARCH_PATH`, as
 * `path:line:text`, binary files left out. Answers nothing, and succeeds, when none does.
 */
export const SEARCH = `bash -c '${inside('SEARCH_PATH')} && cd -- "$R" && test -e "./$SEARCH_PATH" && { grep -rnIFi -m ${String(REPOSITORY_TOOL_LIMITS.searchPerFile)} -e "$SEARCH_QUERY" -- "./$SEARCH_PATH" | sed "s|^\\./||" | cut -c 1-${String(REPOSITORY_TOOL_LIMITS.searchLineLength)} | head -n ${String(REPOSITORY_TOOL_LIMITS.searchLines)} | ${cap}; true; }'`
