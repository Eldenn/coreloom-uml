"""Fixes a, e and f of the record's section 5 on our E2B environment, with E2B faked."""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import harbor.environments.e2b as harbor_e2b
from harbor.environments.e2b import E2BEnvironment
from harbor.models.task.config import EnvironmentConfig, NetworkMode, NetworkPolicy
from harbor.models.trial.paths import TrialPaths

from coreloom_harbor.environment import ConventionEvalsE2BEnvironment, ConventionEvalsOptions
from coreloom_harbor.policy import (
    AGENT_PHASE_DENY_OUT,
    DENIED_RANGES,
    PolicyViolation,
    agent_phase_update,
    check_agent_phase_info,
    drop_credentials,
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
        sandbox = FakeSandbox(None)
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
            mock.patch.object(environment, "_run_as_root", run_as_root),
            mock.patch.object(environment, "upload_dir", upload_dir),
        ):
            asyncio.run(environment._prepare_sandbox())
        self.assertIn("tune2fs -r 0", commands[0])
        self.assertEqual(uploads, [(str(self.environment_dir.parent / "workspace"), "/work")])
        self.assertIn("chown -R node:node /work", commands[1])

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
