# FCC on Coston2 — known-good setup clarification (2026-08-12)

This sanitized source note preserves the project-owner-supplied FCC Q&A. It
contains no credentials. When it conflicts with the older 2026-08-10 routing
note, this newer clarification wins.

## Deployment and versions

- Live Coston2 `FlareTeeManager`:
  `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`.
- Pull the latest `main` of the official scaffold and use the dependency
  versions it pins. Do not independently mix the latest `tee-node`,
  `tee-proxy`, and `go-flare-common` versions.
- `SIMULATED_TEE=true` is supported on Coston2 for the hackathon.

## Instruction delivery

- An on-chain dispatch event does not prove delivery.
- The selected machine must have status `2` (`PRODUCTION`), an availability
  check younger than six hours, a registered `teeId`, and a stable public HTTPS
  URL with a valid certificate.
- Providers POST the cosigned instruction directly to the registered proxy at
  `/instruction` on external port `6664`. The proxy does not discover
  instructions from the indexer.
- Each dispatch selects one machine. A stale or broken identity under the same
  extension can therefore cause intermittent failures.
- Use one active machine identity per public endpoint even though the registry
  technically permits several.

## Restart recovery

A restart creates a new TEE identity; the key is not persisted in simulated or
production mode. Recovery is restart, verify the new identity, re-register it,
reach `PRODUCTION`, then pause the stale identity. There is no supported flow to
restore the old `teeId`.

## Public URL and operation type

- Register a stable public HTTPS hostname. Do not use a temporary
  Cloudflare/ngrok URL that changes after restart.
- Provider source IPs cannot be globally allowlisted.
- Operation types beginning with `F_` are reserved. Custom non-`F_` operation
  types are allowed.

## Diagnosis

- A `404` from an FTDC proxy does not automatically mean that proxy is down. A
  recent action may never have reached it; delivered actions may show
  signatures accumulating while providers process them.
- Coston2 FTDC proxies are
  `https://tee-proxy-coston2-1.flare.rocks` (primary) and
  `https://tee-proxy-coston2-2.flare.rocks` (fallback).
- Expected indexer lag is effectively zero. On the indexer readiness endpoint,
  `GET :6661/ready`, `200` means the indexer is current; `503` containing a
  C-chain indexer-delay message means it is actually behind. Missing log rows
  alone do not prove lag because only selected contracts/topics are indexed.
- Useful checks are the on-chain dispatch, machine status and registered URL,
  availability freshness, proxy `/info`,
  `/action/status/<epoch>/<instruction-id>`, and the
  `instructions_received`/`instructions_rejected` metrics.
- There is currently no public per-provider delivery-attempt/HTTP-response
  query. That detail remains in provider logs.

If escalation is needed, share only public-safe identifiers: extension ID,
`teeId`, dispatch transaction, registered URL, machine status, and action-status
result. Do not share credentials, private keys, bid payloads, or raw secrets.
