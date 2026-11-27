# Recorded Harbor job

A job folder written by Harbor 0.27.0 (`harbor run -e coreloom_harbor.environment:...`) on the
local E2B install, read by `readHarborJob` in `../../harbor.test.ts`. Three trials of the
`package-manager-pnpm-add` task, taken from three live checks of 2026-11-27 (decision record,
section 13) and put in one job folder:

- `package-manager-pnpm-add--none__KmEswdd`: Harbor's oracle agent, which passed;
- `package-manager-pnpm-add--none__Hwi8J7z`: a creation the install refused (`SandboxException`,
  no room for the sandbox's memory);
- `package-manager-pnpm-add--full__CjTEN9i`: Claude Code with a fake key, which the provider
  answered with 401 (`AgentAuthenticationError`).

What was changed from the recording: the run folder's path is `/runs/fixture` and the job's name
`run-fixture` wherever they appear; the trials' final workspaces (`artifacts/work/`, Git
repositories) and Claude Code's session files are left out, so the test builds the oracle's
workspace again from the task; `tasks/*/coreloom.json` are the exporter's own files. No credential
was ever in these files (the fake key was in none of them).
- `package-manager-pnpm-add--full__PYzF95k`: Codex with a fake key (round 2 of #147), which the
  provider answered with 401 (`AgentAuthenticationError`); its `$CODEX_HOME` listing holds no
  `auth.json`. The provider masks the key in its answer; the full value is in no file.
