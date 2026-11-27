"""Live check only (infra/evals/live-check/run.sh), never in the worker: our environment with two
positive controls for the install's log collector. Before the sandbox is killed it starts one
command whose envs hold a made-up canary (``COREL_ENVLOG_CANARY``, not a credential name, so our
class keeps it), and one command that is sent another made-up value on its standard input
(``ENVLOG_STDIN_CONTROL``), then waits for envd to ship its buffered lines, and writes the
sandbox's id to ``ENVLOG_SANDBOX_FILE`` for the script to count that sandbox's rows. On an
install that does not redact its logs the canary must land in ``sandbox_logs`` as is and the
standard input control in base64 (envd logs both); on one that does, their rows must be there
with the values masked. The fake key, written to its file only, must be in no row, neither as is
nor in base64."""

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
                handle = await self._sandbox.commands.run(
                    "cat > /dev/null", background=True, stdin=True, timeout=20
                )
                await self._sandbox.commands.send_stdin(
                    handle.pid, os.environ["ENVLOG_STDIN_CONTROL"]
                )
                await self._sandbox.commands.close_stdin(handle.pid)
                await handle.wait()
                with open(os.environ["ENVLOG_SANDBOX_FILE"], "w", encoding="utf-8") as out:
                    out.write(self._sandbox.sandbox_id)
                await asyncio.sleep(SHIP_WAIT_SEC)
        finally:
            await super().stop(delete)
