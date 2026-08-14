# Judge verification

FlareQuorum exposes one verification entry point without changing Coston2
state:

```bash
corepack pnpm judge:verify
```

Run it from the pinned devcontainer when the host does not already provide the
release versions of Node, pnpm, Go, Foundry, and Slither. The command emits one
JSON report to standard output and exits non-zero if any required check is
blocked.

## Verification profiles

Use the offline profile for deterministic repository and release-artifact
checks:

```bash
corepack pnpm judge:verify:offline --output /tmp/flarequorum-offline.json
```

It runs the declared-toolchain check, workspace tests, critical coverage,
typed lint, release build, V2 Slither policy, generated-binding drift check,
documentation check, read-only Git-history secret scan, evidence-schema check,
and judge-package check.

Use the live profile for public Coston2 and hosted-release health:

```bash
corepack pnpm judge:verify:live --output /tmp/flarequorum-live.json
```

It verifies chain ID, deployed market runtime hash, deployment receipt, all
three registered machine statuses and availability windows, the public web
origin, and the public ingress health envelope. Reads against the official
Coston2 RPC are paced and retried without requiring a paid provider.

## Safety boundary

Both profiles are inspection-only. They do not load a deployment key, FCC API
key, wallet signature, credential, bid ciphertext, or plaintext bid. They do
not create a tender, submit a bid, refresh availability, finalize, refund, or
send any other transaction. Endpoint response bodies are evaluated in memory
and are not copied into the sanitized report.

The scheduled
[`Coston2 Read-only Health`](../.github/workflows/coston2-read-only-health.yml)
workflow runs only the live profile with `contents: read`. It has no repository
write permission or secret reference and uploads the public report as a
short-retention Actions artifact. Live-write lifecycle scripts remain manual
and owner-controlled.

## Reading a report

A successful top-level report has `status: "PASSED"` and an empty `blockers`
array. Offline checks record their duration, exit code, and SHA-256 digest of
the command output instead of embedding verbose logs. The live report contains
only public network, contract, transaction, machine availability, and endpoint
status fields.

`BLOCKED` means at least one named assertion could not be verified. It never
causes a mock, Sepolia, cached-success, or invented fallback. Resolve the
reported blocker and rerun the same profile.
