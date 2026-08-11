# FlareQuorum Championship Threat Model

> Status: accepted security model with live Coston2 FCC, ingress, market, and
> XRP-native evidence recorded. The verified V1 market has a known
> pre-dispatch closed-tender liveness gap; a side-by-side live V2 candidate
> fixes it but is not yet Coston2 release authority because its real refund
> lifecycle and promotion are still pending. Adversarial/restart
> hardening remains in progress, and historical Sepolia/Nox evidence does not
> establish the security of this architecture.

## 1. Security objectives

FlareQuorum aims to:

- keep every bid plaintext and ciphertext outside public calldata, storage,
  events, logs, analytics, and committed evidence;
- accept an on-chain bid reference only after a common quorum of registered,
  tender-fixed TEEs has acknowledged the same salted commitment;
- make qualification and multi-criteria scoring deterministic inside the
  approved FCC extension;
- prevent the browser, buyer, relay, proxy, administrator, or one TEE from
  choosing a winner or changing frozen inputs;
- bind receipts and results to the exact chain, market, extension, code version,
  tender, rules, machine policy, bid root, oracle snapshot, nonce, and expiry;
- settle the public FTestXRP escrow exactly once;
- support recovery from public checkpoints without introducing a plaintext
  database or a mock-success path;
- keep EVM, XRPL, TEE, proxy, and infrastructure secrets out of the repository.

## 2. Assets and visibility

| Asset/data | Intended visibility | Authority |
|---|---|---|
| Bid price, delivery, warranty, credentials, salt | Private | Submitting vendor and approved TEE quorum |
| Encrypted bid transport payload | Confidential ciphertext; never committed on-chain or retained | Vendor, ciphertext-only gateway, proxy, and target TEE connection |
| Sealed bid state | Opaque outside confidential runtime | Tender-fixed TEE identity/code policy |
| Salted commitment, vendor, receipt bitmap, timing | Public | Canonical market contract |
| TEE encryption/signing secrets | Private | FCC-attested TEE boundary |
| Rules, ceiling, deadline, issuer policy, machine fingerprints | Public | Canonical market contract |
| FTSO XRP/USD close snapshot | Public | Canonical market contract |
| Winner and winning FTestXRP amount | Public after finalization | Canonical market contract |
| Losing bid values and score components | Private by default | TEE runtime and original vendor only |
| XRP/FXRP/FTestXRP transaction graph | Public | XRPL and Flare networks |
| Receipt/result digests and signatures | Public | Everyone can verify |
| Local unsent plaintext | Browser memory only | Current vendor session |

The system does not hide bidder identity, participation, timing, traffic
metadata, tender metadata, commitment existence, the final winner, the winning
amount, or either network's transaction graph.

## 3. Trust boundaries

### Wallet, XRPL authorization, and browser

A compromised endpoint can steal a bid before encryption, alter displayed
rules, target the wrong machine key, or authorize an unwanted public
transaction. The client must derive public configuration from the verified
release, display chain/market/extension/code/machine fingerprints, and clear
session plaintext on account, network, tender, key, or policy changes.

The flagship buyer path relies on an XRPL payment memo committing the exact
Smart Account user-operation hash. FlareQuorum never receives an XRPL secret or
operates a hidden buyer signer. The user may sign in an external wallet or the
optional GemWallet browser integration; the latter is network- and address-
checked before it asks the wallet to submit, and FlareQuorum receives only the
public transaction ID. The executor accepts only that public ID and the
domain-bound job.

### Private ingress, proxy, and sealed storage

The ingress endpoint authenticates tender/vendor context, limits payload size
and rate, terminates only the transport layer required by the supported FCC
deployment, and must not log bodies. Bid confidentiality ultimately depends on
encryption to the verified TEE key, not on ordinary proxy secrecy.

Proxy queue/cache state is not the procurement ledger. Each TEE seals its own
state, while the on-chain ordered commitment root detects missing, duplicated,
or rolled-back records. Gate B must prove the organizer-supported environment
can provide this path; public on-chain ciphertext is not an accepted fallback.

