# FCC availability keeper

This Railway cron service checks the exact three V2 Coston2 FCC machine
bindings once per hour. It renews a production identity only when its current
availability check is at least four hours old, leaving a two-hour safety margin
before the six-hour FCC validity limit.

The operator fails closed on identity, extension, URL, code, platform, public
key, active-set, status, or availability-window drift. It uses a fresh `Ra`
proof plus `confirmAvailability` for a production identity, then exits. Railway
skips an overlapping invocation rather than starting a second copy.

Required runtime variables are documented in `docs/deployment.md`. The
deployment key is a server-side Coston2 testnet operator secret and must never
be copied into an image, repository file, `VITE_*` variable, log, or evidence.
