FROM ubuntu:24.04@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea

ARG NODE_VERSION=24.18.0
ARG NODE_ARCHIVE=node-v24.18.0-linux-x64.tar.xz
ARG NODE_SHA256=55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742
ARG PNPM_VERSION=10.33.0
ARG GO_VERSION=1.25.8
ARG GO_ARCHIVE=go1.25.8.linux-amd64.tar.gz
ARG GO_SHA256=ceb5e041bbc3893846bd1614d76cb4681c91dadee579426cf21a63f2d7e03be6
ARG FOUNDRY_VERSION=1.7.1
ARG FOUNDRY_ARCHIVE=foundry_v1.7.1_linux_amd64.tar.gz
ARG FOUNDRY_SHA256=cf7e688ed0c4c48adffca788b496076e31060b67ac5afe1e43dbb5499c20c88b
ARG SLITHER_VERSION=0.11.6

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      jq \
      python3 \
      python3-venv \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl --fail --location --show-error --silent \
      "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" \
      --output "/tmp/${NODE_ARCHIVE}" \
    && echo "${NODE_SHA256}  /tmp/${NODE_ARCHIVE}" | sha256sum --check --strict \
    && tar --extract --xz --file "/tmp/${NODE_ARCHIVE}" --directory /usr/local --strip-components=1 \
    && rm "/tmp/${NODE_ARCHIVE}" \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN curl --fail --location --show-error --silent \
      "https://go.dev/dl/${GO_ARCHIVE}" \
      --output "/tmp/${GO_ARCHIVE}" \
    && echo "${GO_SHA256}  /tmp/${GO_ARCHIVE}" | sha256sum --check --strict \
    && tar --extract --gzip --file "/tmp/${GO_ARCHIVE}" --directory /usr/local \
    && rm "/tmp/${GO_ARCHIVE}"

RUN curl --fail --location --show-error --silent \
      "https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/${FOUNDRY_ARCHIVE}" \
      --output "/tmp/${FOUNDRY_ARCHIVE}" \
    && echo "${FOUNDRY_SHA256}  /tmp/${FOUNDRY_ARCHIVE}" | sha256sum --check --strict \
    && tar --extract --gzip --file "/tmp/${FOUNDRY_ARCHIVE}" --directory /usr/local/bin \
    && rm "/tmp/${FOUNDRY_ARCHIVE}"

RUN python3 -m venv /opt/slither \
    && /opt/slither/bin/python -m pip install --disable-pip-version-check --no-cache-dir \
      "slither-analyzer==${SLITHER_VERSION}"

ENV PATH="/usr/local/go/bin:/opt/slither/bin:${PATH}"

USER ubuntu
WORKDIR /workspaces/flare-quorum

CMD ["sleep", "infinity"]
