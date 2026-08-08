# VeilBid Flare Championship User Guide

> Status: verified Coston2 experience. The checked-in `/` and `/flare` routes
> provide the fail-closed wallet-free evidence view and dedicated public
> Activity/Evidence ledger, and explicit Coston2 EVM Buyer/Vendor role routes
> are live. The XRP-native funding protocol and executor have live Gate G
> evidence plus a public-safe delayed-mint checkpoint/resume path. The Buyer
> workspace can also prepare a public-safe `0xFE` executor job preview from
> read-only Coston2 state; XRPL signing, submission, and recovery remain
> outside the browser custody boundary. `/room` remains the historical
> Sepolia baseline.

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

Use `/?role=evidence` for the dedicated public Activity/Evidence ledger. It
re-reads the same finalized market snapshot and presents each tender's public
rules hash, receipt quorum, ordered root, FTSO checkpoint, FCC binding, and
award/refund state. It never unlocks bid data or requires a wallet.

The public path is live and release-labeled. Any missing dependency keeps its
own operation unavailable; the UI never substitutes Sepolia data or mock
success. The Sepolia app remains a pre-hackathon baseline.

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

## 4. XRP treasury buyer flow (executor-backed flagship)

1. Derive the deterministic Flare PersonalAccount and read its current nonce
   from the supported Smart Account controller.
2. Build a public-safe `FlareFundingJob` containing the tender terms, exact
   FTestXRP ceiling, approved vendors, three frozen TEE identities, and the
   XRPL transaction ID. The checked-in adapter builds the `PackedUserOperation`
   and 42-byte `0xFE` memo; the Buyer workspace can display this preview after
   read-only PersonalAccount/nonce reads, and it does not request an XRPL
   secret.
3. Send the XRP testnet payment with that memo from the buyer's own XRPL
   wallet, then run the dedicated `flare:funding:execute` executor with local
   credentials. The executor waits for XRPL finality, requests the official FDC
   `XRPPayment` proof, and calls `executeDirectMintingWithData`.
4. Accept the funding result only when the direct-mint, user-operation, and
   `TenderCreated` events prove one atomic Coston2 tender. Delayed minting is a
   public pending checkpoint, never a success fallback. Save the JSON result
   and resume it later with `pnpm flare:funding:resume < checkpoint.json`; the
   resume command reuses the same XRPL payment, FDC request, memo-bound nonce,
   and user operation. It never sends a second payment or silently changes the
   public terms.
5. Monitor the public tender and continue through FCC selection and settlement
   in the same wallet-free evidence view.

The app never asks for the buyer's XRPL secret and never holds an autonomous
buyer signer. Direct EVM funding is a clearly labeled recovery/developer route.

## 5. Vendor flow

1. Connect the approved Coston2 address and open an `Open` tender.
2. Verify market, buyer, deadline, ceiling, rules, extension/code, three machine
   fingerprints, common threshold, and official release status.
3. In the current browser role route, enter an XRP quote, delivery days, and
   warranty days. Credential-gated tenders are rejected by this composer until
   an explicit issuer-credential UX is added; the underlying protocol still
   validates credential requirements inside FCC.
4. Review the canonical commitment locally; the random salt prevents practical
   enumeration of low-range values.
5. Encrypt separately to each selected TEE key and send through the authenticated
   private-ingress path. Neither plaintext nor ciphertext is written on-chain.
6. Collect signed receipts and submit the matching set to the market before the
   deadline.
7. Confirm that the chain shows only vendor participation, commitment, receipt
   bitmap, and updated common quorum/root.
8. Clear the local draft. If selected, receive the public FTestXRP amount and
   open the Vendor workspace with the winning wallet to approve the exact amount
   and submit an official FAssets redemption request to an XRPL address. The
   request creates an agent payout obligation; it is not an instant XRP payout.

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
6. If the one-hour result envelope expires, retry with a fresh attempt nonce and
   request ID while preserving every frozen input. Old-attempt results fail.
7. If another finalizer wins the race, reread chain state. If a dependency is
   unavailable, preserve the checkpoint and resume; never use a client-computed
   winner, manual price, replacement machine, or mock result.
8. If no threshold result is retrievable within 24 hours of the first request,
   the buyer may recover only the original escrow. This records failed-compute
   `Refunded`, creates no award, and is never displayed as FCC success.

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
- **FDC/Smart Account delayed:** keep the executor's public-safe JSON result;
  do not send another payment with the same nonce or mark the tender funded.
  The result contains `executionAllowedAt` and a checkpoint without FDC proof,
  secrets, or bid data. Run `pnpm flare:funding:resume < checkpoint.json` only
  after that time. The resume path rechecks XRPL finality, nonce, payment
  amount, FDC round/request, and the canonical user-operation commitment;
  success still requires the mint, user-operation, and tender-created events in
  one Coston2 receipt. A changed nonce, quote, domain, or hash fails closed.
- **Split or expired TEE results:** request the same frozen computation again;
  the caller cannot choose among digests.
- **RPC/indexer/relay unavailable:** recover from canonical chain state with
  another provider/runner; never load sample success data.

## 9. Read-only operator inspection

Run `pnpm flare:mcp` only with explicit Coston2 market address, deployment
block, deployment status, and RPC configuration. Its four public tools list
tenders, inspect a tender, inspect the frozen FCC/FTSO selection envelope, and
inspect runtime/immutable protocol bindings. Every read is pinned to the same
12-block-finalized checkpoint; the console has no signer, writer, decryption
path, raw FCC response output, or Sepolia fallback.

## 10. Historical application

The existing Sepolia UI, Safe flow, Nox computation, ERC-7984 settlement, and
evidence remain useful regression material. They are not the Coston2 judge path
and do not prove any FCC, FAssets, FDC, FTSO, or Smart Account capability.
