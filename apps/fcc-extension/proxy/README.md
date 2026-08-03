# VeilBid FCC proxy image

This directory contains the release recipe for Flare's official `tee-proxy`.
It does not fork or modify proxy behavior. The Dockerfile downloads the exact
official source commit recorded in `tooling/flare/coston2-foundations.json`,
verifies the source archive checksum, and builds it using digest-pinned builder
and runtime images.

The image intentionally contains no runtime config or credentials. Mount the
machine-specific configuration at `/app/config/config.toml` and inject the
proxy signing key through its configured runtime environment variable. Never
publish port `6661`; only the external port `6662` belongs behind the stable
HTTPS ingress.

When Docker is available, build for the pinned target platform:

```bash
docker build --platform linux/amd64 \
  --file apps/fcc-extension/proxy/Dockerfile \
  --tag veilbid-tee-proxy:coston2 \
  apps/fcc-extension/proxy
```

After the build, record the immutable image digest in the foundation manifest
and rerun `pnpm flare:foundations:collect`. A pinned recipe is not evidence that
the release image was built or deployed.
