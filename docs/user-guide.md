# VeilBid Flare Championship User Guide

> Status: target Coston2 experience. The checked-in app still serves the
> historical Sepolia baseline until the Flare gates and verified release pass.

## 1. What the product will do

VeilBid lets an XRP-native or Flare treasury escrow a public FTestXRP budget
while vendors keep price, delivery, warranty, and qualification inputs private.
A fixed quorum of registered FCC TEEs evaluates the public deterministic rule.
The contract accepts only two matching TEE results, then publicly pays the
winner and returns the remainder.

The product hides neither vendor participation nor the final winner/winning
amount. It provides TEE-backed confidentiality and threshold agreement, not
anonymity or a zero-knowledge proof.

## 2. Judge and public observer

The wallet-free judge path must let a reviewer:

1. Open a finalized Coston2 tender and identify its buyer, approved vendors,
   public ceiling, deadline, scoring rule, and FTestXRP asset.
2. Inspect the extension/code version, three machine fingerprints, 2-of-3
   threshold, receipt bitmaps, common quorum, and ordered commitment root.
3. Inspect the close-time XRP/USD FTSO snapshot used for USD quotes.
4. Verify that two distinct tender-fixed TEEs signed the exact same result
   digest and that tampered/replayed examples fail.
5. Confirm the public winner, FTestXRP payout, buyer remainder/refund, receipt,
   and escrow conservation.
6. Follow the XRPL payment, FDC proof, Smart Account user-operation, direct mint,
   and funding trail for the flagship tender.
7. Compare the page with sanitized release evidence without seeing a bid or
   encrypted payload.

Until this live path exists, all Flare screens remain labeled planned or
unverified and the Sepolia app remains a pre-hackathon baseline.

## 3. Network and safety

- Use Flare Testnet Coston2, chain ID `114`, and disposable test identities.
- Buyers use XRPL testnet for the flagship funding journey; vendors use a
  disposable Coston2 EVM wallet to authenticate submissions and transactions.
- Use only the release-discovered official FTestXRP/FAssets, FTSO, FCC, FDC, and
  Smart Account interfaces.
- Never enter an EVM private key, XRPL secret, seed, TEE key, proxy credential,
  or indexer credential in the web app.
- Account, network, market, tender, extension, code, rules, or machine-key
  changes clear all session-only bid input and invalidate an unsent payload.

## 4. XRP treasury buyer flow

1. Select `XRP TREASURY` and derive the deterministic Flare PersonalAccount and
   its current nonce.
2. Define public tender metadata, FTestXRP ceiling, deadline, approved vendors,
   allowed XRP/USD quote currencies, credential policy, and fixed
   price/delivery/warranty weights.
3. Review the extension, code version, three TEE identities/key fingerprints,
   result threshold, FTSO feed, and which fields become public.
4. Let the app build one `PackedUserOperation` containing FTestXRP approval plus
   atomic tender creation/funding.
5. Commit that operation hash in the supported XRPL `0xFE` payment memo.
6. Wait for the FDC `XRPPayment` proof and Smart Account
   `executeDirectMintingWithData` transaction.
7. Confirm that FXRP was minted and the exact ceiling reached the market in the
   same successful execution before the tender becomes `Open`.
8. Monitor public receipt participation and quorum health without seeing bids.
9. After finalization, confirm winner payout, buyer remainder, receipt, and the
   full public audit trail.

The app never asks for the buyer's XRPL secret and never holds an autonomous
buyer signer. Direct EVM funding is a clearly labeled recovery/developer route.

## 5. Vendor flow

1. Connect the approved Coston2 address and open an `Open` tender.
2. Verify market, buyer, deadline, ceiling, rules, extension/code, three machine
   fingerprints, common threshold, and official release status.
3. Enter quote currency, price, delivery days, warranty days, and supported
   signed credentials in the current browser session.
4. Review the canonical commitment locally; the random salt prevents practical
   enumeration of low-range values.
5. Encrypt separately to each selected TEE key and send through the authenticated
   private-ingress path. Neither plaintext nor ciphertext is written on-chain.
6. Collect signed receipts and submit the matching set to the market before the
   deadline.
7. Confirm that the chain shows only vendor participation, commitment, receipt
   bitmap, and updated common quorum/root.
8. Clear the local draft. If selected, receive the public FTestXRP amount and
   optionally follow the official FAssets redemption path to XRP.

The submission fails rather than weakening privacy if private ingress, a valid
receipt set, or a common 2-machine quorum is unavailable.

## 6. Close, selection, and recovery

1. Any user or relay calls close when eligible. The market freezes bid root,
   rules, common quorum, close block, and the official XRP/USD FTSO snapshot.
2. Any user requests selection from the frozen common quorum.
3. Each TEE validates its sealed state against the public ordered root, checks
   credentials, normalizes quotes, and applies `SCORING_V1`.
4. A stateless relay groups exact result digests and submits only after two
   distinct approved machines agree.
5. The market reconstructs the full domain, verifies threshold signatures,
   marks terminal state, and settles once.
6. If another finalizer wins the race, reread chain state. If a dependency is
   unavailable, preserve the checkpoint and resume; never use a client-computed
   winner, manual price, replacement machine, or mock result.

Losing the frozen quorum may lock the test escrow. There is no buyer timeout
that overrides valid bids after close.

## 7. Evidence and privacy labels

Every workflow labels data as one of:

- `PUBLIC`: metadata, identities, commitments, FTSO snapshot, winner, amount,
  transactions, receipt, and result evidence;
- `PRIVATE IN SESSION`: unsent vendor input in browser memory;
- `ENCRYPTED IN TRANSIT`: ephemeral per-TEE ingress payload;
- `SEALED IN TEE`: bid state available only to the approved confidential
  runtime;
- `NOT COLLECTED`: secrets, raw credentials, bid bodies, ciphertext, and private
  score components in public evidence.

## 8. Troubleshooting

- **Wrong network or release:** disable writes and compare the verified Coston2
  manifest and runtime.
- **Machine key/policy changed:** discard the unsent payload; a live tender must
  not silently adopt the new policy.
- **Receipt quorum failed:** do not submit a weaker receipt set; retry only the
  tender-fixed common machines.
- **Private ingress unavailable:** show unavailable and retain no payload.
- **Stale/unavailable FTSO:** a USD-enabled tender cannot close with a manual
  replacement price.
- **FDC/Smart Account delayed:** keep the XRPL and user-op checkpoints; do not
  mark the tender funded until atomic execution succeeds.
- **Split or expired TEE results:** request the same frozen computation again;
  the caller cannot choose among digests.
- **RPC/indexer/relay unavailable:** recover from canonical chain state with
  another provider/runner; never load sample success data.

## 9. Historical application

The existing Sepolia UI, Safe flow, Nox computation, ERC-7984 settlement, and
evidence remain useful regression material. They are not the Coston2 judge path
and do not prove any FCC, FAssets, FDC, FTSO, or Smart Account capability.
