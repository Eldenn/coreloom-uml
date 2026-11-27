"""Fixes c and the pinned CLIs of our agent classes, with the sandbox's commands faked."""

from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from harbor.environments.base import ExecResult
from harbor.models.agent.context import AgentContext

from coreloom_harbor.agents import (
    CLAUDE_CODE_VERSION,
    CODEX_VERSION,
    ConventionEvalsClaudeCode,
    ConventionEvalsCodex,
    TemplateMismatch,
)

CODEX_KEY = "sk-proj-CANARYFAKE-agents-test"
CLAUDE_KEY = "sk-ant-api03-CANARYFAKE-agents-test"


class FakeEnvironment:
    """What the agents call on an environment: every command and file is recorded."""

    def __init__(self, version_output: str) -> None:
        self.default_user = "node"
        self.version_output = version_output
        self.commands: list[tuple[str, dict[str, str] | None, object]] = []
        self.uploads: list[tuple[str, str]] = []

    async def exec(self, command, cwd=None, env=None, timeout_sec=None, user=None):
        self.commands.append((command, env, user))
        if "--version" in command:
            return ExecResult(stdout=self.version_output, stderr="", return_code=0)
        if "CODEX_RUNTIME_ID" in command:
            return ExecResult(stdout="\nCODEX_RUNTIME_ID 1000 1000\n", stderr="", return_code=0)
        return ExecResult(stdout="", stderr="", return_code=0)

    async def upload_file(self, source_path, target_path):
        self.uploads.append((str(target_path), Path(source_path).read_text()))


class AgentsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.logs = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def codex(self, **kwargs):
        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsCodex(
                logs_dir=self.logs, model_name="openai/gpt-5-codex", **kwargs
            )
            _ = agent.model_connection
        return agent

    def test_codex_passes_the_key_to_codex_exec_only_and_writes_no_auth_file(self):  # fix c
        agent = self.codex()
        environment = FakeEnvironment(f"codex-cli {CODEX_VERSION}")
        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        with_key = [c for c in environment.commands if CODEX_KEY in repr(c[1])]
        self.assertEqual(len(with_key), 1)
        command, env, _ = with_key[0]
        self.assertTrue(command.split("set -o pipefail; ", 1)[1].startswith("codex exec"))
        self.assertEqual(env["CODEX_API_KEY"], CODEX_KEY)
        self.assertEqual(env["OPENAI_API_KEY"], "")
        for command, _, _ in environment.commands:
            self.assertNotIn(CODEX_KEY, command)
            self.assertNotIn("auth.json", command)
        for target, content in environment.uploads:
            self.assertNotIn("auth.json", target)
            self.assertNotIn(CODEX_KEY, content)
        self.assertTrue(any("codex-home.txt" in c[0] for c in environment.commands))

    def test_codex_refuses_another_version_and_never_installs(self):
        with self.assertRaises(ValueError):
            self.codex(version="0.1.0")
        agent = self.codex()
        self.assertEqual(agent.version(), CODEX_VERSION)
        with self.assertRaises(TemplateMismatch):
            asyncio.run(agent.install(FakeEnvironment("codex-cli 0.1.0")))
        asyncio.run(agent.install(FakeEnvironment(f"codex-cli {CODEX_VERSION}")))

    def claude(self, extra_env: dict[str, str]):
        with mock.patch.dict(os.environ, {**extra_env, "HOME": self.tmp.name}, clear=False):
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.logs, model_name="anthropic/claude-sonnet-5-5"
            )
            return agent, agent._resolve_auth_env()

    def test_claude_code_gets_the_api_key_and_no_other_credential(self):
        agent, env = self.claude(
            {"ANTHROPIC_API_KEY": CLAUDE_KEY, "CLAUDE_CODE_OAUTH_TOKEN": "oauth-CANARYFAKE"}
        )
        self.assertEqual(env["ANTHROPIC_API_KEY"], CLAUDE_KEY)
        self.assertNotIn("CLAUDE_CODE_OAUTH_TOKEN", env)
        self.assertNotIn("ANTHROPIC_AUTH_TOKEN", env)
        self.assertEqual(agent.version(), CLAUDE_CODE_VERSION)
        self.assertEqual(
            agent._resolved_env_vars["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"], "1"
        )

    def test_claude_code_runs_with_no_auth_file_and_the_key_per_command(self):
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": CLAUDE_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.logs, model_name="anthropic/claude-sonnet-5-5"
            )
            environment = FakeEnvironment(f"{CLAUDE_CODE_VERSION} (Claude Code)")
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        for command, env, _ in environment.commands:
            self.assertNotIn(CLAUDE_KEY, command)
            self.assertNotIn("credentials", command)
        claude_runs = [c for c in environment.commands if "claude --verbose" in c[0]]
        self.assertEqual(len(claude_runs), 1)
        env = claude_runs[0][1]
        self.assertEqual(env["ANTHROPIC_API_KEY"], CLAUDE_KEY)
        self.assertEqual(env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"], "1")
        self.assertEqual(environment.uploads, [])

    def test_claude_code_refuses_to_run_without_an_api_key(self):
        with mock.patch.dict(os.environ, {"HOME": self.tmp.name}):
            os.environ.pop("ANTHROPIC_API_KEY", None)
            os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.logs, model_name="anthropic/claude-sonnet-5-5"
            )
            with self.assertRaises(ValueError):
                agent._resolve_auth_env()


if __name__ == "__main__":
    unittest.main()
