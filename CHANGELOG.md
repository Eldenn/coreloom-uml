# Changelog

Historical record up to `0.1.0`, frozen — from here on, releases are managed
by [Changesets](https://github.com/changesets/changesets): every PR adds a
changeset (`.changeset/README.md`), and `apps/api/CHANGELOG.md` /
`apps/web/CHANGELOG.md` are generated automatically. Nothing below this line
is hand-edited going forward; see `.changeset/README.md` for the full
release flow.

## [0.1.0] - 2026-09-11

First tagged MVP baseline: session-based auth (register/login/logout,
password reset, email verification), account management (profile, avatar
upload, password change, account deletion), the `notes` reference domain,
BullMQ job queue with transactional email, OpenTelemetry tracing, i18n
(en/fr), and a seeded demo user (`demo@coreloom-uml.dev`) with sample notes.
