# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# One Railway service represents exactly one simulated Coston2 FCC machine.
# It co-locates the pinned proxy, Redis queue, and byte-identical VeilBid TEE
# binary because Railway does not execute Docker Compose inside a service.

FROM golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS extension-builder

WORKDIR /build
COPY apps/fcc-extension/go.mod apps/fcc-extension/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download && go mod verify

COPY apps/fcc-extension/cmd/ ./cmd/
COPY apps/fcc-extension/internal/ ./internal/
COPY apps/fcc-extension/pkg/ ./pkg/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /out/extension-tee ./cmd/docker

FROM golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS proxy-builder

ENV GOTOOLCHAIN=local
WORKDIR /src

ADD --checksum=sha256:64b74cc37f2e64771244e17ea335d5fc4b5c726b32976b9d548c81c833213984 \
    https://codeload.github.com/flare-foundation/tee-proxy/tar.gz/0c6d016b09948cba9a508ba357e592eb6088fd1c \
    /tmp/tee-proxy.tar.gz

RUN tar -xzf /tmp/tee-proxy.tar.gz --strip-components=1 -C /src \
    && rm /tmp/tee-proxy.tar.gz \
    && go mod download \
    && go mod verify

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -mod=readonly -trimpath -buildvcs=false \
    -ldflags="-buildid= -s -w -X github.com/flare-foundation/tee-proxy/internal/version.Revision=0c6d016b09948cba9a508ba357e592eb6088fd1c -X github.com/flare-foundation/tee-proxy/internal/version.Version=veilbid-coston2-0c6d016b" \
    -o /out/tee-proxy ./cmd/proxy

FROM redis:7-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2

WORKDIR /app
COPY --chmod=0555 --chown=0:0 --from=extension-builder /out/extension-tee /app/extension-tee
COPY --chmod=0555 --chown=0:0 --from=proxy-builder /out/tee-proxy /app/tee-proxy
COPY --chmod=0555 --chown=0:0 apps/fcc-extension/railway/entrypoint.sh /app/entrypoint.sh

ENV MODE=1 \
    CHAIN_ID=114 \
    CONFIG_PORT=5501 \
    SIGN_PORT=7701 \
    EXTENSION_PORT=7702 \
    SEALED_STORE_DIR=/data/sealed \
    LOG_LEVEL=INFO \
    PORT=6662

VOLUME ["/data"]
EXPOSE 6662
ENTRYPOINT ["/app/entrypoint.sh"]
