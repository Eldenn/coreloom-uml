# SigNoz OTel collector for staging, with the vendored pipeline + OpAMP config
# baked in. Same rationale as infra/signoz/clickhouse/Dockerfile: Coolify's
# Docker Compose runner does not handle relative host bind-mount paths reliably,
# so the config is COPYed in at build time instead.
#
# Build context is the monorepo root (see the `migrate` note in
# docker-compose.staging.yml), so COPY paths are repo-root-relative.
FROM signoz/signoz-otel-collector:v0.144.5

COPY infra/signoz/otel-collector-config.yaml /etc/otel-collector-config.yaml
COPY infra/signoz/otel-collector-opamp-config.yaml /etc/manager-config.yaml
