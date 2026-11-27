"""Harbor classes of the convention evals (packages/catalog/evals/decision-record.md).

Harbor 0.27.0 imports them by path (``--env coreloom_harbor.environment:...``,
``--agent coreloom_harbor.agents:...``) in the ``convention-evals`` worker's image. They carry
the fixes a to f of the record's section 5: no credential in a sandbox's startup environment,
our metadata on every sandbox, the agent phase's network asserted to be the provider's host only,
fixed sandbox timeouts, and agents that pass the key per command and write no auth file.
"""
