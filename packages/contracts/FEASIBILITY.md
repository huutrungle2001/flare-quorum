# VeilBid feasibility suite

> Historical baseline: these gates validated Nox, ERC-7984, and Safe on
> Sepolia. They do not satisfy the new FCC feasibility gates in
> `docs/feasibility-plan.md`.

This isolated suite inside `packages/contracts` executes Feasibility Gates A–E.
It shares the pinned Solidity/Nox toolchain with production contracts but is not
a production runtime or deployment authority.

Requirements:

- Node.js 24, pinned by the root `.nvmrc`.
- pnpm 10.33.0 through Corepack.
- `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in the ignored root `.env.local`
  for live feasibility runs.
- Docker Engine with Compose support only for optional local Nox regression
  runs.

The workspace never substitutes a mock result when the Nox runtime, RPC, or
credentials are unavailable. Evidence records only public identifiers,
assertion booleans, tool versions, and blocker codes.
