# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM --platform=linux/amd64 golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS registration

ENV GOTOOLCHAIN=local
WORKDIR /src

ADD --checksum=sha256:b0bc98f6c3c74ab19cd46f245d3f7baa20cc824e6f43692921c0bf4e789e1a9e \
    https://codeload.github.com/flare-foundation/fce-extension-scaffold/tar.gz/e3f587949069780084e2ced8a53c9419ed05c250 \
    /tmp/fcc-scaffold.tar.gz

RUN tar -xzf /tmp/fcc-scaffold.tar.gz --strip-components=1 -C /src \
    && rm /tmp/fcc-scaffold.tar.gz \
    && cd /src/tools \
    && go mod download \
    && go mod verify \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
       go build -mod=readonly -trimpath -buildvcs=false \
       -ldflags="-buildid= -s -w" -o /out/register-tee ./cmd/register-tee

FROM --platform=linux/amd64 node:24-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a

LABEL org.opencontainers.image.title="FlareQuorum FCC availability keeper"

ENV NODE_ENV=production \
    FCC_REGISTRATION_BINARY_PATH=/usr/local/bin/register-tee \
    FCC_RELEASE_PROFILE=v2 \
    FCC_REFRESH_MACHINE_AVAILABILITY=true
WORKDIR /app

COPY --chown=node:node . .
RUN corepack enable \
    && corepack pnpm install --frozen-lockfile --prod=false \
    && mkdir -p /app/.local/fcc \
    && chown -R node:node /app/.local

COPY --from=registration --chmod=0555 /out/register-tee /usr/local/bin/register-tee
RUN echo "71ccae716c373a3584e8de49aa44e962ade34b489b45836ec6922a70c464d206  /usr/local/bin/register-tee" \
    | sha256sum -c -

USER node
CMD ["node", "tooling/scripts/register-fcc-machines.mjs", "--execute"]
