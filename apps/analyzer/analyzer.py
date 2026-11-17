"""Code map analyzer: clones a public GitHub repository and maps its code with graphify.

A small HTTP service with no secrets: no database, no APP_KEY, no storage credentials. The API's
queue worker calls it and stores what it answers; nothing else should reach it (it is never
published on a port).

    POST /analyze  {"repository": "https://github.com/<owner>/<repo>", "branch"?: str, "ignore"?: str}
        200: graphify's graph.json, gzipped (application/gzip), with the X-Commit-Sha, X-Branch
             and X-Graphify-Version headers.
        400: a malformed request. 422: {"error": {"code", "message"}}, the repository could not be
             mapped (see ERRORS). 503: another repository is being mapped.
    GET /health    200 once the server listens.

The code is data: it is read, never run. The clone is shallow, without submodules, symlinks,
hooks, LFS or credentials, bounded in size, file count and time, and deleted afterwards.
graphify reads it with tree-sitter only (GRAPHIFY_BACKEND=none), so no model is called.
"""

from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Limits of one extraction (see the code maps spec, "Security").
MAX_REPOSITORY_BYTES = int(os.environ.get("ANALYZER_MAX_BYTES", 200 * 1024 * 1024))
MAX_FILES = int(os.environ.get("ANALYZER_MAX_FILES", 20_000))
TIMEOUT_SECONDS = int(os.environ.get("ANALYZER_TIMEOUT_SECONDS", 5 * 60))
# The largest request body: a URL, a branch and a short ignore file.
MAX_REQUEST_BYTES = 64 * 1024
MAX_IGNORE_BYTES = 16 * 1024
# How often a running clone is measured.
POLL_SECONDS = 0.5

GITHUB_HOST = "github.com"
OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
REPOSITORY = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
BRANCH = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")
SHA = re.compile(r"^[0-9a-f]{40,64}$")

# What a refusal says. The API shows its own wording; the code is what it reads.
ERRORS = {
    "not_found": "The repository or branch does not exist, or it is not public.",
    "too_large": "The repository is larger than the analyzer accepts.",
    "too_many_files": "The repository holds more files than the analyzer accepts.",
    "timeout": "Reading the repository took too long.",
    "extraction_failed": "graphify could not read the repository.",
}

GRAPHIFY = os.environ.get("GRAPHIFY_COMMAND", "graphify")
GRAPHIFY_STEPS = (
    # `--force`: the graph is written even when it shrinks (same steps as the CLI's `map push`).
    ("update", ".", "--no-cluster", "--force"),
    ("cluster-only", ".", "--no-viz", "--no-label"),
)
GRAPH_FILE = os.path.join("graphify-out", "graph.json")
IGNORE_FILE = ".graphifyignore"


class AnalysisError(Exception):
    """A repository that could not be mapped, with one of the ERRORS codes."""

    def __init__(self, code: str):
        super().__init__(ERRORS[code])
        self.code = code


@dataclass(frozen=True)
class Request:
    owner: str
    repository: str
    branch: str | None
    ignore: str | None

    @property
    def clone_url(self) -> str:
        return f"https://{GITHUB_HOST}/{self.owner}/{self.repository}.git"


@dataclass(frozen=True)
class Analysis:
    graph: bytes
    commit: str
    branch: str


def parse_repository(value: object) -> tuple[str, str] | None:
    """`https://github.com/<owner>/<repo>` (an optional `.git` or trailing slash) → its parts."""
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?", value.strip())
    if not match:
        return None
    owner, repository = match.groups()
    if not OWNER.match(owner) or not REPOSITORY.match(repository) or repository in {".", ".."}:
        return None
    return owner, repository


def valid_branch(value: str) -> bool:
    """A branch name git accepts and that cannot be read as an option or a path trick."""
    return (
        bool(BRANCH.match(value))
        and not value.startswith(("-", "/", "."))
        and not value.endswith(("/", ".", ".lock"))
        and ".." not in value
        and "//" not in value
        and "/." not in value
    )


def parse_request(body: bytes) -> Request | None:
    try:
        value = json.loads(body)
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    parts = parse_repository(value.get("repository"))
    if not parts:
        return None
    branch = value.get("branch")
    if branch is not None and (not isinstance(branch, str) or not valid_branch(branch)):
        return None
    ignore = value.get("ignore")
    if ignore is not None and (
        not isinstance(ignore, str) or len(ignore.encode()) > MAX_IGNORE_BYTES
    ):
        return None
    return Request(owner=parts[0], repository=parts[1], branch=branch, ignore=ignore)


def tool_env(home: str, **extra: str) -> dict[str, str]:
    """A bare environment: the PATH, a throwaway HOME, nothing else from this process."""
    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": home, "LANG": "C.UTF-8", **extra}


