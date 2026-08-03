# syntax=docker/dockerfile:1.7
# This recipe builds the organizer-directed tee-proxy revision from a
# checksum-pinned official source archive. Keep every value synchronized with
# tooling/flare/coston2-foundations.json; the Gate 0 verifier checks the exact
# recipe before accepting the build inputs.
FROM --platform=linux/amd64 golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS builder

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

FROM --platform=linux/amd64 gcr.io/distroless/static-debian12@sha256:20bc6c0bc4d625a22a8fde3e55f6515709b32055ef8fb9cfbddaa06d1760f838

WORKDIR /app
COPY --chmod=0555 --chown=65532:65532 --from=builder /out/tee-proxy /app/tee-proxy

# The runtime config is mounted at /app/config/config.toml. No credential or
# private key is copied into the image; PRIVATE_KEY is supplied at runtime.
USER 65532:65532
EXPOSE 6661 6662
ENTRYPOINT ["/app/tee-proxy"]
