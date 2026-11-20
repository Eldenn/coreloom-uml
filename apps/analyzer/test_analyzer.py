"""Tests of the analyzer: `python3 -m unittest discover -s apps/analyzer`.

Clones go to a local repository made here; graphify is replaced by a small script unless the
real one is installed (then the end-to-end test runs it too).
"""

from __future__ import annotations

import base64
import gzip
import io
import json
import os
import shutil
import stat
import subprocess
import tarfile
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

import analyzer

FAKE_GRAPHIFY = """#!/bin/sh
# Writes a one-node graph, the way graphify lays it out.
if [ "$1" = "--version" ]; then echo "graphify 0.0.0"; exit 0; fi
if [ "$GRAPHIFY_BACKEND" != "none" ]; then echo "backend not off" >&2; exit 3; fi
env | grep -q SECRET && { echo "leaked env" >&2; exit 4; }
mkdir -p graphify-out
echo '{"directed": false, "nodes": [{"id": "a"}], "links": []}' > graphify-out/graph.json
"""


def git(cwd: str, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


class Fixture(unittest.TestCase):
    def setUp(self) -> None:
        self.root = tempfile.mkdtemp(prefix="analyzer-test-")
        self.addCleanup(shutil.rmtree, self.root, True)
        self.origin = os.path.join(self.root, "origin")
        os.makedirs(os.path.join(self.origin, "src"))
        with open(os.path.join(self.origin, "src", "a.py"), "w") as file:
            file.write("def a():\n    return 1\n")
        os.symlink("/etc/passwd", os.path.join(self.origin, "link"))
        os.makedirs(os.path.join(self.origin, "graphify-out", "cache"))
        with open(os.path.join(self.origin, "graphify-out", "graph.json"), "w") as file:
            file.write('{"nodes": [{"id": "stale"}], "links": []}')
        with open(os.path.join(self.origin, analyzer.IGNORE_FILE), "w") as file:
            file.write("docs/\n")
        git(self.origin, "init", "-q", "-b", "main")
        git(self.origin, "add", "-A")
        git(self.origin, "commit", "-q", "-m", "first")
        git(self.origin, "checkout", "-q", "-b", "feature/x")
        git(self.origin, "checkout", "-q", "main")

        fake = os.path.join(self.root, "graphify")
        with open(fake, "w") as file:
            file.write(FAKE_GRAPHIFY)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
        patcher = mock.patch.object(analyzer, "GRAPHIFY", fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def request(self, branch: str | None = None, ignore: str | None = None) -> analyzer.Request:
        return analyzer.Request(owner="acme", repository="shop", branch=branch, ignore=ignore)


class ParseTest(unittest.TestCase):
    def test_repository_urls(self) -> None:
        self.assertEqual(analyzer.parse_repository("https://github.com/acme/shop"), ("acme", "shop"))
        self.assertEqual(analyzer.parse_repository("https://github.com/acme/shop.git"), ("acme", "shop"))
        self.assertEqual(analyzer.parse_repository("https://github.com/acme/shop/"), ("acme", "shop"))
        for bad in [
            "http://github.com/acme/shop",
            "https://gitlab.com/acme/shop",
            "https://github.com.evil.io/acme/shop",
            "https://user:token@github.com/acme/shop",
            "https://github.com/acme/shop/tree/main",
            "https://github.com/acme/..",
            "https://github.com/-acme/shop",
            "file:///etc",
            "--upload-pack=x",
            42,
        ]:
            self.assertIsNone(analyzer.parse_repository(bad), bad)

    def test_branches(self) -> None:
        for good in ["main", "feature/x", "release-1.2", "v1.0_rc"]:
            self.assertTrue(analyzer.valid_branch(good), good)
        for bad in ["main\n", "-x", "--upload-pack=x", "a..b", "a//b", "/a", "a/", "a.lock", ".a", "a b", "a~1", "a:b"]:
            self.assertFalse(analyzer.valid_branch(bad), bad)

    def test_requests(self) -> None:
        ok = analyzer.parse_request(b'{"repository": "https://github.com/acme/shop", "branch": "dev"}')
        self.assertEqual(ok, analyzer.Request("acme", "shop", "dev", None))
        self.assertEqual(ok.clone_url, "https://github.com/acme/shop.git")
        self.assertIsNone(analyzer.parse_request(b"not json"))
        self.assertIsNone(analyzer.parse_request(b'{"repository": "https://github.com/acme/shop", "branch": "-x"}'))
        self.assertIsNone(
            analyzer.parse_request(
                json.dumps({"repository": "https://github.com/acme/shop", "ignore": "x" * 20_000}).encode()
            )
        )

    def test_tokens(self) -> None:
        token = "ghs_" + "a1B2" * 9
        ok = analyzer.parse_request(
            json.dumps({"repository": "https://github.com/acme/shop", "token": token}).encode()
        )
        self.assertIsNotNone(ok)
        self.assertEqual(ok.token, token)
        self.assertNotIn(token, repr(ok))
        for bad in ["short", "ghs_" + "a" * 30 + " x", "ghs_" + "a" * 30 + "\n", 42, "x" * 300]:
            self.assertIsNone(
                analyzer.parse_request(
                    json.dumps({"repository": "https://github.com/acme/shop", "token": bad}).encode()
                ),
                bad,
            )


class AnalyzeTest(Fixture):
    def test_maps_the_default_branch(self) -> None:
        with mock.patch.dict(os.environ, {"SECRET_TOKEN": "nope"}):
            result = analyzer.analyze(self.request(ignore="build/\n"), clone_url=self.origin)
        self.assertEqual(json.loads(result.graph)["nodes"], [{"id": "a"}])
        self.assertEqual(result.branch, "main")
        self.assertRegex(result.commit, r"^[0-9a-f]{40}$")

    def test_a_token_reaches_git_through_its_environment_only(self) -> None:
        token = "ghs_" + "Z9" * 18
        seen: dict[str, object] = {}
        real_run = analyzer.run_bounded

        def spy(args, *, cwd, env, deadline, **limits):  # type: ignore[no-untyped-def]
            if "clone" in args:
                seen["args"] = list(args)
                seen["env"] = dict(env)
            return real_run(args, cwd=cwd, env=env, deadline=deadline, **limits)

        request = analyzer.Request("acme", "shop", None, None, token=token)
        with mock.patch.object(analyzer, "run_bounded", spy):
            result = analyzer.analyze(request, clone_url=self.origin)
        self.assertEqual(result.branch, "main")
        self.assertNotIn(token, " ".join(seen["args"]))  # type: ignore[arg-type]
        env = seen["env"]
        self.assertEqual(env["GIT_CONFIG_KEY_0"], "http.https://github.com/.extraheader")  # type: ignore[index]
        header = env["GIT_CONFIG_VALUE_0"]  # type: ignore[index]
        basic = header.removeprefix("Authorization: Basic ")
        self.assertEqual(base64.b64decode(basic).decode(), f"x-access-token:{token}")

    def test_no_token_no_header(self) -> None:
        self.assertEqual(analyzer.token_config(None), {})

    def test_maps_a_named_branch(self) -> None:
        result = analyzer.analyze(self.request(branch="feature/x"), clone_url=self.origin)
        self.assertEqual(result.branch, "feature/x")

    def test_unknown_branch_reads_as_not_found(self) -> None:
        with self.assertRaises(analyzer.AnalysisError) as caught:
            analyzer.analyze(self.request(branch="nope"), clone_url=self.origin)
        self.assertEqual(caught.exception.code, "not_found")

    def test_symlinks_are_checked_out_as_files(self) -> None:
        seen: dict[str, bool] = {}
        real_extract = analyzer.extract

        def spy(repo: str, work: str, deadline: float, ignore: str | None) -> bytes:
            seen["link"] = os.path.islink(os.path.join(repo, "link"))
            seen["git"] = os.path.exists(os.path.join(repo, ".git"))
            seen["graphify-out"] = os.path.exists(os.path.join(repo, "graphify-out"))
            with open(os.path.join(repo, analyzer.IGNORE_FILE)) as file:
                seen["ignore"] = file.read()
            return real_extract(repo, work, deadline, ignore)

        with mock.patch.object(analyzer, "extract", spy):
            analyzer.analyze(self.request(ignore="dist/\n"), clone_url=self.origin)
        self.assertEqual(seen, {"link": False, "git": False, "graphify-out": False, "ignore": "docs/\n"})

    def test_file_limit(self) -> None:
        with mock.patch.object(analyzer, "MAX_FILES", 1):
            with self.assertRaises(analyzer.AnalysisError) as caught:
                analyzer.analyze(self.request(), clone_url=self.origin)
        self.assertEqual(caught.exception.code, "too_many_files")

    def test_size_limit(self) -> None:
        with mock.patch.object(analyzer, "MAX_REPOSITORY_BYTES", 10):
            with self.assertRaises(analyzer.AnalysisError) as caught:
                analyzer.analyze(self.request(), clone_url=self.origin)
        self.assertEqual(caught.exception.code, "too_large")

    def test_time_limit(self) -> None:
        with mock.patch.object(analyzer, "TIMEOUT_SECONDS", 0):
            with self.assertRaises(analyzer.AnalysisError) as caught:
                analyzer.analyze(self.request(), clone_url=self.origin)
        self.assertEqual(caught.exception.code, "timeout")

    def test_the_work_folder_is_deleted(self) -> None:
        before = set(os.listdir(tempfile.gettempdir()))
        analyzer.analyze(self.request(), clone_url=self.origin)
        after = {name for name in os.listdir(tempfile.gettempdir()) if name.startswith("analysis-")}
        self.assertEqual(after - before, set())


class ServerTest(Fixture):
    def setUp(self) -> None:
        super().setUp()
        handler = type("TestHandler", (analyzer.Handler,), {"clone_url": self.origin})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def post(self, body: object) -> tuple[int, dict[str, str], bytes]:
        request = urllib.request.Request(
            f"{self.base}/analyze",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def test_answers_the_gzipped_graph(self) -> None:
        status, headers, body = self.post({"repository": "https://github.com/acme/shop"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/gzip")
        self.assertEqual(headers["X-Branch"], "main")
        self.assertRegex(headers["X-Commit-Sha"], r"^[0-9a-f]{40}$")
        self.assertEqual(json.loads(gzip.decompress(body))["nodes"], [{"id": "a"}])

    def test_refuses_other_hosts(self) -> None:
        status, _, body = self.post({"repository": "https://gitlab.com/acme/shop"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"]["code"], "bad_request")

    def test_reports_a_missing_branch(self) -> None:
        status, _, body = self.post({"repository": "https://github.com/acme/shop", "branch": "nope"})
        self.assertEqual(status, 422)
        self.assertEqual(json.loads(body)["error"]["code"], "not_found")

    def test_one_analysis_at_a_time(self) -> None:
        analyzer.Handler.busy.acquire()
        try:
            status, _, body = self.post({"repository": "https://github.com/acme/shop"})
        finally:
            analyzer.Handler.busy.release()
        self.assertEqual(status, 503)
        self.assertEqual(json.loads(body)["error"]["code"], "busy")

    def test_archives_the_regular_files(self) -> None:
        request = urllib.request.Request(
            f"{self.base}/archive",
            data=json.dumps({"repository": "https://github.com/acme/shop"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.headers["Content-Type"], "application/gzip")
            self.assertRegex(response.headers["X-Commit-Sha"], r"^[0-9a-f]{40}$")
            self.assertEqual(response.headers["X-Branch"], "main")
            body = response.read()
        with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tar:
            members = {member.name: member for member in tar.getmembers()}
            self.assertIn("src/a.py", members)
            self.assertFalse(any(name.startswith(".git/") or name == ".git" for name in members))
            self.assertTrue(all(member.isreg() for member in members.values()))
            self.assertTrue(all(member.mode == 0o644 for member in members.values()))
            # The symlink was checked out as a file holding its target, never followed.
            link = tar.extractfile(members["link"])
            self.assertEqual(link.read() if link else b"", b"/etc/passwd")

    def test_an_archive_is_refused_past_its_limits(self) -> None:
        with mock.patch.object(analyzer, "ARCHIVE_MAX_FILES", 1):
            with self.assertRaises(analyzer.AnalysisError) as raised:
                analyzer.archive(self.request(), clone_url=self.origin)
        self.assertEqual(raised.exception.code, "too_many_files")
        with mock.patch.object(analyzer, "ARCHIVE_MAX_BYTES", 10):
            with self.assertRaises(analyzer.AnalysisError) as raised:
                analyzer.archive(self.request(), clone_url=self.origin)
        self.assertEqual(raised.exception.code, "too_large")

    def test_an_archive_does_not_wait_for_an_analysis(self) -> None:
        analyzer.Handler.busy.acquire()
        try:
            request = urllib.request.Request(
                f"{self.base}/archive",
                data=json.dumps({"repository": "https://github.com/acme/shop"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
        finally:
            analyzer.Handler.busy.release()

    def test_health(self) -> None:
        with urllib.request.urlopen(f"{self.base}/health") as response:
            self.assertEqual(json.loads(response.read())["status"], "ok")


@unittest.skipUnless(shutil.which("graphify"), "graphify is not installed")
class GraphifyTest(Fixture):
    def test_real_graphify_reads_the_clone(self) -> None:
        with mock.patch.object(analyzer, "GRAPHIFY", shutil.which("graphify")):
            result = analyzer.analyze(self.request(), clone_url=self.origin)
        graph = json.loads(result.graph)
        self.assertTrue(any(node.get("source_file", "").endswith("a.py") for node in graph["nodes"]))


if __name__ == "__main__":
    unittest.main()
