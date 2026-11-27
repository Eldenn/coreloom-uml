"""Harbor's E2B environment with the fixes of the convention evals (record section 5, a e f)."""

from __future__ import annotations

import shlex
from collections.abc import Mapping
from pathlib import Path
from typing import Any, override

from pydantic import Field, model_validator
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

import harbor.environments.e2b as harbor_e2b
from harbor.environments.base import ExecResult
from harbor.environments.definition import effective_exec_cwd
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
    check_no_network_info,
    drop_credentials,
    secret_file_command,
    secret_file_content,
)

#: Where the exporter puts the fixture in a task folder, and where it goes in the sandbox
#: (packages/catalog/evals/src/harbor/constants.ts).
TASK_WORKSPACE_DIR = "workspace"
SANDBOX_WORK_DIR = "/work"
#: The template's user the agent runs as; it owns the fixture.
AGENT_USER = "node"
#: Where the agent's key waits for its one command (fix g): a fixed path, never anything of the
#: key's, in a folder of the agent user's home that only that user (and root) can open. E2B's
#: file upload creates the file 0644, so the folder (0700) is what keeps it to that user. The
#: command's fixed line removes the file before anything else (`secret_file_command`).
SECRET_DIR = f"/home/{AGENT_USER}/.coreloom-secret"
SECRET_FILE = f"{SECRET_DIR}/key"
_SECRET_DIR_Q = shlex.quote(SECRET_DIR)
_SECRET_FILE_Q = shlex.quote(SECRET_FILE)
#: Run as the agent's user before the key is written: the folder is that user's own, a real
#: folder (not a link), 0700, and holds no file at the key's path.
PREPARE_SECRET_DIR = (
    f"umask 077; mkdir -p -- {_SECRET_DIR_Q} && [ -d {_SECRET_DIR_Q} ] && "
    f"[ ! -L {_SECRET_DIR_Q} ] && [ -O {_SECRET_DIR_Q} ] && chmod 0700 -- {_SECRET_DIR_Q} && "
    f"rm -f -- {_SECRET_FILE_Q} && [ ! -e {_SECRET_FILE_Q} ]"
)
#: Run as the agent's user once the command is over or failed to start: the key's file is gone,
#: removed here if its command never read it.
REMOVE_SECRET_FILE = f"rm -f -- {_SECRET_FILE_Q}; [ ! -e {_SECRET_FILE_Q} ]"
#: Run as root at setup, before the agent's user runs anything. E2B's template builder adds a
#: user `user` with passwordless sudo, and leaves root's and its password empty, so anyone can
#: `su` to root (record section 13): every empty password is locked, and no file keeps a
#: set-user-id or set-group-id bit or a file capability (`su`, `sudo`, `mount`… are of no use to
#: an agent). Every mount is walked but the kernel's (`/proc`, `/sys`, `/dev`). envd, which starts
#: every command, runs as root and needs none of them.
_SET_ID_FILES = (
    "find / \\( -path /proc -o -path /sys -o -path /dev \\) -prune -o -type f -perm /6000 -print"
)
HARDEN_SANDBOX = (
    "set -e; "
    f"{_SET_ID_FILES} | while IFS= read -r file; do chmod ug-s \"$file\"; done; "
    "if command -v getcap > /dev/null && command -v setcap > /dev/null; then "
    "getcap -r / 2> /dev/null | while read -r file _; do setcap -r \"$file\"; done; fi; "
    "for name in $(awk -F: '$2 == \"\" { print $1 }' /etc/shadow); do "
    'passwd -l "$name" > /dev/null; done'
)
#: Run as the agent's user at setup: fails when it can become root (sudo, su with no password, a
#: set-id program or a file capability left) or read the environment of a process of root's
#: (where a key of another command would be). A kernel thread's environment reads empty for
#: anyone, so only a non-empty one counts.
AGENT_USER_CHECK = (
    "if command -v sudo > /dev/null && sudo -n true 2> /dev/null; then echo sudo; exit 1; fi; "
    "for name in root user; do "
    'if su -c true "$name" < /dev/null > /dev/null 2>&1; then echo "su $name"; exit 1; fi; '
    "done; "
    f'left="$({_SET_ID_FILES} 2> /dev/null | head -n 1)"; '
    'if [ -n "$left" ]; then echo "set-id $left"; exit 1; fi; '
    "if command -v getcap > /dev/null; then "
    'capped="$(getcap -r / 2> /dev/null | head -n 1)"; '
    'if [ -n "$capped" ]; then echo "capability $capped"; exit 1; fi; fi; '
    "for file in /proc/[0-9]*/environ; do "
    '[ "$(stat -c %u "${file%/environ}" 2> /dev/null)" = 0 ] || continue; '
    'if [ -n "$(tr -d \'\\0\' < "$file" 2> /dev/null | head -c 1)" ]; then '
    'echo "reads $file"; exit 1; fi; '
    "done; exit 0"
)
#: Run as root once the agent phase is over and its network cut (security I3): every process of
#: the agent's user is killed, then the trial fails if one is still there a moment later. Read from
#: `/proc` (the templates hold no `pkill`); the shell running this is root's, never killed.
_AGENT_PIDS = (
    f'uid="$(id -u {AGENT_USER})"; for dir in /proc/[0-9]*; do '
    '[ "$(stat -c %u "$dir" 2> /dev/null)" = "$uid" ] && echo "${dir#/proc/}"; done'
)
KILL_AGENT_PROCESSES = (
    f"{_AGENT_PIDS} | xargs -r kill -KILL 2> /dev/null; "
    "for _ in 1 2 3 4 5 6 7 8 9 10; do "
    f'[ -z "$({_AGENT_PIDS})" ] && exit 0; sleep 0.2; done; exit 1'
)
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
        #: The keys handed to a command, so that no later command carries one (fix g).
        self._secrets: set[str] = set()
        self._agent_phase_started = False
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

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def _update_network_checked(self, network_policy: NetworkPolicy) -> None:
        """Harbor's update (tried twice, as upstream), then the policy E2B really holds, read
        back: the provider's host only for the agent phase, nothing allowed for the others."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not found. Please start the environment first.")
        await self._sandbox.update_network(self._network_update(network_policy))
        info = await self._sandbox.get_info()
        if network_policy.network_mode == NetworkMode.ALLOWLIST:
            check_agent_phase_info(info.network, self.provider_host)
            self.logger.info(
                "agent phase network checked: allow_out=%s deny_out=%s",
                info.network.get("allow_out"),
                sorted(info.network.get("deny_out") or []),
            )
        else:
            check_no_network_info(info.network)

    @override
    async def _apply_network_policy(self, network_policy: NetworkPolicy) -> None:
        await self._update_network_checked(network_policy)
        if network_policy.network_mode == NetworkMode.ALLOWLIST:
            self._agent_phase_started = True
        elif self._agent_phase_started:
            # The agent phase is over, its network already cut: nothing the agent left running
            # keeps the key in its environment through the copy back or the verifier.
            await self._kill_agent_processes()

    async def _kill_agent_processes(self) -> None:
        result = await self._run_as_root(KILL_AGENT_PROCESSES, _UPLOAD_TIMEOUT_SEC)
        if result.return_code != 0:
            raise PolicyViolation(f"processes of {AGENT_USER} outlived the agent phase")

    def _refuse_secret(self, command: str, env: Mapping[str, str] | None) -> None:
        """Fix g, by value: a key sent once is never in a command line or an env value after."""
        for secret in self._secrets:
            if secret in command or any(secret in value for value in (env or {}).values()):
                raise PolicyViolation("a command would carry the key in its line or its envs")

    def _without_credentials(self, env: Mapping[str, str]) -> dict[str, str]:
        kept = drop_credentials(env)
        dropped = sorted(set(env) - set(kept))
        if dropped:
            # Names only: Harbor's model settings (`*_TOKENS`) are dropped too, on purpose.
            self.logger.debug("credential-like variables dropped from a command: %s", dropped)
        return kept

    @override
    async def _dispatch_command(
        self,
        command: str,
        *,
        cwd: str | None,
        env: dict[str, str] | None,
        timeout_sec: int | None,
        user: str,
    ) -> Any:
        # Fix g: every command Harbor starts goes through here, and envd logs each one with its
        # envs in full: none carries a credential, whoever asked for it.
        kept = self._without_credentials(env) if env else env
        self._refuse_secret(command, kept)
        return await super()._dispatch_command(
            command, cwd=cwd, env=kept, timeout_sec=timeout_sec, user=user
        )

    async def exec_with_secret(
        self,
        command: str,
        *,
        secret_name: str,
        secret: str,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        timeout_sec: int | None = None,
        user: str | int | None = None,
    ) -> ExecResult:
        """Runs ``command`` like ``exec``, with the credential ``secret_name`` set in its own
        environment from a file (fix g): never in the request's envs, its command line nor its
        standard input, all of which envd writes into the install's logs. The key is written to
        ``SECRET_FILE`` with E2B's file upload, whose log line holds the path and the user only;
        the command's fixed line reads it and removes it first. Only as the agent's user. Fails
        closed: no run when the folder or the write fails, and the file removed (and checked
        gone) whatever happens, else ``PolicyViolation``."""
        if not self._sandbox:
            raise RuntimeError("Sandbox not found. Please start the environment first.")
        content = secret_file_content(secret)
        user = self._resolve_user(user)
        if str(user) != AGENT_USER:
            raise PolicyViolation(f"the key goes to a command of {AGENT_USER} only, not {user}")
        self._secrets.add(secret)
        merged_env = self._without_credentials(
            {**self._exec_base_env, **(self._merge_env(env) or {})}
        )
        wrapped = secret_file_command(secret_name, SECRET_FILE, command)
        self._refuse_secret(wrapped, merged_env)
        if (await self._run_as_agent(PREPARE_SECRET_DIR)).return_code != 0:
            raise PolicyViolation(f"could not prepare {SECRET_DIR} for the key")
        try:
            await self._sandbox.files.write(
                SECRET_FILE, content, user=AGENT_USER, request_timeout=_UPLOAD_TIMEOUT_SEC
            )
            handle = await self._sandbox.commands.run(
                cmd=wrapped,
                background=True,
                cwd=effective_exec_cwd(cwd, self.task_env_config.workdir, self._workdir),
                envs=merged_env or None,
                timeout=timeout_sec or 0,
                user=AGENT_USER,
            )
            result = await self._wait_reattaching(handle, timeout_sec)
        except BaseException as error:
            await self._remove_secret_file(after=error)
            raise
        await self._remove_secret_file()
        return result

    async def _run_as_agent(self, command: str) -> ExecResult:
        """A fixed command of ours as the agent's user, outside Harbor's env overlays."""
        handle = await self._sandbox.commands.run(  # type: ignore[union-attr]
            cmd=command, background=True, cwd="/", timeout=_UPLOAD_TIMEOUT_SEC, user=AGENT_USER
        )
        return await self._wait_reattaching(handle, _UPLOAD_TIMEOUT_SEC)

    async def _remove_secret_file(self, after: BaseException | None = None) -> None:
        """Removes the key's file and checks it is gone, else fails the trial. ``after`` is the
        error the write or the command already failed with: a failed removal is then raised
        from it, and its type logged, so the first failure is never lost behind the second."""
        try:
            removed = (await self._run_as_agent(REMOVE_SECRET_FILE)).return_code == 0
            if not removed:
                raise PolicyViolation(f"the key's file {SECRET_FILE} is still in the sandbox")
        except Exception as failure:
            if after is None:
                raise
            self.logger.warning(
                "the key's file could not be checked gone after %s", type(after).__name__
            )
            raise failure from after

    @override
    async def _prepare_sandbox(self) -> None:
        await super()._prepare_sandbox()
        await self._check_agent_user()
        await self._release_reserved_blocks()
        await self._upload_workspace()

    async def _check_agent_user(self) -> None:
        """The agent's user is not root by another way (record section 13): the sandbox is
        hardened first (``HARDEN_SANDBOX``), then the user must have no group that is root's, no
        sudoers entry, no way to become root and no root process's environment it can read."""
        harden = await self._run_as_root(HARDEN_SANDBOX, _UPLOAD_TIMEOUT_SEC)
        if harden.return_code != 0:
            raise PolicyViolation("could not take root's ways back from the agent's user")
        user = shlex.quote(AGENT_USER)
        as_root = await self._run_as_root(
            f"id -u {user} > /dev/null || exit 2; "
            f"id -nG {user} | tr ' ' '\\n' | grep -qxE 'root|sudo|wheel|admin' && exit 3; "
            f"grep -rsqwE '^[^#]*{AGENT_USER}' /etc/sudoers /etc/sudoers.d && exit 4; "
            "exit 0",
            _UPLOAD_TIMEOUT_SEC,
        )
        if as_root.return_code != 0:
            raise PolicyViolation(
                f"{AGENT_USER} is missing or may act as root (check {as_root.return_code})"
            )
        handle = await self._sandbox.commands.run(  # type: ignore[union-attr]
            cmd=AGENT_USER_CHECK,
            background=True,
            timeout=_UPLOAD_TIMEOUT_SEC,
            user=AGENT_USER,
        )
        as_agent = await self._wait_reattaching(handle, _UPLOAD_TIMEOUT_SEC)
        if as_agent.return_code != 0:
            raise PolicyViolation(
                f"{AGENT_USER} may act as root: {(as_agent.stdout or '').strip()[:200]}"
            )

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
