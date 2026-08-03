# Contracts

> Historical baseline: this workspace is the completed Sepolia/Nox
> implementation. New Summer Signal contracts belong in the planned
> `packages/flare-contracts` workspace and must not reuse this deployment
> authority.

Canonical Solidity, tests, deployments, verification, and artifact generation
for VeilBid. The VeilBid Market production suite and retained feasibility
spikes share this pinned Hardhat/Nox toolchain while remaining separate source
and test trees.

Workspace ownership:

- `contracts/market/`: confidential tender lifecycle and internal custody.
- `contracts/safe/`: preparation-only Safe integration.
- `contracts/receipt/`: non-transferable award receipt.
- `contracts/test-assets/`: faucet token and official ERC-7984 wrapper extension.
- `contracts/feasibility/`: non-production Gates A–E spike contracts.
- `test/{unit,property,static,sepolia}/`: production verification.
- `test/feasibility/`: isolated gate model, Nox, and Sepolia verification.
- `scripts/`, `verify/`, `deployments/`: canonical deployment workflow.

`pnpm test` compiles once, then runs deterministic production and feasibility
tests. `pnpm test:nox` runs the complete real local Nox suite and requires its
Docker-backed services; Sepolia remains the mandatory confidential-runtime
evidence environment.
