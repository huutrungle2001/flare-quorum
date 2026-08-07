# Tender Room

> Runtime note: the default judge path targets the verified Coston2 release when
> its public `VITE_*` configuration is supplied. The `/room` route remains the
> explicitly historical Sepolia/Nox baseline.

VeilBid's browser product. It includes the wallet-free Flare Coston2 explorer,
the dedicated public Activity/Evidence ledger at `/?role=evidence`,
the historical EOA/Safe Buyer flows, Private Bids views for
submission/ownership/granted access, and Activity settlement recovery. The
default `/` and `/flare` routes read finalized Coston2 contract state; `/room`
remains the explicitly historical Sepolia/Nox baseline.
The Flare dossier also exposes sanitized FCC, FTestXRP, FAssets/FXRP, FTSO,
FDC, Smart Account, and award-receipt addresses so a judge can follow each
integration without wallet access or confidential payloads.
When the hosted ingress origin is configured, `/?role=vendor` opens the
Coston2 browser composer: each bid is encrypted separately to the three
tender-frozen TEE keys, authorized with EIP-712, receipt-checked, and submitted
as one atomic receipt set. `/?role=buyer` is the direct EVM funding/recovery
path. An awarded vendor can use the same Coston2 role to approve the exact
FTestXRP amount and submit an official `redeemAmount` request to AssetManagerFXRP;
the later agent payment remains protocol-governed. The XRP-native Smart Account
journey remains a separate server-side executor until its delayed-mint recovery
UI is complete.

It intentionally:

- reads the verified Coston2 market and award-receipt bindings;
- pins public reads to the finalized block and does not scan historical log
  ranges on the Flare judge path;
- waits 12 blocks before indexing events;
- shows explicit loading, empty, and RPC-failure states;
- never inserts mock tenders after a read failure; and
- never indexes bid values, confidential balances, handles, or proofs.

Run it from the repository root with:

```bash
pnpm --filter @veilbid/tender-room dev
pnpm --filter @veilbid/tender-room test
pnpm --filter @veilbid/tender-room build
pnpm test:production https://veilbid-three.vercel.app
pnpm test:flare:production https://veilbid-flare.vercel.app
pnpm test:flare:accessibility https://veilbid-flare.vercel.app
```

`VITE_SEPOLIA_RPC_URL` may override the public read-only RPC. The Coston2 role
composer additionally requires the public `VITE_FLARE_INGRESS_URL` origin; it
does not accept API keys or credentials. Buyer, Vendor,
review, Activity, and Safe writes always require an explicitly connected
wallet. Tender Room does not determine winners or own canonical lifecycle
state.

## Coston2 migration boundary

The Flare consumer adapters are isolated under `src/transactions/flareFunding.ts`
and `src/public-market/loadFlareMarket.ts`. They use the generated Coston2
bindings, require explicit `VITE_COSTON2_RPC_URL`,
`VITE_FLARE_MARKET_ADDRESS`, and `VITE_FLARE_MARKET_DEPLOYMENT_BLOCK`, and fail
closed when a verified release manifest is absent. They do not fall back to
Sepolia data, fabricate FDC proofs, or enable writes from a planned market.
The default `/` and `/flare` routes use the verified Coston2 public market when
configured. A missing or unverified Coston2 configuration fails closed; it never
falls back to Sepolia data on the Flare route.
