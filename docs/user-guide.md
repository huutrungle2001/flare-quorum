# VeilBid Flare User Guide

> Status: Planned Coston2 experience. The checked-in application still targets
> the historical Sepolia release until the Flare feasibility and deployment
> gates pass.

## 1. Judge and public observer

The eventual wallet-free path will let a reviewer:

1. Open a finalized Coston2 tender.
2. Inspect buyer, approved vendors, public ceiling, deadline, rule hash, bid
   commitments, and frozen ordered root.
3. Inspect the FCC extension ID, approved code version, registered TEE signer,
   result digest, and finalization transaction.
4. Confirm that the signed result is bound to the displayed tender and that no
   losing bid value is published.
5. Inspect the public winner, winning payout, buyer remainder/refund, asset, and
   award receipt.
6. Compare the UI to sanitized `evidence/coston2/` lifecycle assertions.

Until those artifacts exist, the historical live application must be labeled
as the pre-hackathon Sepolia demo, not the Summer Signal submission.

## 2. Network and wallet

- Use Flare Testnet Coston2, chain ID `114`.
- Use a disposable injected EVM wallet and test C2FLR for gas.
- Use only official Coston2 test assets and faucet sources documented by Flare.
- Never enter a private key, XRPL secret, TEE secret, or proxy credential in the
  web application.
- Account, network, market, extension, code-version, or TEE-key changes clear
  session-only bid plaintext and invalidate stale encryption state.

## 3. Buyer flow

1. Connect on Coston2 and select a supported tender asset.
2. Enter public metadata, ceiling, deadline, one to eight approved vendors, and
   the supported scoring rule.
3. Review which fields are public and verify the displayed FCC extension/code
   version.
4. Approve and escrow the public ceiling.
5. Wait for exact funding confirmation before the tender becomes `Open`.
6. Monitor public participation and commitments without seeing bid plaintext.
7. After close, let the relay or any user request confidential selection.
8. Inspect the registered TEE-signed result and finalize transaction.
9. Confirm the public winner payout and remainder/refund.

Extended XRP-native flow may use Flare Smart Accounts after it passes its
independent gate. It is not part of the initial buyer instructions.

## 4. Vendor flow

1. Connect the approved vendor address and choose an open tender.
2. Inspect public rules, ceiling, deadline, market, extension ID, approved code
   version, and intended TEE identity/key.
3. Enter the bid in the current browser session.
4. Canonically encode and ECIES-encrypt the bid to the intended TEE public key.
5. Review the ciphertext commitment and submit before the deadline.
6. Confirm that public state records participation but does not display the bid.
7. If selected, receive the public FTestXRP/FXRP payout.
8. Optionally follow the verified FAssets redemption flow when it is shipped.

The first release makes the winning amount public at settlement. Losing values
remain private unless a vendor deliberately discloses its own input outside the
protocol.

## 5. Finalizer and recovery flow

1. Discover a tender ready to close.
2. Close it and freeze the ordered bid root, rule hash, and close checkpoint.
3. Request the configured FCC selection action.
4. Poll the public proxy/result endpoint using bounded retries.
5. Submit the minimum result envelope and TEE signature.
6. If another finalizer won the race, reread the contract and accept the result
   only if canonical state advanced correctly.
7. If the TEE/result is unavailable, preserve the public checkpoint and resume;
   never use a mock or caller-computed winner.

## 6. Optional advanced flows

- **FAssets:** fund/payout in FTestXRP/FXRP and redeem FXRP to native XRP.
- **FDC milestone:** submit a supported proof for a predefined payment/delivery
  tranche.
- **FTSO multi-currency:** inspect the fixed close-time feed snapshot used by the
  scoring rule.
- **Smart Accounts:** authorize supported tender actions from XRPL without
  directly managing FLR.

The UI hides each flow until its corresponding integration is deployed and
verified.

## 7. Troubleshooting

- **Wrong chain:** switch to Coston2 (`114`); writes and encryption stay disabled.
- **Unverified market/extension:** stop and compare canonical deployment data.
- **TEE key changed:** discard the unsent encrypted payload, refresh verified
  identity/key data, and re-encrypt.
- **RPC unavailable:** show unavailable state; do not load sample tender data.
- **FCC proxy/indexer delay:** keep the request checkpoint and retry later.
- **Expired result:** request recomputation for the same frozen inputs.
- **FDC/FTSO unavailable:** pause the dependent action; never provide a manual
  replacement proof or price.
- **Rejected wallet transaction:** chain state is unchanged; restart the exact
  interrupted step after rereading state.

## 8. Current historical application

The existing Sepolia UI, Safe flow, Nox proof recovery, and ERC-7984 reveal
features remain available for baseline regression. Their detailed behavior is
preserved in Git history and the verified Sepolia evidence. They are not the
instructions for the planned Coston2 product.
