# syntax=docker/dockerfile:1
#
# Build context is the monorepo root: docker build -f apps/web/Dockerfile .
# (needed so pnpm can resolve the `@coreloom-uml/*` workspace dependencies).
FROM node:26.3.0-alpine AS build
RUN npm install -g pnpm@11.5.2
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# No VITE_API_URL build arg: the API URL is now injected at container start
# (see docker/30-render-env-js.sh), so one image works across environments.
RUN pnpm --filter @coreloom-uml/web build

FROM nginx:1.30.3-alpine AS runtime
# `default.conf.template` is rendered to /etc/nginx/conf.d/default.conf at start
# by the base image's 20-envsubst-on-templates.sh. Restrict substitution to
# ${API_URL} so nginx's own $-variables are left alone.
ENV NGINX_ENVSUBST_FILTER=API_URL
COPY apps/web/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/web/docker/30-render-env-js.sh /docker-entrypoint.d/30-render-env-js.sh
RUN chmod +x /docker-entrypoint.d/30-render-env-js.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
