"""The agents of path I (record section 8): Claude Code and Codex, each the real CLI the
template holds at its pinned version, the user's key passed to the agent's command only."""

from __future__ import annotations

import shlex
from typing import Any, override

from harbor.agents.installed.base import with_prompt_template
from harbor.agents.installed.claude_code import ClaudeCode
from harbor.agents.installed.codex import Codex
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

#: The CLI versions the templates hold (packages/catalog/evals/src/versions.ts, a test keeps
#: them equal).
CLAUDE_CODE_VERSION = "2.1.322"
CODEX_VERSION = "0.167.2"

#: Credential variables Claude Code would also read: never handed to it.
_CLAUDE_OTHER_AUTH = frozenset(
    {
        "ANTHROPIC_AUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_USE_BEDROCK",
        "AWS_BEARER_TOKEN_BEDROCK",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_PROFILE",
    }
)


class TemplateMismatch(RuntimeError):
    """The sandbox's CLI is not the pinned one: nothing is installed from the network."""


def _pin(agent: Any, version: str) -> None:
    if agent._version not in (None, version):
        raise ValueError(f"{agent.name()} runs at {version} only, not {agent._version}")
    agent._version = version


async def _check_installed(agent: Any, environment: BaseEnvironment) -> None:
    if not await agent.is_requested_version_installed(environment):
        raise TemplateMismatch(f"the template does not hold {agent.name()} {agent._version}")


class ConventionEvalsClaudeCode(ClaudeCode):
    """Harbor's Claude Code with the template's CLI only, no auth but the API key, and no
    nonessential traffic. The key reaches the agent's command as an environment variable of
    that command (Harbor's per-exec env), never a file."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        _pin(self, CLAUDE_CODE_VERSION)
        # Merged last into the command's environment, whatever Harbor's own run sets.
        self._resolved_env_vars["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _check_installed(self, environment)

    @override
    def _resolve_auth_env(self) -> dict[str, str]:
        env = super()._resolve_auth_env()
        if not env.get("ANTHROPIC_API_KEY"):
            raise ValueError("Claude Code runs with an Anthropic API key only")
        return {
            name: value
            for name, value in env.items()
            if name not in _CLAUDE_OTHER_AUTH and not name.startswith("AWS_")
        }


class ConventionEvalsCodex(Codex):
    """Codex running ``codex exec`` with ``CODEX_API_KEY`` in that command's environment only:
    unlike Harbor's own class it writes no ``auth.json`` (record section 5, c), and it lists
    ``$CODEX_HOME`` into its logs before removing it, so each trial shows there was none."""

    #: What the agent's logs hold of ``$CODEX_HOME`` once Codex is done.
    CODEX_HOME_LISTING = "codex-home.txt"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        _pin(self, CODEX_VERSION)

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await _check_installed(self, environment)

    @override
    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        if not self.model_name:
            raise ValueError("Model name is required")
        model = self._resolved_model_name()
        key = self.model_connection.api_key
        if not key:
            raise ValueError("Codex runs with an OpenAI API key only")

        home = self._REMOTE_CODEX_HOME.as_posix()
        logs = self.environment_logs_dir.as_posix()
        # The key in no variable but CODEX_API_KEY, which `codex exec` reads, of one command.
        base_env = {"CODEX_HOME": home, "OPENAI_API_KEY": "", "CODEX_API_KEY": ""}
        run_env = {**base_env, "CODEX_API_KEY": key}

        await self._ensure_agent_owned_dir(environment, self._REMOTE_CODEX_HOME)
        await self.exec_as_agent(
            environment,
            command=f'mkdir -p "$CODEX_HOME" {shlex.quote(logs)}',
            env=base_env,
        )
        await self._upload_effective_config(
            environment,
            self._build_effective_config(None),
            f"{home}/config.toml",
        )
        cli_flags = self.build_cli_flags()
        try:
            await self.exec_as_agent(
                environment,
                command=(
                    "codex exec "
                    "--dangerously-bypass-approvals-and-sandbox "
                    "--skip-git-repo-check "
                    f"--model {shlex.quote(model)} "
                    "--json "
                    "--enable unified_exec "
                    f"{cli_flags + ' ' if cli_flags else ''}"
                    f"-- {shlex.quote(instruction)} "
                    f"2>&1 </dev/null | tee {shlex.quote(logs + '/' + self._OUTPUT_FILENAME)}"
                ),
                env=run_env,
            )
        finally:
            await self._collect_and_clean(environment, base_env, home, logs)

    async def _collect_and_clean(
        self, environment: BaseEnvironment, env: dict[str, str], home: str, logs: str
    ) -> None:
        quoted_home, quoted_logs = shlex.quote(home), shlex.quote(logs)
        try:
            await self.exec_as_agent(
                environment,
                command=(
                    f"ls -la {quoted_home} > {quoted_logs}/{self.CODEX_HOME_LISTING} 2>&1; "
                    f"if [ -d {quoted_home}/sessions ]; then "
                    f"rm -rf {quoted_logs}/sessions && cp -R {quoted_home}/sessions {quoted_logs}/sessions; "
                    "fi"
                ),
                env=env,
                timeout_sec=30,
            )
        except Exception:
            pass
        try:
            await self.exec_as_root(
                environment, command=f"rm -rf {quoted_home}", timeout_sec=30
            )
        except Exception:
            pass
