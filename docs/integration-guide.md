# FlareQuorum integration guide

This guide is for an XRP treasury, procurement team, or wallet/infrastructure
partner that wants to integrate the verified Coston2 release without taking
custody of a vendor bid or an XRPL secret.

## What the integration provides

FlareQuorum exposes one public procurement lifecycle:

1. A buyer publishes a Buyer Brief and a complete scoring policy, then escrows
   public FTestXRP on Flare Coston2.
2. An approved vendor encrypts a bid in the browser to the three tender-frozen
   FCC machines. The server receives ciphertext only and returns TEE-signed
   receipts.
3. The market admits one atomic receipt set, closes against the recorded FTSO
   snapshot, and asks FCC to select from sealed state.
4. Two distinct frozen TEE identities must sign the same bound result before
   the market pays the winner and conserves the remainder.
5. The awarded vendor can request the official FAssets redemption amount. The
   later agent payment is governed by FAssets; FlareQuorum never receives an XRPL
   secret and does not promise instant native-XRP payout.

FCC is the selection boundary, FTSO supplies the close-time XRP/USD snapshot,
FDC proves the XRPL payment for the Smart Account funding path, Smart Account
opcode `0xFE` performs the buyer batch, and FAssets define the FXRP/FTestXRP
asset boundary. Removing any of these integrations changes the demonstrated
journey.

## Public release facts

- Network: Flare Coston2, chain ID `114`.
- Market, award receipt, FTestXRP, FCC manager, extension, and feed identifiers
  are maintained in [`packages/flare-contracts/deployments/coston2.release.json`](../packages/flare-contracts/deployments/coston2.release.json).
- The wallet-free judge route is [`veilbid-flare.vercel.app`](https://veilbid-flare.vercel.app).
- Public evidence is indexed from [`evidence/coston2/`](../evidence/coston2/);
  it contains commitments, hashes, statuses, blocks, and assertion booleans,
  never bids, ciphertext, credentials, or keys.

## Browser integration

The browser needs only public Coston2 configuration:

```dotenv
VITE_COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
VITE_FLARE_MARKET_ADDRESS=0x<verified-market>
VITE_FLARE_MARKET_DEPLOYMENT_BLOCK=<verified-block>
VITE_FLARE_INGRESS_URL=https://<verified-ingress-origin>
```

`VITE_FLARE_INGRESS_URL` is an origin, not a proxy credential. The browser
never receives FCC direct API keys, indexer credentials, TEE keys, FDC
credentials, or an XRPL seed. A vendor integration should call the ingress in
this order:

```text
GET  /flare/ingress/tenders/{tenderId}/machines
POST /flare/ingress/bids                    (once per frozen machine)
GET  /flare/ingress/tenders/{tenderId}/machines/{machineIndex}/results/{actionId}
POST the three verified receipts to FlareQuorum's market contract
```

The machine discovery response contains only public encryption keys and frozen
binding facts. The bid request is an EIP-712-authorized opaque ciphertext
envelope. A pending or malformed proxy result is not a bid receipt and must
not be submitted on-chain. The browser must discard plaintext and ciphertext
after the request; it must not use localStorage, analytics, query strings, or
public logs for bid material.

## Buyer and settlement integration

The EVM recovery path uses a connected Coston2 wallet to approve the exact
FTestXRP ceiling and call `createTender` with the complete Buyer Brief hash,
approved vendor list, rules, FCC extension, code hash, three TEE identities,
and key fingerprints. The wallet must show the user the public fields before
signing. The contract derives and stores `rulesHash`; a caller cannot supply a
detached rules hash.

The flagship XRP-native path is server-side and non-custodial:

- The user sends a public XRPL testnet payment containing the exact `0xFE`
  Smart Account user-operation commitment.
- The dedicated executor waits for XRPL validation, requests the official FDC
  `XRPPayment` proof, and calls the official direct-minting route.
- The executor reports success only after the AssetManager, Smart Account, and
  market events agree. `DirectMintingDelayed` is a non-success checkpoint.
- `pnpm flare:funding:resume` reuses the original public checkpoint, FDC
  request, and nonce; it never asks for a second XRPL payment and fails closed
  on quote, domain, or nonce drift.

The executor is not a generic relayer. It accepts a strict public-safe job and
uses a dedicated disposable Coston2 key. It must not be replaced with a
deployer key, browser private key, or arbitrary calldata endpoint.

The Buyer workspace reads the current AssetManager payment destination and
fee settings, then prepares a public wallet-ready XRPL Payment draft with the
exact UBA amount and 42-byte `0xFE` memo. A buyer may either copy that draft to
an external wallet or use the optional GemWallet browser integration. The
integration first verifies XRPL Testnet and the wallet address, asks the wallet
to show/sign/submit the exact public Payment, and returns only its public
transaction ID. FlareQuorum never receives an XRPL secret or signed private
material. If the follow-up Coston2 read is temporarily unavailable, the hash
stays in the form so the buyer can retry preparation without sending a second
payment. The dedicated server-side executor boundary above remains unchanged.

## Server deployment boundary

Run the hosted ciphertext ingress as a separate server process:

```bash
pnpm --filter @veilbid/settlement-relay build
pnpm flare:ingress
```

The server needs exactly three HTTPS FCC origins, matching direct API keys,
the verified FCC manager, and one exact HTTPS browser origin. Store those
values in the host secret manager or an owner-only local `.env.local`; never
put them in `VITE_*`, a Docker image, a request log, or evidence. The public
health route may expose service name, schema version, chain ID, and readiness,
but not credentials or upstream response bodies.

For a read-only finalizer/inspector, use `pnpm flare:relay:health` or the
hosted `/health` endpoint. Write settlement requires the verified release,
three production-status machines, a dedicated finalizer key, and an explicit
action budget. Unavailable FCC, FDC, RPC, FTSO, or indexer state remains
pending or delayed; integrations must not substitute a mock winner, price,
proof, or chain state.

## Verification checklist for partners

Before connecting a partner UI or relay, verify:

- chain ID is `114` and all addresses come from the verified release manifest;
- the public route loads without a wallet and shows a finalized Coston2 tender;
- the ingress machine order matches the three tender-frozen identities;
- a bid is encrypted before transport and only three signed receipts reach the
  contract;
- finalization requires two distinct signatures over identical result bytes;
- public evidence contains no bid payload, credential, key, or raw proof; and
- failure or delay is visible and recoverable from a public checkpoint.

The reference implementation and sanitized live evidence are the authority for
the current protocol. Historical Sepolia/Nox packages under `packages/contracts`
and `evidence/sepolia` are not Flare integration inputs.
