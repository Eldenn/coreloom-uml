# The E2B template every convention-eval trial of Codex starts from (decision record, section
# 13). Harbor builds it from this folder once, names it by the folder's hash and reuses it: the
# exporter copies this folder as is into every task's `environment/`, and nothing of a task, a
# condition or an account is ever added to it (the fixture and the convention files are uploaded
# when the sandbox starts). One stage only: E2B's template builder takes no other.
# Small on purpose: the install's sandboxes have a 952 MB root file system, 256 MB of it reserved
# for root (released at start by our environment class with tune2fs, hence e2fsprogs). Node, git,
# pnpm and the agent's CLI, nothing else: git's Perl (only for commands an agent has no use for,
# such as send-email or svn) and its manual are removed. Every version is exact; the npm packages
# are checked by the sha512 of package-lock.json, the base image by its digest. See
# infra/evals/README.md.
FROM node:26.3.0-slim@sha256:95a34da32a840bd9b3b09a5b773591c16923e350174b1c50e1200c75bf15eaa9
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    git=1:2.47.3-0+deb13u1 \
    ca-certificates=20250419+deb13u1 \
    e2fsprogs=1.47.2-3+b12 \
  && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man \
  && dpkg --purge --force-depends perl perl-modules-5.40 libperl5.40 liberror-perl git-man \
  && git config --system user.name "Coreloom Evals" \
  && git config --system user.email "evals@coreloom-uml.invalid" \
  && git config --system init.defaultBranch main
# No install script runs (`--ignore-scripts`; Codex has none). npm's cache is kept in memory
# (`/dev/shm`) so that the archive and its extracted files are never on the disk together, and the
# voice host (about 45 MB, for the interactive voice mode only) is removed to leave the agent room.
# Owned by root: the agent, which runs as `node`, cannot change its own CLI.
WORKDIR /opt/agent
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund --cache /dev/shm/npm-cache \
  && rm -r /dev/shm/npm-cache \
    node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex-resources/voice \
  && ln -s /opt/agent/node_modules/.bin/codex /usr/local/bin/codex \
  && ln -s /opt/agent/node_modules/.bin/pnpm /usr/local/bin/pnpm \
  && ln -s /opt/agent/node_modules/.bin/pnpx /usr/local/bin/pnpx \
  && codex --version
WORKDIR /
