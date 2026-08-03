# Public verification evidence

`evidence/sepolia/` and the existing `evidence/local/` files are historical
pre-hackathon baseline. New Flare evidence will be written to
`evidence/coston2/` only after the corresponding live gate runs.

Only sanitized JSON validated by `pnpm evidence:validate` may be committed here.
Never store bid values, confidential balance values, handles, proofs, wallet
signatures, seed material, private keys, or full RPC responses.

Local secret-bearing or diagnostic artifacts belong under ignored `.local/`.
