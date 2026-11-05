# ClickHouse for the bundled staging SigNoz, with the vendored SigNoz config
# baked in. This exists instead of bind-mounting infra/signoz/clickhouse/*.xml
# because Coolify's Docker Compose runner resolves relative host bind-mount
# paths inconsistently (the file ends up created as an empty directory on the
# host and the mount fails with "not a directory"). A build context is the same
# mechanism the api/web services already use here and works reliably.
#
# Build context is the monorepo root (see the `migrate` note in
# docker-compose.staging.yml), so COPY paths are repo-root-relative.
#
# The base image keeps /etc/clickhouse-server/config.d/docker_related_config.xml
# (it sets listen_host so the server is reachable from other containers); we
# only replace the top-level config/users and add the SigNoz cluster + function.
FROM clickhouse/clickhouse-server:25.5.6

COPY infra/signoz/clickhouse/config.xml /etc/clickhouse-server/config.xml
COPY infra/signoz/clickhouse/users.xml /etc/clickhouse-server/users.xml
COPY infra/signoz/clickhouse/custom-function.xml /etc/clickhouse-server/custom-function.xml
COPY infra/signoz/clickhouse/cluster.xml /etc/clickhouse-server/config.d/cluster.xml