### FCC machines and extension code

Confidentiality and scoring correctness depend on FCC registries, attestation,
machine identity, key management, the pinned extension image/code version, and
the TEE runtime. Two matching signatures from three fixed machines reduce
single-machine faults and availability risk, but do not eliminate correlated
hardware, runtime, registry, or identical-code defects. The contract verifies
agreement and binding, not a zero-knowledge proof of private execution.

### Flare market contracts

Contracts are canonical for public inputs, receipt ordering, quorum policy,
FTSO snapshot, result verification, escrow, and terminal state. They are
non-upgradeable and unaudited hackathon code. Limited governance may configure
future tenders but cannot mutate a live tender, reduce its threshold, replace a
winner, or withdraw escrow.

### FAssets, FDC, FTSO, and Smart Accounts

The XRP-native journey trusts the supported Flare protocol deployments and
their documented assumptions. FDC proves the supported XRPL payment statement;
it does not prove procurement quality. FTSO supplies a public price snapshot;
it does not hide conversion or settlement. FAssets and Smart Accounts provide
minting, account, and redemption mechanics; FlareQuorum does not inherit a security
guarantee beyond those exact interfaces.

### Relays, RPCs, and indexers

Relays are permissionless, stateless callers. They may delay requests or waste
their own gas but hold no plaintext and cannot supply a winner. RPCs and
indexers can omit, delay, or misreport data to a client; release bytecode,
events, transactions, and multiple public checkpoints remain independently
verifiable.

## 4. Threats and mitigations

| Threat | Required mitigation | Residual risk |
|---|---|---|
| Plaintext reaches proxy/logs | ECIES before transport; body/log allowlist tests; no analytics or durable browser storage | Compromised vendor device or extension may disclose it |
| Public ciphertext enables future recovery | Never store bid ciphertext on-chain or in evidence; bounded ephemeral transport | Network observer sees timing/size metadata |
| Wrong machine key | Verified release data, fingerprint confirmation, tender-fixed key set | Compromised UI or registry discovery can mislead the user |
| Cross-tender receipt replay | Full receipt domain, vendor nonce, expiry, signer registration | Encoding or verifier defect |
| One machine acknowledges a different bid | Receipts must preserve a common 2-machine quorum over the same commitment | Two colluding/identically faulty machines |
| TEE state rollback or omission | All-three atomic receipt custody, ordered chain root, sequence/checkpoint validation before scoring | Loss of two frozen machines halts selection; verified V1 can refund only after dispatch, while the live V2 candidate bounds the pre-dispatch `Closed` state after its fixed grace |
| Buyer/client supplies favored winner | Market accepts only threshold signatures over its reconstructed result domain | Correlated TEE/code/governance compromise |
| Split TEE outcomes | Group exact digest and require two distinct common-quorum signers | Liveness failure when no digest reaches threshold |
| Result replay or rebinding | Tender nonce, expiry, terminal guard, full domain including root and FTSO snapshot | Contract or domain implementation defect |
| Invalid credential/bid wins | Versioned schema, issuer domains, fixed bounds, golden vectors and adversarial tests | Extension defect or compromised trusted issuer |
| FTSO stale/manipulated quote | Contract-read official feed, positive/freshness checks, fixed decimals/rounding, signed snapshot | Oracle/protocol risk and close-time volatility |
| Smart Account/FDC replay | Exact user-op hash in XRPL memo, sender/account/nonce checks, official proof verification | Underlying protocol/executor availability or implementation defect |
| Malicious or over-broad funding executor | Dedicated key; exact public job schema; deterministic approve/create batch; proofOwner, XRPL-source/PersonalAccount, nonce, fee, round, memo, and contract-address-bound receipt checks | Dedicated executor key can delay or waste its own gas; protocol defects remain |
| FDC/API data leakage | Credentials remain server-side; bounded parsers emit only stable error codes and sanitized public transaction/round identifiers | External verifier/DA/RPC operators observe request metadata |
| Underfunded or unusual token | FTestXRP-only release, exact balance-delta and conservation checks | FAssets/protocol failure |
| Double settlement/reentrancy | Nonce and terminal state before transfers, guard, no arbitrary token allowlist | Unaudited market defect |
| Public award leaks commercial price | Winning amount explicitly classified as public before submission | Winner's commercial price is disclosed by design |
| Proxy/RPC/relay outage | Public checkpoints, fresh attempt nonce/request after expiry, competing relay/browser recovery; V2 close-time refund after no successful dispatch | Extended FCC or quorum outage prevents award; the live V2 mitigation remains candidate-only until its refund proof and promotion pass |
| Buyer exploits outage for refund | Public proxies, permissionless finalization/retry, fixed post-dispatch grace, and V2 fixed pre-dispatch grace | If no threshold result becomes publicly retrievable before the applicable grace, fairness yields to public full-escrow recovery |
| Admin changes live policy | Immutable tender binding and governance without live-tender/escrow authority | Deployment key can still misconfigure future tenders |
| Fake evidence or mock fallback | Schema-validated public evidence tied to real Coston2 IDs; unavailable state on dependency failure | Review process can still miss an omission |

