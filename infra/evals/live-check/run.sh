#!/usr/bin/env bash
# Manual live check of the convention evals runner against an E2B install (record, section 13).
# Never in CI, never with a real key: the key it passes is a made-up one the provider refuses.
#
#   E2B_API_KEY=… E2B_API_URL=… E2B_SANDBOX_URL=… infra/evals/live-check/run.sh <agent> <mode>
#
# <agent>: claude-code | codex. <mode>:
#   oracle  every exported task, Harbor's oracle agent, no key: each trial must pass both graders.
#   fake    one task with a fake key: the provider must answer 401, the key must be in no file of
#           the job folder and in no row of the install's `sandbox_logs`, neither as is nor in
#           base64 at any of its three alignments (envd logs a process's standard input in
#           base64), while two controls of the same sandbox are: a canary sent as an env (as is)
#           and a value sent on a command's standard input (in base64). No `auth.json` after a
#           Codex trial. Prints counts only, never a value.
#
# The E2B settings come from the environment only and reach the container by name, never on a
# command line. IMAGE (default coreloom-uml-dev-convention-evals, built by the `evals` profile)
# runs Harbor, with this checkout's classes first on its path. For the `fake` mode the install's
# ClickHouse is read with `docker exec` (CLICKHOUSE_CONTAINER, CLICKHOUSE_USER,
# CLICKHOUSE_PASSWORD; defaults: the local install of infra/e2b/).
set -euo pipefail

agent="${1:?agent: claude-code or codex}"
mode="${2:?mode: oracle or fake}"
: "${E2B_API_KEY:?set E2B_API_KEY}" "${E2B_API_URL:?set E2B_API_URL}" "${E2B_SANDBOX_URL:?set E2B_SANDBOX_URL}"
image="${IMAGE:-coreloom-uml-dev-convention-evals}"
here="$(cd "$(dirname "$0")" && pwd)"
evals="$(dirname "$here")"
root="$(cd "$evals/../.." && pwd)"
run="$(mktemp -d "${TMPDIR:-/tmp}/convention-evals-live.XXXXXX")"
chmod 0700 "$run"
stamp="$(date +%s)"

only=""
key_name=""
fake=""
if [ "$mode" = fake ]; then
  only="package-manager-pnpm-add--full"
  if [ "$agent" = codex ]; then key_name=CODEX_API_KEY fake="sk-proj-CANARYFAKE-live-$stamp"
  else key_name=ANTHROPIC_API_KEY fake="sk-ant-api03-CANARYFAKE-live-$stamp"; fi
fi
oracle=0
[ "$mode" = oracle ] && oracle=1

node "$here/export.ts" "$run" "$agent" "$oracle" 1 "$only" > "$run/command.json"

