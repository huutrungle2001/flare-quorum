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
