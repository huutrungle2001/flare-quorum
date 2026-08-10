# FCC indexer routing and machine-state response — 2026-08-10

## Context

The project owner supplied a Summer Signal group-chat thread about Coston2
instructions that emitted successfully on-chain but never reached an extension.
This note preserves only the public-safe operational guidance relevant to
FlareQuorum. Shared database credentials and unrelated participant content are
intentionally excluded.

## Organizer guidance

- `SIMULATED_TEE=true` remains accepted on Coston2.
- Status `1` (`INITIALIZED`) is not ready; a healthy machine should normally
  reach status `2` (`PRODUCTION`).
- The extension proxy pulls instructions from the C-chain indexer database; it
  does not discover them from an RPC URL in that proxy configuration.
- The TEE node polls its extension proxy. The proxy's inbound FTDC response port
  is not an instruction-delivery endpoint.
- Operators should compare the active machine set for the extension with each
  public `/info` response. A stale active identity can interfere with routing.
- Pausing a stale identity is not reversible, so the live identity and every
  unfinished tender binding must be checked first.
- If a registered machine has a stale or local-only URL, the owner can update
  its machine settings to the current public origin. A plain registration rerun
  may not rewrite an existing record.
- The pinned stack must use the current scaffold/runtime line, a fresh `rRap`
  challenge, and a stable public URL.

## FlareQuorum interpretation

Registration success is not inferred from a dispatch event, an open TCP port,
or status `1`. FlareQuorum requires the exact three intended identities and
routes to be the extension's complete active set, each machine to be status `2`,
and its public `/info` identity to match the on-chain record. Stale retirement
uses the existing guarded owner-only pause workflow and is forbidden while an
unfinished tender freezes the candidate identity.

Database values remain runtime secrets. This note does not preserve usernames,
passwords, connection strings, private keys, API keys, raw proxy responses,
signatures, ciphertext, or bid material.
