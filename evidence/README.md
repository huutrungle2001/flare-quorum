# Public verification evidence

`evidence/sepolia/` and the existing `evidence/local/` files are historical
pre-hackathon baseline. New Flare evidence will be written to
`evidence/coston2/` only after the corresponding live gate runs.

Only sanitized JSON validated by `pnpm evidence:validate` may be committed here.
Never store bid plaintext or ciphertext, credentials, salts, sealed TEE state,
private balance material, ingress bodies/headers, private-wallet or XRPL
signatures, seed material, private keys, secrets, or full provider responses.

The championship evidence may record public commitments, receipt/common-quorum
bitmaps, extension/code/machine identities, FTSO snapshot, FCC result signatures,
XRPL transaction ID, FDC proof/request identifiers, Smart Account sender/nonce
and user-operation hash, winner, public FTestXRP amount, and transactions. A
schema must allowlist these fields and reject confidential fields.

Local secret-bearing or diagnostic artifacts belong under ignored `.local/`.