export ENVLOG_CANARY="envlog-canary-$stamp"
export ENVLOG_STDIN_CONTROL="envlog-stdin-control-$stamp"
extra=(-e E2B_API_KEY -e E2B_API_URL -e E2B_SANDBOX_URL -e ENVLOG_CANARY -e ENVLOG_STDIN_CONTROL)
[ -n "$key_name" ] && { export "$key_name=$fake"; extra+=(-e "$key_name"); }
# The exported command, run in the image: its env as -e pairs, then Harbor's arguments (in the
# fake mode with the probe class in place of ours, which it extends).
mapfile -t args < <(IMAGE_NAME="$image" PROBE=$([ "$mode" = fake ] && echo 1 || echo 0) node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const out = [];
  for (const [k, v] of Object.entries(c.env)) out.push("-e", `${k}=${v}`);
  out.push("--entrypoint", c.file, process.env.IMAGE_NAME);
  const probe = process.env.PROBE === "1";
  for (const a of c.args) out.push(probe && a.startsWith("coreloom_harbor.environment:") ? "envlog_probe:ProbeEnvironment" : a);
  for (const a of out) console.log(a);
' "$run/command.json")

docker run --rm --name "convention-evals-live-$stamp" --network host \
  --user "$(id -u):$(id -g)" -v "$run:$run" \
  -v "$evals:/opt/coreloom-pkg:ro" -v "$here/envlog_probe.py:/opt/coreloom-probe/envlog_probe.py:ro" \
  -e PYTHONPATH=/opt/coreloom-pkg:/opt/coreloom-probe "${extra[@]}" "${args[@]}" || true

job="$(ls -d "$run"/jobs/*/ | head -n 1)"
ROOT="$root" node --input-type=module -e '
  const [job, mode, fake] = process.argv.slice(1);
  const { readHarborJob } = await import(process.env.ROOT + "/packages/catalog/evals/src/harbor/index.ts");
  const { EVAL_TASKS } = await import(process.env.ROOT + "/packages/catalog/evals/tasks/index.ts");
  let failed = 0;
  for (const t of await readHarborJob(job)) {
    const task = EVAL_TASKS.find((x) => x.id === t.taskId);
    const grades = t.state && task ? [task.success(t.state).verdict, task.compliance(t.state).verdict] : null;
    const leaked = fake ? t.outputs.filter((o) => o.text.includes(fake)).map((o) => o.path) : [];
    console.log(JSON.stringify({ trial: `${t.taskId}--${t.condition}`, error: t.error, grades, leaked }));
    if (mode === "oracle" && (t.error || grades?.some((v) => v !== "pass"))) failed++;
    if (mode === "fake" && (t.error !== "AgentAuthenticationError" || leaked.length)) failed++;
  }
  process.exit(failed ? 1 : 0);
' "$job" "$mode" "$fake"

if [ "$mode" = fake ]; then
  if grep -rlF "$fake" "$run/jobs"; then echo "the fake key is in a file of the job folder" >&2; exit 1; fi
  if [ "$agent" = codex ] && find "$run/jobs" -name auth.json | grep -q .; then
    echo "a Codex trial left an auth.json" >&2; exit 1
  fi
  sleep 20
  query() {
    docker exec "${CLICKHOUSE_CONTAINER:-e2b-clickhouse-1}" clickhouse-client \
      --user "${CLICKHOUSE_USER:-clickhouse}" --password "${CLICKHOUSE_PASSWORD:-clickhouse}" \
      -q "select count() from sandbox_logs where position(raw, '$1') > 0"
  }
  b64() { printf '%s' "$1" | base64 -w 0; }
  # What of base64(value) is the same whatever bytes surround it in a larger base64 blob (a
  # whole request body), at each of the three alignments: at offset 0 all of it but its last
  # group, at offsets 1 and 2 the middle of base64(padding + value).
  aligned() {
    local value="$1" k encoded
    encoded="$(b64 "$value")"
    printf '%s\n' "${encoded:0:${#encoded}-4}"
    for k in 1 2; do
      encoded="$(b64 "$(printf '%*s' "$k" '' | tr ' ' x)$value")"
      printf '%s\n' "${encoded:4:${#encoded}-8}"
    done
  }
  failed=0
  count() { # <label> <value> <expected: zero | some>
    local rows
    rows="$(query "$2")"
    echo "sandbox_logs: $1 rows=$rows (expected $3)"
    if [ "$3" = zero ]; then [ "$rows" = 0 ] || failed=1; else [ "$rows" -ge 1 ] || failed=1; fi
  }
  count "fake key, as is" "$fake" zero
  offset=0
  while IFS= read -r part; do
    count "fake key, base64 at offset $offset" "$part" zero
    offset=$((offset + 1))
  done < <(aligned "$fake")
  count "env canary, as is" "$ENVLOG_CANARY" some
  count "stdin control, base64" "$(b64 "$ENVLOG_STDIN_CONTROL")" some
  count "stdin control, base64 at offset 0" "$(aligned "$ENVLOG_STDIN_CONTROL" | head -n 1)" some
  [ "$failed" = 0 ] || exit 1
fi
echo "live check passed: $agent $mode ($run)"
