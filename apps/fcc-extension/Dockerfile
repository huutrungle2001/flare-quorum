# syntax=docker/dockerfile:1.7
FROM golang:1.25.8-alpine@sha256:8e02eb337d9e0ea459e041f1ee5eece41cbb61f1d83e7d883a3e2fb4862063fa AS builder

ARG SOURCE_DATE_EPOCH=0
WORKDIR /build

COPY --chmod=644 --chown=0:0 go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download && go mod verify

COPY --chmod=644 --chown=0:0 cmd/ ./cmd/
COPY --chmod=644 --chown=0:0 internal/ ./internal/
COPY --chmod=644 --chown=0:0 pkg/ ./pkg/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /app/extension-tee ./cmd/docker
RUN if [ "${SOURCE_DATE_EPOCH}" -gt 0 ] 2>/dev/null; then find /app -exec touch -h -d @${SOURCE_DATE_EPOCH} {} +; fi

FROM gcr.io/distroless/static-debian12@sha256:20bc6c0bc4d625a22a8fde3e55f6515709b32055ef8fb9cfbddaa06d1760f838

WORKDIR /app
COPY --chmod=755 --chown=0:0 --from=builder /app/extension-tee /app/extension-tee

# Production attestation is the safe image default. Local simulation must opt in with MODE=1.
ENV MODE=0 CONFIG_PORT=5501 SIGN_PORT=7701 EXTENSION_PORT=7702
USER 0:0
LABEL "tee.launch_policy.allow_env_override"="LOG_LEVEL,PROXY_URL,INITIAL_OWNER,EXTENSION_ID,CHAIN_URL,MODE,CONFIG_PORT,SIGN_PORT,EXTENSION_PORT"
EXPOSE 5501 7701 7702
CMD ["/app/extension-tee"]
