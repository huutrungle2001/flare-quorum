# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Build only the official register-tee operator from the pinned scaffold. The
# scaffold's runtime dependencies are deliberately realigned to the same
# tee-node and go-flare-common revisions as FlareQuorum's Coston2 stack.
FROM --platform=linux/amd64 golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS builder

ENV GOTOOLCHAIN=local
WORKDIR /src

ADD --checksum=sha256:ff2c61c5054ebb6636539db0417e41565d6c8afd24368f8b54578c32503290d4 \
    https://codeload.github.com/flare-foundation/fce-extension-scaffold/tar.gz/f48cafb889441a62e47c083f4be8dd7d3f456f83 \
    /tmp/fcc-scaffold.tar.gz

RUN tar -xzf /tmp/fcc-scaffold.tar.gz --strip-components=1 -C /src \
    && rm /tmp/fcc-scaffold.tar.gz \
    && cd /src/tools \
    && go mod edit -go=1.25.8 \
    && go mod edit -require=github.com/flare-foundation/tee-node@v0.0.23 \
    && go mod edit -require=github.com/flare-foundation/go-flare-common@v1.2.2-0.20260727094511-09a10067e6a4 \
    && go get ./cmd/register-tee \
    && go mod verify

RUN cd /src/tools \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -mod=readonly -trimpath -buildvcs=false \
    -ldflags="-buildid= -s -w" -o /out/register-tee ./cmd/register-tee

FROM --platform=linux/amd64 gcr.io/distroless/static-debian12@sha256:20bc6c0bc4d625a22a8fde3e55f6515709b32055ef8fb9cfbddaa06d1760f838

WORKDIR /app
COPY --chmod=0555 --chown=65532:65532 --from=builder /out/register-tee /app/register-tee

# Addresses and resumable state are mounted at runtime. The deployment key is
# injected only as DEPLOYMENT_PRIVATE_KEY by the operator command.
USER 65532:65532
ENTRYPOINT ["/app/register-tee"]
