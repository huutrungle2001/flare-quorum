# FCC TEE replacement recovery — organizer response, 2026-08-08

## Context

VeilBid asked the Flare Summer Signal organizer to confirm the supported
Coston2 recovery procedure when a simulated FCC container restart creates a
new TEE identity. The question referenced chain `114`, extension `66011`, and
explicitly rejected exporting or patching TEE private keys.

## Public-safe response summary

The organizer confirmed:

- a new TEE identity after container or process restart is expected;
- identity is not persisted or restored across restarts;
- recovery means starting and registering a replacement TEE through the normal
  registration, attestation, availability-check, and production flow;
- the replacement may use the same extension and approved code configuration;
- the same public endpoint may be reused when it resolves to the replacement;
- the stale identity should be removed from production rotation; and
- supported fault drills follow the same replacement process without runtime
  patches or external TEE-key management.

## VeilBid interpretation

This confirms platform recovery but does not let a replacement decrypt bid
ciphertext addressed to the old key. VeilBid therefore never substitutes a new
identity into an already-open tender's frozen set. One frozen-machine loss
retains the designed two-of-three selection quorum; two losses fail closed.
Replacement machines restore capacity for subsequent tenders.

No credential, private key, attestation payload, signature, ciphertext, or bid
material is included in this note.
