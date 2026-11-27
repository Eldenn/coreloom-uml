"""Harbor's E2B environment with the fixes of the convention evals (record section 5, a e f)."""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import Any, override

from pydantic import Field, model_validator
from tenacity import RetryCallState, retry, retry_if_exception

import harbor.environments.e2b as harbor_e2b
from harbor.environments.e2b import E2BEnvironment, E2BOptions
from harbor.models.task.config import NetworkMode, NetworkPolicy

from coreloom_harbor.policy import (
    NO_NETWORK_UPDATE,
    PURPOSE,
    RENEW_INTERVAL_SEC,
    SANDBOX_TIMEOUT_SEC,
    PolicyViolation,
    agent_phase_update,
    check_agent_phase_info,
    drop_credentials,
)

#: Where the exporter puts the fixture in a task folder, and where it goes in the sandbox
#: (packages/catalog/evals/src/harbor/constants.ts).
TASK_WORKSPACE_DIR = "workspace"
SANDBOX_WORK_DIR = "/work"
#: The template's user the agent runs as; it owns the fixture.
AGENT_USER = "node"
_UPLOAD_TIMEOUT_SEC = 120
#: Creations a node refuses for lack of room (memory) are tried again, this many times at most.
_OUT_OF_ROOM_ATTEMPTS = 10


def _is_out_of_room(exc: BaseException) -> bool:
    """E2B's 500 when no node can hold the sandbox now (its memory taken by other sandboxes):
    nothing was created, and room frees up as other trials end."""
    return (
        isinstance(exc, harbor_e2b.SandboxException)
        and getattr(exc, "status_code", None) == 500
        and "Failed to place sandbox" in str(exc)
    )


def _stop_create(retry_state: RetryCallState) -> bool:
    error = retry_state.outcome.exception() if retry_state.outcome else None
    if error is not None and _is_out_of_room(error):
        return retry_state.attempt_number >= _OUT_OF_ROOM_ATTEMPTS
    return harbor_e2b._stop_create(retry_state)


def _wait_create(retry_state: RetryCallState) -> float:
    error = retry_state.outcome.exception() if retry_state.outcome else None
    if error is not None and _is_out_of_room(error):
        return harbor_e2b._WAIT_FOR_CAPACITY(retry_state)
    return harbor_e2b._wait_create(retry_state)


class ConventionEvalsOptions(E2BOptions):
    provider_host: str = Field(description="The only host the agent phase may reach.")
    coreloom_run: str = Field(description="Sandbox metadata coreloom.run: the run's id.")
    coreloom_account: int = Field(description="Sandbox metadata coreloom.account.")
    sandbox_timeout_sec: int = SANDBOX_TIMEOUT_SEC
    renew_interval_sec: float = RENEW_INTERVAL_SEC

    @model_validator(mode="after")
    def fixed_timeouts(self) -> ConventionEvalsOptions:
        if self.sandbox_timeout_sec != SANDBOX_TIMEOUT_SEC:
            raise ValueError(f"sandbox_timeout_sec must be {SANDBOX_TIMEOUT_SEC}")
        if self.renew_interval_sec != RENEW_INTERVAL_SEC:
            raise ValueError(f"renew_interval_sec must be {RENEW_INTERVAL_SEC}")
        if self.prebuilt_template_id is not None:
            raise ValueError("a trial starts from the task's own template only")
        return self