## 5. Compromise impact

- **Vendor wallet/browser:** attacker can submit, alter, or disclose that
  vendor's bid and public transaction.
- **Buyer XRPL/EVM endpoint:** attacker can authorize buyer actions within its
  account, but cannot forge a threshold FCC result without another compromise.
- **One of three TEEs:** attacker can learn bids processed by that machine,
  withhold receipts/results, or sign a false digest; one signature is
  insufficient for acceptance or settlement.
- **Two TEEs or a correlated extension/runtime flaw:** attacker may learn all
  processed bids and produce a threshold false result. On-chain binding limits
  reuse but does not prove correct private scoring.
- **Proxy:** attacker can observe traffic, deny service, or serve stale public
  metadata; encrypted payload confidentiality remains dependent on the target
  TEE key. Body logging or key substitution is a critical failure.
- **Relay:** attacker can delay only its own runner or submit data the contract
  rejects.
- **Market contract:** a defect may lock or misdirect all test escrow governed
  by that deployment.
- **FDC/FAssets/FTSO/Smart Account infrastructure:** the dependent XRP-native,
  oracle, or settlement journey may fail according to the affected subsystem.

## 6. Operational requirements

- Use Coston2/XRPL testnet and disposable identities until a separate audited
  mainnet process exists.
- Pin extension source, image digest, toolchains, interfaces, registry
  discovery, machine identities, and public-key fingerprints.
- Freeze extension, code version, machine set, threshold, and key fingerprints
  per tender before accepting bids.
- Keep wallet/XRPL/TEE/proxy/indexer/tunnel credentials ignored and untracked.
- Disable body logging and redact headers, ciphertext, plaintext, credentials,
  signatures from private wallets, and raw provider responses.
- Verify runtime bytecode, constructor arguments, registry wiring, machine
  policy, result domain, FTSO units, Smart Account nonce, and conservation.
- Treat FCC/FDC/FTSO/FAssets/RPC failure as unavailable state, never permission
  to calculate a winner or substitute a value.
- Run source, generated-artifact, evidence-schema, current-tree, and full-history
  secret/privacy scans before release.

## 7. Out of scope and prohibited claims

- Production-value custody, formal audit, formal verification, or mainnet
  readiness.
- Zero-knowledge correctness or privacy against a compromised TEE/runtime.
- Bidder anonymity, traffic-analysis resistance, collusion, bribery, Sybil, or
  transaction-order privacy.
- Confidential winner, winning price, ERC-20 balances, or transaction graph.
- Subjective service-quality judgment, legal delivery, disputes, KYC,
  sanctions, or contract enforcement.
- Correctness of arbitrary external APIs or credentials beyond the exact
  issuer/FDC/FTSO statements the release verifies.
