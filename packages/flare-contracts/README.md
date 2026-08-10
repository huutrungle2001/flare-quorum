# FlareQuorum contracts

This package contains only the Coston2/Flare implementation. The historical
Sepolia/Nox contracts remain isolated in `packages/contracts`.

Implemented and locally verified:

- `VeilBidFoundationSender`: the historical deployed-but-unregistered Gate A
  compatibility sender retained for evidence reproduction;
- `VeilBidFoundationSenderV2`: the fresh-registration sender whose explicit,
  owner-only extension-ID binding is constant-time and registry-verified;
- `VeilBidFlareMarket`: exact FTestXRP-style ERC-20 escrow, three production
  TEE/code/public-key binding through the live manager interface, two-receipt
  common quorum, close-time FTSO snapshot, FCC selection request, canonical
  `TEE_ACTION_RESULT` verification, and award/refund conservation;
- `VeilBidFlareAwardReceipt`: a non-transferable public award record binding
  the winner, payout, rules hash, ordered root, and exact selection-result
  digest. Refunds never mint a receipt.

The Coston2 release is now verified in
`deployments/coston2.release.json`. The test suite still uses local protocol
mocks and deterministic Foundry keys for fast feedback; live extension,
manager-wiring, runtime-bytecode, constructor, and end-to-end checks are kept
in sanitized `evidence/coston2/` records and must be rerun for any new
deployment.

Never register the V1 foundation sender. A fresh Gate-A run deploys V2,
registers that exact address, and calls `setExtensionIdExplicit` with the ID
returned by the live registry.

```bash
forge test
forge fmt --check
forge build --sizes
```

After live Gates 0–E are recorded as `PASS`, deploy the immutable market with:

```bash
pnpm flare:deploy:market
```

The command refuses a dirty worktree, missing/partial gate evidence, wrong
chain, low gas balance, missing protocol bytecode, or an existing deployment
artifact. It verifies constructor calldata, masks only compiler-declared
immutable slots for a full runtime-logic comparison, then checks every
immutable getter plus the separately deployed award-receipt binding. It writes
a sanitized `verified:false` Coston2 candidate manifest and deployment
evidence. `pnpm flare:release:promote` promotes only after the live
release-consistency, FCC, FTestXRP, FTSO, and Smart Account evidence passes;
the canonical manifest is now `verified:true`, with Gate H product hardening
tracked separately.
