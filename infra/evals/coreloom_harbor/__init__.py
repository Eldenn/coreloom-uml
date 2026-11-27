"""Harbor classes of the convention evals (packages/catalog/evals/decision-record.md).

Harbor 0.27.0 imports them by path (``--env coreloom_harbor.environment:...``,
``--agent coreloom_harbor.agents:...``) in the ``convention-evals`` worker's image. They carry
the fixes a to g of the record's section 5: no credential in a sandbox's startup environment,
our metadata on every sandbox, the agent phase's network asserted to be the provider's host only,
fixed sandbox timeouts, agents that write no auth file, the key handed to the agent's command
through a file that command removes at once (never in a command's envs, line or standard input,
which envd logs), and an agent user that cannot become root.
"""
