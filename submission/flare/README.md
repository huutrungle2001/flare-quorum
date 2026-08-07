# VeilBid Flare — Judge Package

This folder is the Summer Signal submission material for the Flare v2 release.
The files in the parent `submission/` folder describe the historical
Ethereum Sepolia/Nox release and must not be used as evidence for this package.

## Start here

| Resource | Link |
| --- | --- |
| Live app | [veilbid-flare.vercel.app](https://veilbid-flare.vercel.app) |
| Public evidence ledger | [Coston2 Activity/Evidence view](https://veilbid-flare.vercel.app/?role=evidence) |
| Buyer workspace | [Coston2 Buyer](https://veilbid-flare.vercel.app/?role=buyer) |
| Vendor workspace | [Coston2 Vendor](https://veilbid-flare.vercel.app/?role=vendor) |
| Technical docs | [Flare docs](https://veilbid-flare.vercel.app/docs#flare-coston2) |
| Source | [github.com/huutrungle2001/veilbid-flare](https://github.com/huutrungle2001/veilbid-flare) |
| Hosted ingress health | [Railway `/health`](https://veilbid-flare-ingress-production.up.railway.app/health) |

The app and ingress use Coston2 chain ID `114` and test assets only. A wallet is
not needed to inspect the finalized public state. Buyer/vendor writes require
an explicit Coston2 wallet connection; no private key, XRPL secret, TEE key, or
proxy credential is requested by the browser.

## One-line submission copy

> VeilBid lets XRP treasuries fund public procurement rules from Flare Coston2,
> while three registered FCC TEEs privately score encrypted vendor offers and
> the market accepts only a matching threshold result before paying the winner
> in FTestXRP.

## Selected bounty

- **Primary:** Confidential Compute Apps.
- **Interoperable Asset Products:** a credible secondary fit only where the
  judge follows the recorded XRPL → FDC `XRPPayment` → Smart Account direct
  mint → FTestXRP tender journey, then the winning Coston2 wallet can submit an
  official amount-based FAssets redemption request. The agent's later XRPL
  payment remains protocol-governed; VeilBid never holds an XRPL secret.

FCC is essential: the winner is computed from sealed bid state inside the
  registered extension, not supplied by the browser, buyer, or relay. FTSO is
  essential for the close-time XRP/USD snapshot. FDC and Smart Accounts are
  essential for the XRP-native funding path. FAssets are the official asset
  boundary and redemption route; VeilBid never receives an XRPL secret.

## Judge route (no wallet)

1. Open the [public dossier](https://veilbid-flare.vercel.app/).
2. Read the verified FCC manager, extension `66011`, code version `v0.2.2`,
   three machine fingerprints, FTestXRP, FTSO, FDC, FAssets, and Smart Account
   bindings.
3. Open [Activity/Evidence](https://veilbid-flare.vercel.app/?role=evidence)
   and inspect the finalized checkpoint ledger. It exposes rules hash, receipt
   quorum, ordered root, FTSO snapshot, FCC binding, and award/refund state; it
   never fetches bid payloads.
4. Open the awarded Coston2 tender and follow the public market and award
   receipt contracts in the explorer.
5. Use the [Flare docs](https://veilbid-flare.vercel.app/docs#flare-coston2) to
   distinguish the current release from the historical `/room` Sepolia app.

## Verified public deployment

| Fact | Value |
| --- | --- |
| Network | Flare Coston2 / chain `114` |
| Market | [`0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05`](https://coston2-explorer.flare.network/address/0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05) |
| Award receipt | [`0x338Ea3e35F4c5E7dad02B9DEC333ecc76aCD25E5`](https://coston2-explorer.flare.network/address/0x338Ea3e35F4c5E7dad02B9DEC333ecc76aCD25E5) |
| FTestXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| FCC manager | [`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`](https://coston2-explorer.flare.network/address/0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE) |
| Extension | `66011` · `v0.2.2` · code hash `0x194844cf…10fdc2` |
| Verified release manifest | [`packages/flare-contracts/deployments/coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json) |

The live amount-based FAssets redemption request is recorded in
[`fassets-redemption.release.json`](../../evidence/coston2/fassets-redemption.release.json)
with the approval and `RedemptionRequested` transaction hashes. It proves the
request boundary and public agent obligation, not an instant underlying XRP
payment.

### Featured recovery lifecycle

The live three-vendor recovery run is tender `21`. The result endpoint for one
machine was intentionally unavailable during result collection; the two
remaining tender-frozen machines signed the same result and finalization passed.
This is result-collection recovery evidence, not a claim that a simulated TEE
identity survives a container restart.

- Evidence: [`three-vendor-recovery.release.json`](../../evidence/coston2/three-vendor-recovery.release.json)
- Finalization: [`0x9b9003…47403`](https://coston2-explorer.flare.network/tx/0x9b9003a5597deb8e5396a48f5962bfab2cc4dd518188b4bff58ce0dee8c47403)
- Tender creation: [`0xa12539…6273`](https://coston2-explorer.flare.network/tx/0xa12539b4bf1b48eee7e5d6a4df3c07ff2a18197ae7f433d9ca712895d7df6273)
- Selection request: [`0x07e539…06ca`](https://coston2-explorer.flare.network/tx/0x07e539757d55c592f857eda642e56f5388069f9c331dca6e606dc1ff21bc06ca)

The public evidence contains only addresses, hashes, blocks, statuses, and
assertion booleans. Bid plaintext, ciphertext, salts, raw signatures, and
credentials are not committed.

## Architecture in one picture

```mermaid
flowchart LR
  XRPL[XRPL testnet payment\n0xFE user-op memo] --> FDC[FDC XRPPayment proof]
  FDC --> SA[Smart Account\ndirect mint]
  SA --> M[VeilBidFlareMarket\npublic FTestXRP escrow]
  V[Vendor browser\nECIES ciphertext] --> G[Hosted ingress\nRailway, no bid storage]
  G --> T1[TEE 1]
  G --> T2[TEE 2]
  G --> T3[TEE 3]
  T1 --> R[Signed bid receipts\ncommon ordered root]
  T2 --> R
  T3 --> R
  R --> M
  M --> F[FTSO XRP/USD snapshot\nat close]
  F --> S[FCC selection\nprivate scoring]
  S --> Q[2-of-3 matching result signatures]
  Q --> M
  M --> A[Public winner + FTestXRP\naward receipt / refund]
  A -.-> X[Official FAssets redemption request\nVeilBid never holds XRPL secret]
```

## Four-minute demo storyboard

This is the recording script. It is intentionally bounded to the single
flagship story; it does not imply that a recording has already been made.

| Time | Screen and narration | Judge proof |
| --- | --- | --- |
| `0:00–0:25` | Open the public Coston2 dossier. “VeilBid makes a procurement decision private, not unverifiable.” | Chain `114`, verified release, market address |
| `0:25–0:55` | Open Activity/Evidence. Explain public rules hash, root, receipt quorum, FTSO snapshot, and why losing prices are absent. | Finalized tender ledger; no wallet and no payload |
| `0:55–1:30` | Show Buyer workspace and the exact FTestXRP approval/create flow. Then show Vendor workspace with the explicit Coston2 wallet gate. | No silent authorization; no mainnet asset |
| `1:30–2:10` | Show a sealed bid submission as three separate encrypted ingress requests and receipt quorum. | Hosted ingress health, three frozen TEE identities, atomic receipt submission |
| `2:10–2:55` | Follow close, FTSO snapshot, FCC scoring, two matching result signatures, and finalization. | Tender `21` transactions and recovery evidence |
| `2:55–3:25` | Open the award receipt and explain public winner/amount versus private losing bids. | Coston2 explorer and receipt contract |
| `3:25–3:50` | Show the XRPL/FDC/Smart Account evidence and the live amount-based FAssets redemption request boundary. | Gate G + `fassets-redemption.release.json`; no custody or instant-payout claim |
| `3:50–4:00` | State limitations: simulated TEE, testnet, unaudited, restart recovery and user validation remain open. | Honest threat-model boundary |

## Reproduction and validation

From the repository root, with local secrets already configured (never paste
them into a submission or chat):

```bash
pnpm test
pnpm lint
pnpm build
pnpm evidence:validate
pnpm flare:judge:check
pnpm test:flare:production
pnpm test:flare:accessibility
```

The live lifecycle harnesses are explicit `--execute` commands and write only
sanitized evidence. Do not rerun a write lifecycle casually; use the existing
public evidence for the judge route.

## What is complete versus still open

Complete and live: Coston2 market/runtime verification, three production-status
FCC machines, encrypted ingress, receipt quorum, FCC private scoring, FTSO
binding, threshold finalization, FTestXRP conservation, Gate G XRP/FDC/Smart
Account funding, fail-closed delayed-mint checkpoint/resume in the funding
executor, hosted ingress health/result API, public Evidence workspace, and
Vercel smoke/accessibility evidence.

Still open and deliberately not overstated: same-identity simulated-TEE
restart recovery, browser-native XRP funding/recovery UI, adversarial/recovery
breadth beyond the recorded drill, structured buyer/vendor interviews, pilot
evidence, and the final video recording. The redemption request is live; the
underlying agent payout remains an external FAssets protocol obligation.
