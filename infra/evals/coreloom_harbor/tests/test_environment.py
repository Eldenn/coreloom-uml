"""Fixes a, e, f and g of the record's section 5 on our E2B environment, with E2B faked."""

from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import harbor.environments.e2b as harbor_e2b
from harbor.environments.e2b import E2BEnvironment
from harbor.models.task.config import EnvironmentConfig, NetworkMode, NetworkPolicy
from harbor.models.trial.paths import TrialPaths

from coreloom_harbor.environment import (
    AGENT_USER,
    AGENT_USER_CHECK,
    HARDEN_SANDBOX,
    KILL_AGENT_PROCESSES,
    ConventionEvalsE2BEnvironment,
    ConventionEvalsOptions,
)
from coreloom_harbor.policy import (
    AGENT_PHASE_DENY_OUT,
    DENIED_RANGES,
    NO_SECRET_EXIT,
    PolicyViolation,
    agent_phase_update,
    check_agent_phase_info,
    drop_credentials,
    stdin_secret_command,
)

HOST = "api.anthropic.com"
FAKE_KEY = "sk-ant-api03-CANARYFAKE-environment-test"
NO_NETWORK = NetworkPolicy(network_mode=NetworkMode.NO_NETWORK)
AGENT_PHASE = NetworkPolicy(network_mode=NetworkMode.ALLOWLIST, allowed_hosts=[HOST])
OPTIONS = {"provider_host": HOST, "coreloom_run": "run-1", "coreloom_account": 7}


class FakeSandbox:
    def __init__(self, network: dict | None) -> None:
        self.updates: list[dict] = []
        self.network = network
        self.sandbox_id = "fake"

    async def update_network(self, update: dict) -> None:
        self.updates.append(update)

    async def get_info(self):
        return SimpleNamespace(network=self.network)


class FakeHandle:
    def __init__(self, commands: FakeCommands, pid: int, exit_code: int) -> None:
        self.commands, self.pid, self.exit_code = commands, pid, exit_code
        self.stdout, self.stderr = "", ""

    async def wait(self):
        return SimpleNamespace(stdout="", stderr="", exit_code=self.exit_code)

    async def kill(self) -> bool:
        self.commands.killed = True
        return True


class FakeCommands:
    """E2B's ``sandbox.commands``: what each command was started with, and what went to stdin."""

    def __init__(self, exit_codes: dict[str, int]) -> None:
        self.exit_codes = exit_codes
        self.runs: list[dict] = []
        self.stdin: list[tuple[int, str]] = []
        self.fail_stdin = False
        self.killed = False

    async def run(self, cmd, background=False, envs=None, user=None, cwd=None, timeout=None,
                  stdin=False, **_):
        pid = len(self.runs) + 100
        self.runs.append(
            {"cmd": cmd, "envs": envs or {}, "user": user, "stdin": stdin, "pid": pid}
        )
        return FakeHandle(self, pid, self.exit_codes.get(cmd, 0))

    async def send_stdin(self, pid: int, data: str) -> None:
        if self.fail_stdin:
            raise ConnectionError("envd went away")
        self.stdin.append((pid, data))

    async def close_stdin(self, pid: int) -> None:
        self.stdin.append((pid, "close"))


class EnvironmentTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "task" / "environment").mkdir(parents=True)
        (root / "task" / "environment" / "Dockerfile").write_text("FROM scratch\n")
        (root / "task" / "workspace").mkdir()
        self.trial_dir = root / "trial"
        self.trial_dir.mkdir()
        self.environment_dir = root / "task" / "environment"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def make(self, *, phases=(AGENT_PHASE,), env=None, **options):
        return ConventionEvalsE2BEnvironment(
            environment_dir=self.environment_dir,
            environment_name="task",
            session_id="trial__env",
            trial_paths=TrialPaths(self.trial_dir),
            task_env_config=EnvironmentConfig(
                network_mode=NetworkMode.NO_NETWORK, env=env or {}
            ),
            network_policy=NO_NETWORK,
            phase_network_policies=list(phases),
            persistent_env={"ANTHROPIC_API_KEY": FAKE_KEY, "LANG": "C.UTF-8"},
            **{**OPTIONS, **options},
        )

    def test_drops_every_credential_from_the_startup_env(self):  # fix a
        environment = self.make(env={"OPENAI_API_KEY": FAKE_KEY, "TZ": "UTC"})
        startup = environment._startup_env()
        self.assertEqual(startup, {"LANG": "C.UTF-8", "TZ": "UTC"})
        self.assertNotIn(FAKE_KEY, repr(startup))

    def test_drop_credentials_reads_names_not_values(self):
        self.assertEqual(
            drop_credentials(
                {"CODEX_API_KEY": "x", "GH_TOKEN": "y", "MY_SECRET": "z", "HOME": "/h"}
            ),
            {"HOME": "/h"},
        )

    def test_creates_the_sandbox_with_our_metadata_and_no_network(self):  # fix f
        environment = self.make()
        environment.job_id = "11111111-1111-1111-1111-111111111111"
        create = mock.AsyncMock(return_value=FakeSandbox(None))
        with mock.patch.object(harbor_e2b.AsyncSandbox, "create", create):
            asyncio.run(environment._create_sandbox())
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs["metadata"]["coreloom.purpose"], "convention-evals")
        self.assertEqual(kwargs["metadata"]["coreloom.run"], "run-1")
        self.assertEqual(kwargs["metadata"]["coreloom.account"], "7")
        self.assertEqual(kwargs["metadata"]["harbor.job_id"], environment.job_id)
        self.assertFalse(kwargs["allow_internet_access"])
        self.assertIsNone(kwargs["network"])
        self.assertEqual(kwargs["timeout"], 300)
        self.assertNotIn(FAKE_KEY, repr(kwargs))

    def test_applies_and_reads_back_the_agent_phase_policy(self):  # fix e
        environment = self.make()
        sandbox = FakeSandbox({"allow_out": [HOST], "deny_out": list(AGENT_PHASE_DENY_OUT)})
        environment._sandbox = sandbox
        asyncio.run(environment._apply_network_policy(AGENT_PHASE))
        self.assertEqual(sandbox.updates, [agent_phase_update([HOST], HOST)])
        self.assertEqual(sandbox.updates[0]["allow_out"], [HOST])
        for denied in ("0.0.0.0/0", "169.254.0.0/16", "192.0.2.0/24", "10.0.0.0/8"):
            self.assertIn(denied, sandbox.updates[0]["deny_out"])

    def test_fails_when_e2b_holds_another_policy(self):  # fix e
        environment = self.make()
        for network in (
            None,
            {"allow_out": [HOST, "registry.npmjs.org"], "deny_out": list(AGENT_PHASE_DENY_OUT)},
            {"allow_out": [HOST], "deny_out": ["0.0.0.0/0"]},
        ):
            environment._sandbox = FakeSandbox(network)
            with self.assertRaises(PolicyViolation):
                asyncio.run(environment._apply_network_policy(AGENT_PHASE))

    def test_refuses_a_wider_agent_phase_before_anything_starts(self):  # fix e
        wider = NetworkPolicy(
            network_mode=NetworkMode.ALLOWLIST, allowed_hosts=[HOST, "api.openai.com"]
        )
        with self.assertRaises(PolicyViolation):
            self.make(phases=(wider,))
        with self.assertRaises(PolicyViolation):
            self.make(phases=(NetworkPolicy(network_mode=NetworkMode.PUBLIC),))

    def test_setup_and_the_verifier_get_no_network(self):
        environment = self.make()
        sandbox = FakeSandbox({"allow_out": [], "deny_out": ["0.0.0.0/0"]})
        environment._sandbox = sandbox
        asyncio.run(environment._apply_network_policy(NO_NETWORK))
        self.assertEqual(sandbox.updates, [{"allow_internet_access": False, "deny_out": ["0.0.0.0/0"]}])

    def test_fixes_the_sandbox_timeouts(self):
        self.assertEqual(ConventionEvalsOptions(**OPTIONS).sandbox_timeout_sec, 300)
        self.assertEqual(ConventionEvalsOptions(**OPTIONS).renew_interval_sec, 60)
        for wrong in ({"sandbox_timeout_sec": 3600}, {"renew_interval_sec": 600}):
            with self.assertRaises(ValueError):
                ConventionEvalsOptions(**OPTIONS, **wrong)

    def test_waits_for_room_when_no_node_can_hold_the_sandbox(self):
        environment = self.make()
        full = harbor_e2b.SandboxException(
            "500: Failed to place sandbox: this node cannot allocate 1024 MiB of guest memory",
            status_code=500,
        )
        create = mock.AsyncMock(side_effect=[full, full, FakeSandbox(None)])
        with (
            mock.patch.object(harbor_e2b.AsyncSandbox, "create", create),
            mock.patch.object(harbor_e2b, "_WAIT_FOR_CAPACITY", lambda _state: 0),
        ):
            asyncio.run(environment._create_sandbox())
        self.assertEqual(create.await_count, 3)

    def test_gives_up_on_other_server_errors(self):
        environment = self.make()
        other = harbor_e2b.SandboxException("500: internal error", status_code=500)
        create = mock.AsyncMock(side_effect=other)
        with mock.patch.object(harbor_e2b.AsyncSandbox, "create", create):
            with self.assertRaises(harbor_e2b.SandboxException):
                asyncio.run(environment._create_sandbox())
        self.assertEqual(create.await_count, 1)

    def test_releases_the_reserved_blocks_then_uploads_the_fixture_for_the_agent(self):
        environment = self.make()
        commands: list[str] = []

        async def run_as_root(command: str, _timeout: int):
            commands.append(command)
            return SimpleNamespace(return_code=0, stdout="", stderr="")

        uploads: list[tuple[str, str]] = []

        async def upload_dir(source, target):
            uploads.append((str(source), target))

        with (
            mock.patch.object(E2BEnvironment, "_prepare_sandbox", mock.AsyncMock()),
            mock.patch.object(environment, "_check_agent_user", mock.AsyncMock()) as check,
            mock.patch.object(environment, "_run_as_root", run_as_root),
            mock.patch.object(environment, "upload_dir", upload_dir),
        ):
            asyncio.run(environment._prepare_sandbox())
        check.assert_awaited_once()
        self.assertIn("tune2fs -r 0", commands[0])
        self.assertEqual(uploads, [(str(self.environment_dir.parent / "workspace"), "/work")])
        self.assertIn("chown -R node:node /work", commands[1])

    def sandbox_with_commands(self, exit_codes: dict[str, int] | None = None) -> FakeSandbox:
        environment_sandbox = FakeSandbox(None)
        environment_sandbox.commands = FakeCommands(exit_codes or {})  # type: ignore[attr-defined]
        return environment_sandbox

    def test_sends_the_key_on_stdin_never_in_envs_or_the_command(self):  # fix g
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        result = asyncio.run(
            environment.exec_with_secret(
                "claude --print",
                secret_name="ANTHROPIC_API_KEY",
                secret=FAKE_KEY,
                env={"ANTHROPIC_MODEL": "claude-sonnet-5-5", "OPENAI_API_KEY": FAKE_KEY},
                user="node",
            )
        )
        self.assertEqual(result.return_code, 0)
        commands = environment._sandbox.commands
        (run,) = commands.runs
        self.assertTrue(run["stdin"])
        self.assertNotIn(FAKE_KEY, run["cmd"])
        self.assertNotIn(FAKE_KEY, repr(run["envs"]))
        self.assertNotIn("ANTHROPIC_API_KEY", run["envs"])
        self.assertEqual(run["envs"]["ANTHROPIC_MODEL"], "claude-sonnet-5-5")
        self.assertEqual(run["envs"]["LANG"], "C.UTF-8")
        self.assertTrue(run["cmd"].startswith("IFS= read -r ANTHROPIC_API_KEY || exit 97; "))
        self.assertTrue(run["cmd"].endswith("exec 0</dev/null; claude --print"))
        self.assertEqual(commands.stdin, [(run["pid"], f"{FAKE_KEY}\n"), (run["pid"], "close")])

    def test_kills_the_command_when_the_key_cannot_be_sent(self):  # fix g
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        environment._sandbox.commands.fail_stdin = True
        with self.assertRaises(ConnectionError):
            asyncio.run(
                environment.exec_with_secret(
                    "claude", secret_name="ANTHROPIC_API_KEY", secret=FAKE_KEY, user="node"
                )
            )
        self.assertTrue(environment._sandbox.commands.killed)

    def test_refuses_a_key_that_is_not_one_line_and_a_name_that_is_not_a_credential(self):
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        for name, secret in (("ANTHROPIC_API_KEY", "a\nb"), ("ANTHROPIC_API_KEY", ""), ("PATH", "x")):
            with self.assertRaises(ValueError):
                asyncio.run(
                    environment.exec_with_secret("true", secret_name=name, secret=secret, user="node")
                )
        self.assertEqual(environment._sandbox.commands.runs, [])

    def test_refuses_a_command_carrying_the_key_by_value(self):  # security I2, QA 3
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        with self.assertRaises(PolicyViolation):
            asyncio.run(
                environment.exec_with_secret(
                    "claude",
                    secret_name="ANTHROPIC_API_KEY",
                    secret=FAKE_KEY,
                    env={"CLAUDE_EXTRA": FAKE_KEY},
                    user="node",
                )
            )
        self.assertEqual(environment._sandbox.commands.runs, [])
        # Once sent, the value is refused in any later command's line or env value.
        asyncio.run(
            environment.exec_with_secret(
                "claude", secret_name="ANTHROPIC_API_KEY", secret=FAKE_KEY, user="node"
            )
        )
        for command, env in ((f"echo {FAKE_KEY}", {}), ("true", {"X": f"a{FAKE_KEY}b"})):
            with self.assertRaises(PolicyViolation):
                asyncio.run(environment.exec(command, env=env, user="node"))
        self.assertEqual(len(environment._sandbox.commands.runs), 1)

    def test_sends_the_key_to_the_agents_user_only(self):  # security I1
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        for user in (None, "root", "user"):
            with self.assertRaises(PolicyViolation):
                asyncio.run(
                    environment.exec_with_secret(
                        "claude", secret_name="ANTHROPIC_API_KEY", secret=FAKE_KEY, user=user
                    )
                )
        self.assertEqual(environment._sandbox.commands.runs, [])

    def test_reads_back_the_no_network_phases(self):  # code review 4
        for network in (None, {"allow_out": [HOST], "deny_out": ["0.0.0.0/0"]}, {"deny_out": []}):
            environment = self.make()
            environment._sandbox = FakeSandbox(network)
            with self.assertRaises(PolicyViolation):
                asyncio.run(environment._apply_network_policy(NO_NETWORK))

    def test_kills_the_agents_processes_once_the_agent_phase_is_over(self):  # security I3
        environment = self.make()
        sandbox = FakeSandbox({"allow_out": [HOST], "deny_out": list(AGENT_PHASE_DENY_OUT)})
        environment._sandbox = sandbox
        as_root: list[str] = []
        left = {"code": 0}

        async def run_as_root(command: str, _timeout: int):
            as_root.append(command)
            return SimpleNamespace(return_code=left["code"], stdout="", stderr="")

        with mock.patch.object(environment, "_run_as_root", run_as_root):
            sandbox.network = {"allow_out": [], "deny_out": ["0.0.0.0/0"]}
            asyncio.run(environment._apply_network_policy(NO_NETWORK))
            self.assertEqual(as_root, [])  # setup: no agent phase yet
            sandbox.network = {"allow_out": [HOST], "deny_out": list(AGENT_PHASE_DENY_OUT)}
            asyncio.run(environment._apply_network_policy(AGENT_PHASE))
            sandbox.network = {"allow_out": [], "deny_out": ["0.0.0.0/0"]}
            asyncio.run(environment._apply_network_policy(NO_NETWORK))
            self.assertEqual(as_root, [KILL_AGENT_PROCESSES])
            left["code"] = 1
            sandbox.network = {"allow_out": [HOST], "deny_out": list(AGENT_PHASE_DENY_OUT)}
            asyncio.run(environment._apply_network_policy(AGENT_PHASE))
            sandbox.network = {"allow_out": [], "deny_out": ["0.0.0.0/0"]}
            with self.assertRaises(PolicyViolation):
                asyncio.run(environment._apply_network_policy(NO_NETWORK))

    def test_every_other_command_loses_its_credentials(self):  # fix g
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        asyncio.run(
            environment.exec("git status", env={"CODEX_API_KEY": FAKE_KEY, "TZ": "UTC"}, user="node")
        )
        (run,) = environment._sandbox.commands.runs
        self.assertNotIn(FAKE_KEY, repr(run["envs"]))
        self.assertNotIn("ANTHROPIC_API_KEY", run["envs"])  # Harbor's persistent env
        self.assertEqual(run["envs"]["TZ"], "UTC")
        self.assertFalse(run["stdin"])

    def test_the_shell_line_reads_the_key_into_the_command_only(self):  # fix g
        script = stdin_secret_command(
            "CODEX_API_KEY", 'printf "%s|" "$CODEX_API_KEY"; cat; printf "|done"'
        )
        ran = subprocess.run(
            ["bash", "-c", script],
            input=f"{FAKE_KEY}\nleft on stdin\n",
            capture_output=True,
            text=True,
            env={"PATH": os.environ["PATH"]},
            check=False,
        )
        # The key is in the command's environment, and nothing after it can be read from stdin.
        self.assertEqual((ran.returncode, ran.stdout), (0, f"{FAKE_KEY}||done"))
        empty = subprocess.run(
            ["bash", "-c", script], input="", capture_output=True, text=True, check=False
        )
        self.assertEqual(empty.returncode, NO_SECRET_EXIT)

    def test_fails_the_trial_when_the_agent_user_may_act_as_root(self):  # record section 13
        for failing in ("root", "node"):
            environment = self.make()
            sandbox = self.sandbox_with_commands({AGENT_USER_CHECK: 1 if failing == "node" else 0})
            environment._sandbox = sandbox

            async def run_as_root(command: str, _timeout: int, failing=failing):
                code = 3 if failing == "root" and "sudoers" in command else 0
                return SimpleNamespace(return_code=code, stdout="", stderr="")

            with mock.patch.object(environment, "_run_as_root", run_as_root):
                with self.assertRaises(PolicyViolation):
                    asyncio.run(environment._check_agent_user())

    def test_takes_roots_ways_back_then_checks_the_agent_user(self):
        environment = self.make()
        environment._sandbox = self.sandbox_with_commands()
        as_root: list[str] = []

        async def run_as_root(command: str, _timeout: int):
            as_root.append(command)
            return SimpleNamespace(return_code=0, stdout="", stderr="")

        with mock.patch.object(environment, "_run_as_root", run_as_root):
            asyncio.run(environment._check_agent_user())
        self.assertEqual(as_root[0], HARDEN_SANDBOX)
        self.assertIn("/etc/sudoers.d", as_root[1])
        (run,) = environment._sandbox.commands.runs
        self.assertEqual((run["cmd"], run["user"]), (AGENT_USER_CHECK, "node"))

    def test_the_agent_user_check_finds_a_way_to_root_left_in_the_worker_image(self):
        # Run in the worker image as `node`: its Debian keeps set-user-id programs (`su`,
        # `passwd`…), which the check must report, so its shell line works and finds them.
        ran = subprocess.run(["bash", "-c", AGENT_USER_CHECK], capture_output=True, text=True)
        self.assertNotEqual(ran.returncode, 0, ran.stderr)
        self.assertRegex(ran.stdout, r"^(set-id /|su |sudo|reads /proc/)")
        self.assertEqual(AGENT_USER, "node")

    def test_denies_the_api_ranges_the_link_local_and_the_log_collector(self):
        self.assertEqual(
            set(DENIED_RANGES),
            {
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.168.0.0/16",
                "169.254.0.0/16",
                "100.64.0.0/10",
                "192.0.2.0/24",
            },
        )
        check_agent_phase_info({"allow_out": [HOST], "deny_out": list(AGENT_PHASE_DENY_OUT)}, HOST)


if __name__ == "__main__":
    unittest.main()