class ConventionEvalsE2BEnvironment(E2BEnvironment):
    """One sandbox per trial: no credential at startup, our metadata, the network of each phase
    checked (none for setup and the verifier, the provider's host only for the agent), and the
    task's fixture uploaded once the sandbox is up."""

    options_model = ConventionEvalsOptions
    options: ConventionEvalsOptions

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Every phase this trial may switch to is checked before anything starts.
        for policy in (self.network_policy, *self._phase_network_policies):
            self._network_update(policy)
        if self.network_policy.network_mode != NetworkMode.NO_NETWORK:
            raise PolicyViolation("setup must have no network")

    @property
    def provider_host(self) -> str:
        return self.options.provider_host

    def metadata(self) -> dict[str, str]:
        """Our keys, added to Harbor's own (``harbor.job_id``, ``harbor.trial_name``)."""
        return {
            "coreloom.purpose": PURPOSE,
            "coreloom.run": self.options.coreloom_run,
            "coreloom.account": str(self.options.coreloom_account),
        }

    @override
    def _startup_env(self) -> dict[str, str]:
        # Fix a: a key in the task's env or Harbor's persistent env would become a startup env
        # of the sandbox, readable by every process in it.
        return drop_credentials(super()._startup_env())

    def _network_update(self, policy: NetworkPolicy) -> dict[str, Any]:
        if policy.network_mode == NetworkMode.NO_NETWORK:
            return dict(NO_NETWORK_UPDATE)
        if policy.network_mode == NetworkMode.ALLOWLIST:
            # Fix e: whatever Harbor added, the provider's host only.
            return agent_phase_update(list(policy.allowed_hosts), self.provider_host)
        raise PolicyViolation("no phase of a trial may have public network access")

    @override
    def _sandbox_network_update(self, network_policy: NetworkPolicy | None = None) -> Any:
        return self._network_update(network_policy or self.network_policy)

    @override
    def _sandbox_create_network_options(
        self, network_policy: NetworkPolicy | None = None
    ) -> Any:
        if (network_policy or self.network_policy).network_mode != NetworkMode.NO_NETWORK:
            raise PolicyViolation("a trial's sandbox starts with no network")
        return None

    @retry(
        retry=retry_if_exception(
            lambda exc: harbor_e2b._is_transient_create_error(exc) or _is_out_of_room(exc)
        ),
        stop=_stop_create,
        wait=_wait_create,
        before_sleep=harbor_e2b._log_create_retry,
        reraise=True,
    )
    @override
    async def _create_sandbox(self):
        # Harbor's own creation (environments/e2b.py, 0.27.0), with our metadata (fix f) and no
        # network at all until the agent phase.
        metadata = {
            "environment_name": self.environment_name,
            "environment_id": self.environment_id,
            "session_id": self.session_id,
            "template_ref": self.template_ref,
            "harbor.trial_name": self.trial_paths.trial_dir.name,
            "template_name": self._template_name,
            "template_tag": self._template_tag,
            "template_build_id": self._template_build_id or "",
            **self.metadata(),
        }
        if self.job_id is not None:
            metadata["harbor.job_id"] = str(self.job_id)
        if self.context_id is not None:
            metadata["harbor.context_id"] = str(self.context_id)
        self._sandbox = await harbor_e2b.AsyncSandbox.create(
            template=self.template_ref,
            metadata=metadata,
            envs=self._startup_env(),
            timeout=self._sandbox_timeout_sec,
            allow_internet_access=False,
            network=self._sandbox_create_network_options(),
        )

    @override
    async def _apply_network_policy(self, network_policy: NetworkPolicy) -> None:
        if not self._sandbox:
            raise RuntimeError("Sandbox not found. Please start the environment first.")
        update = self._network_update(network_policy)
        await self._sandbox.update_network(update)
        if network_policy.network_mode == NetworkMode.ALLOWLIST:
            # The policy E2B really holds, read back before the agent starts.
            info = await self._sandbox.get_info()
            check_agent_phase_info(info.network, self.provider_host)
            self.logger.info(
                "agent phase network checked: allow_out=%s deny_out=%s",
                info.network.get("allow_out"),
                sorted(info.network.get("deny_out") or []),
            )

    @override
    async def _prepare_sandbox(self) -> None:
        await super()._prepare_sandbox()
        await self._release_reserved_blocks()
        await self._upload_workspace()

    async def _release_reserved_blocks(self) -> None:
        """Gives the agent's user the root file system's blocks ext4 keeps for root (256 MB on the
        install, more than a template leaves free): the sandbox is thrown away after the trial."""
        # /proc/mounts names the root `/dev/root`, which E2B's guest has no node for: its disk is
        # the first virtio one.
        result = await self._run_as_root(
            "for disk in \"$(awk '$2 == \"/\" { print $1 }' /proc/mounts)\" /dev/vda; do "
            '[ -b "$disk" ] && exec tune2fs -r 0 "$disk" > /dev/null; done; exit 1',
            _UPLOAD_TIMEOUT_SEC,
        )
        if result.return_code != 0:
            raise RuntimeError("could not release the root file system's reserved blocks")

    async def _upload_workspace(self) -> None:
        """The fixture the exporter built (a repository and its bare ``origin``), into ``/work``
        and owned by the agent's user. An upload through E2B's API, not the sandbox's network."""
        source = Path(self.environment_dir).parent / TASK_WORKSPACE_DIR
        if not source.is_dir():
            raise FileNotFoundError(f"the task has no {TASK_WORKSPACE_DIR}/ folder")
        await self.upload_dir(source, SANDBOX_WORK_DIR)
        work = shlex.quote(SANDBOX_WORK_DIR)
        result = await self._run_as_root(
            f"chown -R {AGENT_USER}:{AGENT_USER} {work} && chmod 0755 {work}",
            _UPLOAD_TIMEOUT_SEC,
        )
        if result.return_code != 0:
            raise RuntimeError(f"could not hand {SANDBOX_WORK_DIR} to {AGENT_USER}")