def tree_size(path: str, skip_git: bool = False) -> tuple[int, int]:
    """Bytes and files under `path`, symlinks not followed."""
    size = 0
    files = 0
    for root, dirs, names in os.walk(path, followlinks=False):
        if skip_git and ".git" in dirs:
            dirs.remove(".git")
        for name in names:
            try:
                stat = os.lstat(os.path.join(root, name))
            except OSError:
                continue
            size += stat.st_size
            files += 1
    return size, files


def run_bounded(
    args: list[str],
    *,
    cwd: str,
    env: dict[str, str],
    deadline: float,
    watch: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Runs a command until it ends, the deadline passes or `watch` grows past the size limit."""
    process = subprocess.Popen(
        args,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    output: dict[str, str] = {}

    def drain(name: str, stream) -> None:  # type: ignore[no-untyped-def]
        output[name] = stream.read()[-20_000:]

    readers = [
        threading.Thread(target=drain, args=("out", process.stdout), daemon=True),
        threading.Thread(target=drain, args=("err", process.stderr), daemon=True),
    ]
    for reader in readers:
        reader.start()
    try:
        while process.poll() is None:
            if time.monotonic() > deadline:
                raise AnalysisError("timeout")
            if watch and os.path.isdir(watch) and tree_size(watch)[0] > MAX_REPOSITORY_BYTES:
                raise AnalysisError("too_large")
            time.sleep(POLL_SECONDS)
    finally:
        if process.poll() is None:
            kill(process)
        for reader in readers:
            reader.join(timeout=5)
        for stream in (process.stdout, process.stderr):
            if stream:
                stream.close()
    return subprocess.CompletedProcess(args, process.returncode, output.get("out", ""), output.get("err", ""))


def kill(process: subprocess.Popen[str]) -> None:
    try:
        os.killpg(process.pid, 9)
    except ProcessLookupError:
        pass
    process.wait()


def git(*args: str) -> list[str]:
    """git with every way a repository could run something or reach elsewhere turned off."""
    return [
        "git",
        "-c", "core.symlinks=false",
        "-c", "core.hooksPath=/dev/null",
        "-c", "core.fsmonitor=false",
        "-c", "protocol.allow=never",
        "-c", "protocol.https.allow=always",
        "-c", "credential.helper=",
        "-c", "filter.lfs.smudge=",
        "-c", "filter.lfs.process=",
        "-c", "filter.lfs.required=false",
        *args,
    ]


def clone(request: Request, work: str, deadline: float, clone_url: str | None = None) -> str:
    """Clones the branch (or the default one) at depth 1 into `work/repo`."""
    target = os.path.join(work, "repo")
    args = ["clone", "--depth", "1", "--single-branch", "--no-tags", "--no-recurse-submodules"]
    args += ["--template=", "--config", "core.symlinks=false", "--config", "core.hooksPath=/dev/null"]
    if request.branch:
        args += ["--branch", request.branch]
    args += ["--", clone_url or request.clone_url, target]
    env = tool_env(
        work,
        GIT_TERMINAL_PROMPT="0",
        GIT_ASKPASS="/bin/false",
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL=os.devnull,
        GIT_LFS_SKIP_SMUDGE="1",
    )
    command = git(*args)
    if clone_url:
        # Tests clone a local repository, which `protocol.allow=never` refuses otherwise.
        command[1:1] = ["-c", "protocol.file.allow=always"]
    result = run_bounded(command, cwd=work, env=env, deadline=deadline, watch=target)
    if result.returncode != 0:
        # A private or missing repository asks for credentials, which are refused: not found.
        raise AnalysisError("not_found")
    return target


def revision(repo: str, work: str) -> tuple[str, str]:
    """The commit cloned and its branch."""
    env = tool_env(work, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)

    def read(*args: str) -> str:
        result = subprocess.run(
            git(*args), cwd=repo, env=env, capture_output=True, text=True, timeout=30, check=False
        )
        return result.stdout.strip()

    commit = read("rev-parse", "HEAD")
    branch = read("rev-parse", "--abbrev-ref", "HEAD")
    if not SHA.match(commit):
        raise AnalysisError("extraction_failed")
    return commit, branch


def extract(repo: str, work: str, deadline: float, ignore: str | None) -> bytes:
    """Runs graphify on the clone; returns graph.json."""
    if ignore is not None and not os.path.lexists(os.path.join(repo, IGNORE_FILE)):
        with open(os.path.join(repo, IGNORE_FILE), "w", encoding="utf-8") as file:
            file.write(ignore)
    env = tool_env(work, GRAPHIFY_BACKEND="none", GRAPHIFY_QUERY_LOG_DISABLE="1")
    for step in GRAPHIFY_STEPS:
        result = run_bounded([GRAPHIFY, *step], cwd=repo, env=env, deadline=deadline)
        if result.returncode != 0:
            detail = (result.stderr.strip() or result.stdout.strip()).splitlines()[-5:]
            log(f"graphify {step[0]} failed ({result.returncode}): {' | '.join(detail)}")
            raise AnalysisError("extraction_failed")
    graph = os.path.join(repo, GRAPH_FILE)
    if os.path.islink(graph) or not os.path.isfile(graph):
        raise AnalysisError("extraction_failed")
    with open(graph, "rb") as file:
        return file.read()


def analyze(request: Request, clone_url: str | None = None) -> Analysis:
    """Clone, check, extract, clean up. `clone_url` is for tests only."""
    deadline = time.monotonic() + TIMEOUT_SECONDS
    work = tempfile.mkdtemp(prefix="analysis-")
    try:
        repo = clone(request, work, deadline, clone_url)
        commit, branch = revision(repo, work)
        size, files = tree_size(repo, skip_git=True)
        if size > MAX_REPOSITORY_BYTES:
            raise AnalysisError("too_large")
        if files > MAX_FILES:
            raise AnalysisError("too_many_files")
        # graphify has no use for the history, and the ignore file leaves `.git/` out anyway.
        shutil.rmtree(os.path.join(repo, ".git"), ignore_errors=True)
        # A graphify-out/ committed in the repository (an older graph, its cache and manifest) is
        # not trusted nor reused: the map is always extracted again from the code. The
        # repository's own .graphifyignore, when it has one, is kept and wins over ours.
        remove(os.path.join(repo, os.path.dirname(GRAPH_FILE)))
        graph = extract(repo, work, deadline, request.ignore)
        return Analysis(graph=graph, commit=commit, branch=request.branch or branch)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def remove(path: str) -> None:
    """Deletes a folder or a file, whichever it is (symlinks were checked out as files)."""
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path, ignore_errors=True)
    elif os.path.lexists(path):
        os.remove(path)


def graphify_version() -> str:
    try:
        result = subprocess.run(
            [GRAPHIFY, "--version"], capture_output=True, text=True, timeout=30, check=False
        )
    except OSError:
        return "unknown"
    match = re.search(r"(\d+\.\d+\.\d+\S*)", result.stdout)
    return match.group(1) if match else "unknown"


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "analyzer"
    sys_version = ""
    # One repository at a time: graphify is CPU and memory hungry.
    busy = threading.Lock()
    version = "unknown"
    # Tests point clones at a local repository.
    clone_url: str | None = None

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.reply_json(HTTPStatus.OK, {"status": "ok", "graphify": self.version})
        else:
            self.reply_json(HTTPStatus.NOT_FOUND, {"error": {"code": "not_found_route"}})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/analyze":
            self.reply_json(HTTPStatus.NOT_FOUND, {"error": {"code": "not_found_route"}})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self.reply_json(HTTPStatus.BAD_REQUEST, {"error": {"code": "bad_request"}})
            return
        request = parse_request(self.rfile.read(length))
        if not request:
            self.reply_json(HTTPStatus.BAD_REQUEST, {"error": {"code": "bad_request"}})
            return
        if not Handler.busy.acquire(blocking=False):
            self.reply_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": {"code": "busy"}})
            return
        started = time.monotonic()
        try:
            analysis = analyze(request, self.clone_url)
        except AnalysisError as error:
            log(f"{request.owner}/{request.repository}: {error.code}")
            self.reply_json(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                {"error": {"code": error.code, "message": str(error)}},
            )
            return
        except Exception as error:  # noqa: BLE001
            log(f"{request.owner}/{request.repository}: unexpected {type(error).__name__}: {error}")
            self.reply_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": {"code": "internal"}})
            return
        finally:
            Handler.busy.release()
        log(
            f"{request.owner}/{request.repository}@{analysis.commit[:12]}: "
            f"{len(analysis.graph)} bytes in {time.monotonic() - started:.1f}s"
        )
        body = gzip.compress(analysis.graph)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Commit-Sha", analysis.commit)
        self.send_header("X-Branch", analysis.branch)
        self.send_header("X-Graphify-Version", self.version)
        self.end_headers()
        self.wfile.write(body)

    def reply_json(self, status: HTTPStatus, value: object) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        # One line per analysis is logged above; health checks stay quiet.
        pass


def main() -> None:
    host = os.environ.get("ANALYZER_HOST", "0.0.0.0")
    port = int(os.environ.get("ANALYZER_PORT", "8080"))
    Handler.version = graphify_version()
    server = ThreadingHTTPServer((host, port), Handler)
    log(f"analyzer listening on {host}:{port} (graphify {Handler.version})")
    server.serve_forever()


if __name__ == "__main__":
    main()
