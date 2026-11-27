"""Fixes c and g and the pinned CLIs of our agent classes, with the sandbox's commands faked."""

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

# Made-up values the providers would refuse; built in two parts so no scanner mistakes them.
CODEX_KEY = "sk-proj-" + "CANARYFAKE-unit-codex"
CLAUDE_KEY = "sk-ant-api03-" + "CANARYFAKE-unit-claude"


class FakeEnvironment:
    """What the agents call on our environment: every command, its envs and the secret handed
    to it through ``exec_with_secret`` are recorded."""

    def __init__(self, version_output: str) -> None:
        self.default_user = "node"
        self.version_output = version_output
        # (command, envs, user, (secret name, secret) or None)
        self.commands: list[tuple[str, dict[str, str] | None, object, tuple[str, str] | None]] = []
        self.uploads: list[tuple[str, str]] = []

    def _answer(self, command: str) -> ExecResult:
        if "--version" in command:
            return ExecResult(stdout=self.version_output, stderr="", return_code=0)
        if "CODEX_RUNTIME_ID" in command:
            return ExecResult(stdout="\nCODEX_RUNTIME_ID 1000 1000\n", stderr="", return_code=0)
        return ExecResult(stdout="", stderr="", return_code=0)

    async def exec(self, command, cwd=None, env=None, timeout_sec=None, user=None):
        self.commands.append((command, env, user, None))
        return self._answer(command)

    async def exec_with_secret(
        self, command, *, secret_name, secret, cwd=None, env=None, timeout_sec=None, user=None
    ):
        self.commands.append((command, env, user, (secret_name, secret)))
        return self._answer(command)

    async def upload_file(self, source_path, target_path):
        self.uploads.append((str(target_path), Path(source_path).read_text()))


class AgentsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.logs = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def assert_key_to_agent_command_only(self, environment: FakeEnvironment, key: str, mark: str):
        """Fix g: the key is in no command line and no command's envs; it is handed to the
        agent's own command through ``exec_with_secret`` (a file), and to that command only."""
        for command, env, _, _ in environment.commands:
            self.assertNotIn(key, command)
            self.assertNotIn(key, repr(env))
            for name in ("ANTHROPIC_API_KEY", "CODEX_API_KEY", "OPENAI_API_KEY"):
                self.assertNotIn(name, env or {})
        with_secret = [c for c in environment.commands if c[3] is not None]
        self.assertEqual(len(with_secret), 1)
        command, _, _, (_, secret) = with_secret[0]
        self.assertEqual(secret, key)
        self.assertIn(mark, command)
        return with_secret[0]

    def codex(self, **kwargs):
        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsCodex(
                logs_dir=self.logs, model_name="openai/gpt-5-codex", **kwargs
            )
            _ = agent.model_connection
        return agent

    def test_codex_gets_its_key_through_its_file_and_writes_no_auth_file(self):  # fixes c and g
        agent = self.codex()
        environment = FakeEnvironment(f"codex-cli {CODEX_VERSION}")
        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        command, _, _, (name, _) = self.assert_key_to_agent_command_only(
            environment, CODEX_KEY, "codex exec"
        )
        self.assertEqual(name, "CODEX_API_KEY")
        self.assertIn("unset OPENAI_API_KEY; codex exec", command)
        for command, _, _, _ in environment.commands:
            self.assertNotIn("auth.json", command)
        for target, content in environment.uploads:
            self.assertNotIn("auth.json", target)
            self.assertNotIn(CODEX_KEY, content)
        self.assertTrue(any("codex-home.txt" in c[0] for c in environment.commands))
        (config,) = [text for target, text in environment.uploads if target.endswith("config.toml")]
        self.assertIn("[shell_environment_policy]", config)  # security I4
        self.assertIn("\"*KEY*\"", config)

    def test_codex_refuses_another_version_and_never_installs(self):
        with self.assertRaises(ValueError):
            self.codex(version="0.1.0")
        agent = self.codex()
        self.assertEqual(agent.version(), CODEX_VERSION)
        with self.assertRaises(TemplateMismatch):
            asyncio.run(agent.install(FakeEnvironment("codex-cli 0.1.0")))
        asyncio.run(agent.install(FakeEnvironment(f"codex-cli {CODEX_VERSION}")))

    def test_codex_runs_in_our_environment_only(self):
        agent = self.codex()

        class HarborsOwn(FakeEnvironment):
            exec_with_secret = None  # type: ignore[assignment]

        with mock.patch.dict(os.environ, {"CODEX_API_KEY": CODEX_KEY, "HOME": self.tmp.name}):
            with self.assertRaises(TypeError):
                asyncio.run(
                    agent.run("Fix the bug.", HarborsOwn(f"codex-cli {CODEX_VERSION}"), AgentContext())
                )

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

    def test_claude_code_gets_its_key_through_its_file_and_no_auth_file(self):  # fix g
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": CLAUDE_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.logs, model_name="anthropic/claude-sonnet-5-5"
            )
            environment = FakeEnvironment(f"{CLAUDE_CODE_VERSION} (Claude Code)")
            asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        command, env, _, (name, _) = self.assert_key_to_agent_command_only(
            environment, CLAUDE_KEY, ConventionEvalsClaudeCode.AGENT_COMMAND_MARK
        )
        self.assertEqual(name, "ANTHROPIC_API_KEY")
        # Harbor's other variables may stay envs of the command.
        self.assertEqual(env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"], "1")
        self.assertNotIn("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB", env)  # needs bubblewrap: not set
        self.assertEqual(env["ANTHROPIC_MODEL"], "claude-sonnet-5-5")
        for command, _, _, _ in environment.commands:
            self.assertNotIn("credentials", command)
        self.assertEqual(environment.uploads, [])

    def test_claude_code_fails_when_harbor_starts_it_another_way(self):
        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": CLAUDE_KEY, "HOME": self.tmp.name}):
            agent = ConventionEvalsClaudeCode(
                logs_dir=self.logs, model_name="anthropic/claude-sonnet-5-5"
            )
            environment = FakeEnvironment(f"{CLAUDE_CODE_VERSION} (Claude Code)")
            with mock.patch.object(ConventionEvalsClaudeCode, "AGENT_COMMAND_MARK", "no-such"):
                with self.assertRaises(TemplateMismatch):
                    asyncio.run(agent.run("Fix the bug.", environment, AgentContext()))
        for _, env, _, secret in environment.commands:
            self.assertIsNone(secret)
            self.assertNotIn(CLAUDE_KEY, repr(env))

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
