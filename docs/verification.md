# VeilBid Flare Verification Plan and Evidence Ledger

> Status: Flare verification has not started. The verified Sepolia/Nox evidence
> is retained as pre-hackathon baseline only.

## 1. Evidence policy

Committed Flare evidence may contain:

- network and chain ID;
- contract addresses, extension ID, approved code/image version, registered TEE
  public identities, transactions, blocks, and public result digests;
- source/runtime hashes and configuration assertions;
- public tender status, vendor addresses, winner, settlement amount, and receipt;
- Boolean test assertions and allowlisted failure codes.

Committed evidence must not contain:

- plaintext losing bids or private scoring/qualification fields;
- TEE, wallet, XRPL, proxy, or indexer secrets;
- ECIES private material or full encrypted payloads;
- raw credentials, provider responses, wallet signatures, or debug dumps;
- fabricated identifiers or an unexecuted test marked pass.

The winning amount is public in the first Flare release and may appear in
evidence. Losing values remain redacted.

## 2. Mandatory verification matrix

| Area | Required evidence | Current status |
|---|---|---|
| FCC registration | Extension, code version, TEE identity, Coston2 transactions | NOT RUN |
| Signature verification | Correct signer succeeds; wrong signer/domain/chain/market fails | NOT RUN |
| Encrypted input | ECIES plaintext never crosses public/log/evidence boundary | NOT RUN |
| Bid binding | Wrong tender/vendor/nonce/rules/commitment fails | NOT RUN |
| Private selection | Lower valid wins; invalid excluded; earlier tie; no-valid zero | NOT RUN |
| Root/rule binding | Wrong ordered root, close block, or rules hash fails | NOT RUN |
| Replay/expiry | Duplicate and expired result cannot settle | NOT RUN |
| Escrow conservation | Winner plus remainder, or full refund, equals ceiling | NOT RUN |
| Reentrancy/asset policy | Terminal state precedes supported token interactions | NOT RUN |
| Recovery | Fresh relay/browser resumes mined close/request/result state | NOT RUN |
| Deployment | Source, runtime, constructor, immutable wiring, signer policy agree | NOT RUN |
| Bindings | Generated ABI/address snapshot matches verified release | NOT RUN |
| Public UX | Wallet-free Coston2 tender and FCC evidence load without mocks | NOT RUN |
| Privacy scan | Logs/evidence/source exclude forbidden plaintext and secrets | NOT RUN |
| New-work ledger | Pre-hackathon and Summer Signal changes are traceable | IN PROGRESS |

## 3. Conditional integration matrix

| Integration | Completion evidence | Current status |
|---|---|---|
| FAssets/FTestXRP | Official address discovery, escrow, payout/refund, XRP-native user journey | NOT RUN |
| FDC | Supported proof verified on-chain and bound to one product decision | NOT RUN |
| FTSOv2 | Supported feed snapshot, bounds, decimals, timestamp, deterministic normalization | NOT RUN |
| Flare Smart Accounts | XRPL-authorized custom action, replay protection, no hidden app custody | NOT RUN |
| Multi-TEE | Same result digest satisfies documented signer threshold/recovery | NOT RUN |

Do not list a conditional integration in the final submission as implemented
until its row passes.

## 4. Planned evidence files

```text
evidence/coston2/gate-a-fcc-result.json
evidence/coston2/gate-b-encrypted-bid.json
evidence/coston2/gate-c-private-selection.json
evidence/coston2/gate-d-settlement.json
evidence/coston2/gate-e-recovery.json
evidence/coston2/gate-f-fassets.json
evidence/coston2/deployment-consistency.release.json
evidence/coston2/source-publication.release.json
evidence/coston2/release-two-vendor.json
evidence/coston2/relay-write-e2e.json
evidence/coston2/production-smoke.json
evidence/coston2/production-keyboard.json
```

Schemas must reject confidential fields rather than relying on maintainers to
remember manual redaction.

## 5. Required adversarial cases

- Plaintext or malformed bid submission.
- Ciphertext encrypted to an unexpected TEE key.
- Wrong chain, market, extension, code version, tender, vendor, nonce, or rule.
- Duplicated vendor submission and reordered commitment root.
- Zero, over-ceiling, equal, and no-valid bid sets.
- Forged/unregistered TEE signer.
- Correct signature over wrong result domain.
- Result for another tender/root/close checkpoint.
- Expired and replayed result.
- Settlement token failure and reentrant callback.
- Proxy/indexer/RPC interruption after every public checkpoint.
- Competing finalizers.
- FDC/FTSO proof/value outside supported source, freshness, or bounds when those
  optional integrations exist.

## 6. Historical baseline ledger

The following remain valid only for the previous implementation:

- `packages/contracts/deployments/sepolia.release.json`
- `evidence/local/`
- `evidence/sepolia/`
- generated Sepolia bindings under `packages/chain-bindings/generated/`

They prove that the team previously built a substantive confidential procurement
product. They do not prove any Coston2 contract, FCC extension, FAssets flow, or
Summer Signal work.

## 7. New-work ledger

Every Summer Signal release-facing commit should be categorized:

| Category | Examples |
|---|---|
| Ported | Web roles, public index, relay recovery adapted from Sepolia to Coston2 |
| Newly built | FCC extension, ECIES schema, TEE signature verification, Flare contracts/bindings |
| Integrated | FAssets, FDC, FTSO, Smart Accounts |
| Improved | Multi-criteria scoring, result-domain hardening, multi-TEE recovery |

The final ledger includes commit IDs, evidence paths, deployment IDs, and one
sentence explaining user value.

## 8. Release gate

A Flare release is judge-ready only when:

- mandatory matrix rows pass;
- the canonical Coston2 manifest is verified and blocker-free;
- extension source/code version and registered signer mapping are public;
- contract/bindings/evidence/UI all use the same addresses and extension;
- the wallet-free judge path shows a real finalized lifecycle;
- privacy and trust claims match `docs/threat-model.md`;
- secret scans cover current files and full Git history.
