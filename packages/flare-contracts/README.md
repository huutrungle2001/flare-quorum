# VeilBid Flare contracts

This package contains only the Coston2/Flare implementation. The historical
Sepolia/Nox contracts remain isolated in `packages/contracts`.

Implemented and locally verified:

- `VeilBidFoundationSender`: the public-safe Gate A compatibility sender;
- `VeilBidFlareMarket`: exact FTestXRP-style ERC-20 escrow, three production
  TEE/code/public-key binding through the live manager interface, two-receipt
  common quorum, close-time FTSO snapshot, FCC selection request, canonical
  `TEE_ACTION_RESULT` verification, and award/refund conservation;
- `VeilBidFlareAwardReceipt`: a non-transferable public award record binding
  the winner, payout, rules hash, ordered root, and exact selection-result
  digest. Refunds never mint a receipt.

These contracts are not a verified Coston2 release yet. The test suite uses
local protocol mocks and deterministic Foundry keys only. Deployment addresses
must not be published until the live extension, manager wiring, runtime
bytecode, constructor arguments, and end-to-end evidence pass.

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
a sanitized `verified:false` Coston2 candidate manifest and deployment evidence;
promotion remains blocked until live Gates F–H pass.
