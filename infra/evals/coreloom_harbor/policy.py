"""The rules our environment class enforces, as pure functions the tests read directly."""

from __future__ import annotations

import re
from collections.abc import Mapping

#: Every egress range a trial's agent phase is denied besides all other traffic: the API's
#: ``RESEARCH_DENIED_RANGES`` (apps/api/app/research/constants/research.ts, a test keeps both
#: equal), the link-local range of the metadata services and the install's log collector
#: (192.0.2.1, decision record section 13).
RESEARCH_DENIED_RANGES = (
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "100.64.0.0/10",
)
EXTRA_DENIED_RANGES = ("169.254.0.0/16", "192.0.2.0/24")
ALL_TRAFFIC = "0.0.0.0/0"
DENIED_RANGES = tuple(dict.fromkeys((*RESEARCH_DENIED_RANGES, *EXTRA_DENIED_RANGES)))
AGENT_PHASE_DENY_OUT = (ALL_TRAFFIC, *DENIED_RANGES)

#: Sandbox timeouts of a trial (decision record section 7), in seconds.
SANDBOX_TIMEOUT_SEC = 300
RENEW_INTERVAL_SEC = 60

#: Metadata every sandbox of a convention eval carries, for the sweep and the run's cleanup.
PURPOSE = "convention-evals"

#: Variable names that hold a credential, whatever Harbor's own heuristics say: never a startup
#: env of a sandbox. The caller sets one of the first group on Harbor's process; the agent classes
#: hand it to the agent's command only.
CREDENTIAL_NAMES = frozenset(
    {
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "CODEX_AUTH_JSON_PATH",
        "CODEX_FORCE_AUTH_JSON",
        "E2B_API_KEY",
        "E2B_ACCESS_TOKEN",
        "GITHUB_TOKEN",
        "GH_TOKEN",
    }
)
_SENSITIVE_NAME = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)", re.IGNORECASE)


class PolicyViolation(RuntimeError):
    """A network policy other than the one a phase of a trial may have: the trial fails."""


def is_credential_name(name: str) -> bool:
    return name.upper() in CREDENTIAL_NAMES or bool(_SENSITIVE_NAME.search(name))


def drop_credentials(env: Mapping[str, str]) -> dict[str, str]:
    """``env`` without any variable whose name holds or may hold a credential."""
    return {name: value for name, value in env.items() if not is_credential_name(name)}


#: Exit code of a command whose credential did not arrive on its standard input.
NO_SECRET_EXIT = 97


def stdin_secret_command(name: str, command: str) -> str:
    """``command`` preceded by the fixed line that reads the credential ``name`` from standard
    input into that process's own environment (record section 5, g).

    envd logs every command it starts with its ``envs`` in full, into the install's logs, whatever
    the sandbox's network: a credential is never in ``envs`` nor on a command line. What a command
    reads on its standard input is not logged. Standard input is then the empty file, so nothing
    the agent starts can read the key from it again.
    """
    if name not in CREDENTIAL_NAMES:
        raise ValueError(f"{name} is not a credential variable")
    return (
        f"IFS= read -r {name} || exit {NO_SECRET_EXIT}; "
        f'[ -n "${name}" ] || exit {NO_SECRET_EXIT}; '
        f"export {name}; exec 0</dev/null; {command}"
    )


def stdin_secret_line(secret: str) -> str:
    """What is sent on the command's standard input: the value and a newline, refused when it
    would not read back as one line."""
    if not secret or any(character in secret for character in "\r\n\0"):
        raise ValueError("a credential is one non-empty line")
    return f"{secret}\n"


def agent_phase_update(allowed_hosts: list[str], provider_host: str) -> dict[str, list[str]]:
    """The E2B network update of the agent phase, refusing any allowlist but the provider's host.

    Harbor adds the agent's inference host to the task's allowlist by itself, and a task or a
    run's options could widen it (record section 5, e): the final list must be exactly
    ``[provider_host]``.
    """
    if list(allowed_hosts) != [provider_host]:
        raise PolicyViolation(
            f"the agent phase may reach {provider_host} only, not {sorted(allowed_hosts)}"
        )
    return {"allow_out": [provider_host], "deny_out": list(AGENT_PHASE_DENY_OUT)}


#: The update of every phase without network (setup, after the agent, the verifier).
NO_NETWORK_UPDATE = {"allow_internet_access": False, "deny_out": [ALL_TRAFFIC]}


def check_agent_phase_info(network: Mapping[str, object] | None, provider_host: str) -> None:
    """Checks the network E2B reports for the sandbox once the agent phase's update is applied."""
    if not network:
        raise PolicyViolation("E2B reported no network configuration for the sandbox")
    allow_out = list(network.get("allow_out") or [])  # type: ignore[arg-type]
    deny_out = set(network.get("deny_out") or [])  # type: ignore[arg-type]
    if allow_out != [provider_host]:
        raise PolicyViolation(f"E2B allows {allow_out}, not [{provider_host}] only")
    missing = set(AGENT_PHASE_DENY_OUT) - deny_out
    if missing:
        raise PolicyViolation(f"E2B does not deny {sorted(missing)}")
