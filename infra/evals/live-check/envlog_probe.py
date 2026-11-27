"""Live check only (infra/evals/live-check/run.sh), never in the worker: our environment with a
positive control for the install's log collector. Before the sandbox is killed it starts one
command whose envs hold a made-up canary (``COREL_ENVLOG_CANARY``, not a credential name, so our
class keeps it), then waits for envd to ship its buffered lines. The canary must land in
``sandbox_logs``; the fake key must not."""

import asyncio
import os

from coreloom_harbor.environment import ConventionEvalsE2BEnvironment

SHIP_WAIT_SEC = 40


class ProbeEnvironment(ConventionEvalsE2BEnvironment):
    async def stop(self, delete: bool):
        try:
            if self._sandbox is not None:
                await self._sandbox.commands.run(
                    "true", envs={"COREL_ENVLOG_CANARY": os.environ["ENVLOG_CANARY"]}, timeout=10
                )
                await asyncio.sleep(SHIP_WAIT_SEC)
        finally:
            await super().stop(delete)
