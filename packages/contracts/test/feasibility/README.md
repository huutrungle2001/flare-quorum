# Feasibility spike tests

These non-production tests preserve the approved Gates A–E feasibility suite
inside the shared contracts workspace. The TypeScript tests use the official
Nox Hardhat plugin, while the `.mjs` tests cover deterministic models and static
authority checks.

Run `pnpm --filter @flarequorum/auction-house test:feasibility` for deterministic
checks or `pnpm --filter @flarequorum/auction-house test:feasibility:nox` when the
supported Nox runtime is available. Sepolia scripts live in `sepolia/`.

Plaintext values may be asserted in process memory but must never be written to
committed evidence or logs. Passing these tests does not make any contract in
`contracts/feasibility/` deployable production code.
