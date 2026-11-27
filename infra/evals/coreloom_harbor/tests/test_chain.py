"""The real agent classes driving the real environment class, with only E2B's
``sandbox.commands`` / ``sandbox.files`` faked: the chain Harbor really runs (agent.run ->
exec_as_agent -> environment.exec / exec_with_secret -> _dispatch_command -> envd's
Process/Start), where the other tests check each class against a fake of the other.
"""

from __future__ import annotations

import asyncio
import os

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


from harbor.models.agent.context import AgentContext
from harbor.models.task.config import EnvironmentConfig, NetworkMode, NetworkPolicy
from harbor.models.trial.paths import TrialPaths

from coreloom_harbor.agents import (
    CLAUDE_CODE_VERSION,
    CODEX_VERSION,
    ConventionEvalsClaudeCode,
    ConventionEvalsCodex,
)
from coreloom_harbor.environment import SECRET_FILE, ConventionEvalsE2BEnvironment

CLAUDE_KEY = "sk-ant-api03-" + "QACANARY-chain-claude"
CODEX_KEY = "sk-proj-" + "QACANARY-chain-codex"
CREDENTIAL_NAMES = ("ANTHROPIC_API_KEY", "CODEX_API_KEY", "OPENAI_API_KEY")


class Handle:
    def __init__(self, pid: int, stdout: str) -> None:
        self.pid, self._stdout = pid, stdout
        self.stdout, self.stderr, self.exit_code = stdout, "", 0

    async def wait(self):
        return SimpleNamespace(stdout=self._stdout, stderr="", exit_code=0)

    async def kill(self) -> bool:
        return True


class Commands:
    """envd's Process/Start and Process/SendInput as the install logs them: the command line,
    its envs and what is written to its standard input."""

    def __init__(self, version: str) -> None:
        self.version = version
        self.started: list[dict] = []
        self.stdin: list[tuple[int, str]] = []

    async def run(self, cmd, background=False, envs=None, user=None, cwd=None, timeout=None,
                  stdin=False, **_):
        pid = 200 + len(self.started)
        self.started.append({"cmd": cmd, "envs": dict(envs or {}), "user": user, "stdin": stdin})
        out = ""
        if "--version" in cmd:
            out = self.version
        elif "CODEX_RUNTIME_ID" in cmd:
            out = "\nCODEX_RUNTIME_ID 1000 1000\n"
        return Handle(pid, out)

    async def send_stdin(self, pid: int, data: str) -> None:
        self.stdin.append((pid, data))

    async def close_stdin(self, pid: int) -> None:
        self.stdin.append((pid, "<close>"))


class Files:
    def __init__(self) -> None:
        self.written: list[tuple[str, bytes, object]] = []

    async def write(self, path, data, *_, user=None, **__):
        raw = data if isinstance(data, bytes) else getattr(data, "read", lambda: data)()
        encoded = raw if isinstance(raw, bytes) else str(raw).encode()
        self.written.append((str(path), encoded, user))

    async def make_dir(self, *_, **__):
        return True


class ChainTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "task" / "environment").mkdir(parents=True)
        (root / "task" / "environment" / "Dockerfile").write_text("FROM scratch\n")
        (root / "task" / "workspace").mkdir()
        (root / "trial").mkdir()
        (root / "logs").mkdir()
        self.root = root

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def environment(self, host: str, version: str, persistent_env: dict[str, str]):
        environment = ConventionEvalsE2BEnvironment(
            environment_dir=self.root / "task" / "environment",
            environment_name="task",
            session_id="trial__env",
            trial_paths=TrialPaths(self.root / "trial"),
            task_env_config=EnvironmentConfig(network_mode=NetworkMode.NO_NETWORK),
            network_policy=NetworkPolicy(network_mode=NetworkMode.NO_NETWORK),
            phase_network_policies=[
                NetworkPolicy(network_mode=NetworkMode.ALLOWLIST, allowed_hosts=[host])
            ],
            persistent_env=persistent_env,
            provider_host=host,
            coreloom_run="run-1",
            coreloom_account=7,
        )
        environment._sandbox = SimpleNamespace(
            commands=Commands(version), files=Files(), sandbox_id="fake"
        )
        # What the trial sets for the agent phase (`with_default_user` of the task's [agent] user).
        environment.default_user = "node"
        return environment

    def assert_only_in_its_file(self, environment, key: str, mark: str) -> None:
        commands: Commands = environment._sandbox.commands
        self.assertTrue(commands.started, "the agent started no command")
        for started in commands.started:
            self.assertNotIn(key, started["cmd"])
            self.assertNotIn(key, repr(started["envs"]))
            for name in CREDENTIAL_NAMES:
                self.assertNotIn(name, started["envs"], started["cmd"][:80])
        # Nothing goes to any command's standard input, which envd logs too.
        self.assertEqual([s for s in commands.started if s["stdin"]], [])
        self.assertEqual(commands.stdin, [])
        # The key is in one upload only: its fixed file, as the agent's user.
        files = environment._sandbox.files.written
        with_key = [(path, data, user) for path, data, user in files if key.encode() in data]
        self.assertEqual(with_key, [(SECRET_FILE, f"{key}\n".encode(), "node")])
        reading = [s for s in commands.started if SECRET_FILE in s["cmd"] and mark in s["cmd"]]
        self.assertEqual(len(reading), 1)
        for path, _, _ in files:
            self.assertFalse(path.endswith("auth.json"), path)

    def test_claude_code_chain_hands_the_key_through_its_file_only(self):
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": CLAUDE_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.root / "logs", model_name="anthropic/claude-sonnet-5-5"
            )
            # Harbor's persistent env holding the key too, as when the job sets it on Harbor.
            environment = self.environment(
                "api.anthropic.com",
                f"{CLAUDE_CODE_VERSION} (Claude Code)",
                {"ANTHROPIC_API_KEY": CLAUDE_KEY, "LANG": "C.UTF-8"},
            )
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        self.assert_only_in_its_file(
            environment, CLAUDE_KEY, ConventionEvalsClaudeCode.AGENT_COMMAND_MARK
        )

    def test_codex_chain_hands_the_key_through_its_file_only_and_writes_no_auth_file(self):
        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsCodex(
                logs_dir=self.root / "logs", model_name="openai/gpt-5-codex"
            )
            environment = self.environment(
                "api.openai.com",
                f"codex-cli {CODEX_VERSION}",
                {"CODEX_API_KEY": CODEX_KEY, "LANG": "C.UTF-8"},
            )
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        self.assert_only_in_its_file(environment, CODEX_KEY, "codex exec")


if __name__ == "__main__":
    unittest.main()
