# VeilBid Flare Threat Model

> Scope: planned Coston2 release. The existing Sepolia/Nox release has separate
> historical evidence and does not establish the security of this design.

## 1. Security objectives

VeilBid Flare aims to:

- keep losing bid plaintext outside calldata, storage, events, logs, and public
  evidence;
- execute eligibility and selection inside a registered Flare TEE extension;
- prevent the UI, buyer, vendor, relay, or arbitrary server from substituting a
  winner;
- bind a signed result to the exact chain, contract, extension/code version,
  tender, rule, bid root, close checkpoint, nonce, and expiry;
- settle public FTestXRP/FXRP amounts exactly once;
- preserve recoverability without reopening or reordering frozen bids;
- keep wallet, proxy/indexer, and TEE secrets out of the repository.

## 2. Assets and visibility

| Asset/data | Visibility | Trusted controller/viewer |
|---|---|---|
| Plaintext bid and private qualification | Private | Vendor endpoint and intended TEE execution |
| Encrypted bid payload/reference | Public or publicly retrievable ciphertext | Everyone can observe; intended TEE can decrypt |
| Bid commitment/root | Public | Canonical contract |
| TEE encryption/private signing keys | Private | FCC/attested TEE boundary |
| Rules, ceiling, deadline, approved vendors | Public | Everyone |
| Winner | Public after finalization | Everyone |
| Winning amount and ERC-20 transfer | Public | Everyone |
| Losing amounts | Private by default | TEE and original vendor endpoint only |
| FXRP/FTestXRP balances | Public ERC-20 state | Token holders/contracts |
| Result envelope, signer, digest, code version | Public | Everyone |
| Revealed local plaintext | Browser memory | Current vendor/browser session |

The system does not hide bidder identity, participation, timing, public
metadata, ciphertext existence/size, final winner, winning payout, or transaction
graph.

## 3. Trust boundaries

### Wallet and browser

A compromised endpoint can steal bid plaintext before encryption, replace
displayed rules, select the wrong TEE key, or observe authorized local reveals.
The UI must display verified chain/market/extension/key identifiers and clear
session plaintext on account or network changes.

### FCC, proxy, relayers, and TEE

FCC registries, data-provider relaying, proxy availability, TEE attestation,
registered identity, key management, code version, and extension code are in the
confidentiality, correctness, and availability boundary. Hardware isolation and
signed results reduce operator trust but do not create a zero-knowledge proof of
the computation.

### Flare contracts

Contracts are canonical for public inputs, signer policy, result binding,
escrow, and terminal state. They cannot inspect private computation and are
unaudited hackathon code.

### Asset and interoperability protocols

FAssets/AssetManager, FDC, FTSO, and Smart Account contracts/services are
trusted according to their documented protocol and deployment assumptions. A
VeilBid bug must not be presented as a guarantee inherited from those systems.

### Relay and RPC

An RPC can delay or lie to a client but cannot sign a wallet transaction. A
relay is an untrusted permissionless caller with no bid plaintext or winner
authority.

## 4. Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Vendor sends plaintext | Canonical client encryption and contract accepts only ciphertext/reference format | Malicious vendor may publish its own bid |
| Wrong TEE key | UI verifies extension/machine/key binding before encryption | Compromised UI or FCC discovery can mislead user |
| Ciphertext rebound to another tender | Encrypted schema binds chain, market, tender, vendor, rules, nonce | TEE/client encoding bug |
| UI supplies favored winner | Contract accepts only domain-bound registered TEE signature | TEE/code governance compromise |
| Result replay | Tender-specific monotonic nonce, expiry, terminal guard | Contract bug |
| Result applied to reordered bids | Ordered bid root and close block signed and verified | Root implementation bug |
| Invalid bid wins | TEE validates nonzero/ceiling and deterministic tests cover cases | Extension implementation defect |
| TEE leaks plaintext in logs/result | Minimum result schema, structured allowlisted logs, evidence scan | TEE or proxy compromise |
| Single TEE is unavailable | Recover same fixed computation through approved machine policy | Extended FCC outage locks progress |
| Buyer exploits outage to refund | No post-bid timeout refund that invalidates frozen valid bids | Escrow liveness risk |
| Fake TEE signature | Registered signer and code-version verification with domain separation | Registry/attestation compromise |
| Underfunded tender opens | Exact token balance-delta accounting before `Open` | Unsupported token behavior |
| Double settlement/reentrancy | Nonce/terminal state before external calls, guard, supported token allowlist | Unaudited code bug |
| Public transfer reveals price | UI and docs explicitly classify winning amount as public | Commercial winner price is disclosed |
| FTSO manipulation/stale price | Supported feed, timestamp/decimals bounds, public snapshot, fixed-point tests | Oracle/protocol risk and market volatility |
| Forged FDC milestone | Verify official proof and exact tender/source/recipient/amount binding | Bad underlying data/API semantics |
| Smart Account replay/custody | Supported instruction flow, nonce binding, no hidden app signer | Operator/protocol availability |
| Ciphertext unavailable at close | Immutable storage/availability policy and pre-close retrieval checks | Off-chain storage outage if selected |

## 5. Compromise impact

- Vendor wallet/browser: attacker can submit or disclose that vendor's bid.
- Buyer wallet: attacker can create/fund/cancel where allowed but cannot forge a
  registered TEE result without compromising another boundary.
- Relay: attacker can waste its own gas or delay its runner only.
- TEE/extension: attacker may learn all processed bids and sign an incorrect
  result; on-chain binding limits reuse but cannot prove correct private
  execution independently.
- Extension governance/code-version authority: may approve malicious code for
  future tenders; tender-fixed version policy must prevent retroactive changes.
- Market contract: a bug may lock or misdirect test assets.
- FAssets/FDC/FTSO/Smart Account infrastructure: dependent user journeys may
  fail or return unsafe data according to the compromised subsystem.

## 6. Operational requirements

- Use Coston2 and disposable wallets until explicit mainnet approval.
- Pin extension source, image/code version, and contract source commit.
- Keep proxy/indexer credentials and TEE/wallet keys ignored and untracked.
- Never log plaintext bids, ECIES secrets, full decrypted payloads, or sensitive
  raw proxy responses.
- Verify contract bytecode, extension identity/version, signer mapping,
  transaction receipts, result binding, and settlement conservation.
- Treat FCC/FDC/FTSO/RPC failure as unavailable state, not permission to mock.
- Run current and full-history secret scans before public submission.

## 7. Out of scope

- Production-value custody or formal security assurance.
- Privacy against compromised vendor/browser or compromised TEE code/runtime.
- Bidder anonymity, traffic-analysis resistance, collusion, bribery, Sybil, or
  transaction-order privacy.
- Confidential ordinary ERC-20 transfer amounts.
- Legal delivery, dispute arbitration, KYC, sanctions, or contract enforcement.
- Correctness of arbitrary external APIs beyond the exact verified FDC claim.
