# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# This recipe builds the organizer-directed tee-proxy revision from a
# checksum-pinned official source archive. Keep every value synchronized with
# tooling/flare/coston2-foundations.json; the Gate 0 verifier checks the exact
# recipe before accepting the build inputs.
FROM --platform=linux/amd64 golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS builder

ENV GOTOOLCHAIN=local
WORKDIR /src

ADD --checksum=sha256:e5d355b9b7dcc8daaf51ce7179c6a30cba66a75d9e350d60a04aacf7e91ecb10 \
    https://codeload.github.com/flare-foundation/tee-proxy/tar.gz/2e8412990d150a386a2ee5fdc1d2889a04e658aa \
    /tmp/tee-proxy.tar.gz

RUN tar -xzf /tmp/tee-proxy.tar.gz --strip-components=1 -C /src \
    && rm /tmp/tee-proxy.tar.gz \
    && go mod download \
    && go mod verify

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -mod=readonly -trimpath -buildvcs=false \
    -ldflags="-buildid= -s -w -X github.com/flare-foundation/tee-proxy/internal/version.Revision=2e8412990d150a386a2ee5fdc1d2889a04e658aa -X github.com/flare-foundation/tee-proxy/internal/version.Version=v0.0.18" \
    -o /out/tee-proxy ./cmd/proxy

FROM --platform=linux/amd64 gcr.io/distroless/static-debian12@sha256:20bc6c0bc4d625a22a8fde3e55f6515709b32055ef8fb9cfbddaa06d1760f838

WORKDIR /app
COPY --chmod=0555 --chown=65532:65532 --from=builder /out/tee-proxy /app/tee-proxy

# The runtime config is mounted at /app/config/config.toml. No credential or
# private key is copied into the image; PRIVATE_KEY is supplied at runtime.
USER 65532:65532
EXPOSE 6663 6664
ENTRYPOINT ["/app/tee-proxy"]
