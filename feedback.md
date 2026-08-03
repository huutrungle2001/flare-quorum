# Historical iExec Nox Developer Tooling Feedback

> Project: VeilBid
>
> Status: Pre-Summer-Signal baseline feedback from the completed Ethereum
> Sepolia implementation. This file is retained to document what existed before
> the Flare port; it does not describe FCC behavior or Flare verification.

## 1. Tested stack

VeilBid used the following pinned versions:

| Component | Version |
|---|---:|
| Node.js | 24.18.0 |
| pnpm | 10.33.0 |
| Hardhat | 3.11.1 |
| viem | 2.47.6 |
| `@iexec-nox/handle` | 0.1.0-beta.13 |
| `@iexec-nox/nox-confidential-contracts` | 0.2.2 |
| `@iexec-nox/nox-hardhat-plugin` | 0.1.0 |
| `@iexec-nox/nox-protocol-contracts` | 0.2.4 |
| Safe Protocol Kit | 8.0.4 |

Local deterministic tests and compilation ran on Linux. Mandatory confidential
runtime checks ran against the official Nox deployment on Ethereum Sepolia,
chain ID `11155111`. Docker-backed local Nox was treated as optional because the
available machine did not provide a Docker daemon.

## 2. What worked well

### Persistent encrypted state

An encrypted bid stored in one Sepolia transaction remained usable by the
contract in a later block. Contract and vendor ACL access also persisted, and
the vendor could decrypt its own value in process memory. This is the core
capability that makes a multi-transaction procurement lifecycle possible.

Evidence: `evidence/sepolia/gate-a.json`.

### Encrypted selection

The Solidity confidential types and operators were expressive enough to build a
deterministic valid-minimum selection without a plaintext shadow ledger. Live
cases covered a lower valid bid, invalid exclusion, first-bid tie priority,
no-valid-bid, and input permutations. The same rule was checked against 2,000
feasibility model cases and 10,000 production property cases.

Keeping all comparisons in one reviewed operation order was important:
encrypted validity first, then encrypted lower-than comparison, then `select`
for both best price and winner ID.

Evidence: `evidence/sepolia/gate-b.json` and VeilBid Market property/static
tests.

### Public-decryption proof binding

The public winner proof could be obtained after close and verified on-chain.
Tampered proof data, a proof bound to another tender, and replay all failed.
The proof-derived public winner then drove confidential settlement; the UI or
finalizer never supplied a plaintext winner address.

Evidence: `evidence/sepolia/gate-c.json` and
`evidence/sepolia/release-two-vendor.json`.

### ERC-7984 composition

The official wrapper supported exact confidential winner payment, buyer
remainder, and full-refund paths. Per-handle viewers and token operators were
separate permissions, which allowed VeilBid to grant narrow audit visibility
without granting transfer authority.

Evidence: `evidence/sepolia/gate-d.json`.

## 3. Friction and workarounds

### Local runtime setup is Docker-dependent

Compilation worked without Docker, but the official local Nox runtime path
required a running Docker daemon. This is a meaningful onboarding boundary:
having Sepolia ETH and an RPC endpoint is enough for live testnet execution, but
not for the local confidential runtime.

Workaround: VeilBid made the four mandatory feasibility gates Sepolia-first and
kept deterministic local models for fast regression.

Recommendation: document a short decision table showing which commands need
Docker, which only compile, and which use the hosted Sepolia runtime.

### ACL failures need more actionable diagnostics

Correctness depends on three things being aligned: the handle, its intended
consumer contract, and the current viewer/operator authorization. A generic
authorization failure does not immediately reveal which edge is missing,
especially after a handle crosses transaction or contract boundaries.

Workaround: VeilBid added explicit ACL checkpoints before each cross-contract
use and before browser decryption. Evidence records only Boolean assertions,
never handles or proofs.

Recommendation: expose a typed diagnostic helper that reports the missing
authorization category without returning confidential material.

### Proof availability is asynchronous

Public-decryption proof generation is not transaction-synchronous. One live
feasibility run stopped during a decrypt stage and had to resume from already
mined transactions. Treating this as a recoverable state was more reliable than
retrying the whole lifecycle.

Workaround: close and finalize are separate actions; the Activity UI and
stateless relay keep public checkpoints and use bounded proof polling. They
re-read canonical state before every write.

Recommendation: provide an official status taxonomy and retry guidance for
submitted, indexed, proof-ready, retryable, and terminal proof requests.

### Confidential transfer success is not a public funding assertion

An ERC-7984 transfer can produce an encrypted result, so transaction success
alone does not publicly prove that the requested ceiling reached escrow. This
matters when an underfunded balance must not open a tender.

Workaround: VeilBid keeps the tender in `FundingPending` until a deliberately
public exact-funding proof confirms that the encrypted transferred amount equals
the public ceiling.

Recommendation: include an official exact-confidential-funding example that
distinguishes transaction inclusion from proof-confirmed business success.

### Safe-originated confidential inputs need a documented pattern

The browser Handle SDK naturally authorizes an EOA input, while a Safe cannot
produce the same authorization directly. Giving a module arbitrary Safe
execution authority would solve the wrong problem and enlarge custody risk.

Workaround: a preparation-only module binds the Safe, action digest, consumer,
and one-time nonce. It exposes no Safe execution function. Only a normal
threshold-authorized Safe transaction can move treasury funds.

Recommendation: publish a reference pattern for smart-account handle
preparation that explicitly separates input authorization from asset execution.

### Long live workflows benefit from resumable scripts

Sepolia RPC calls occasionally failed transiently during the multi-contract
release deployment. Re-running an all-or-nothing script would risk duplicate
deployments or confused canonical artifacts.

Workaround: the release deployer persists only public transaction checkpoints,
verifies chain state before resuming, and retries bounded RPC operations.

Recommendation: ship deployment examples with idempotent public checkpoints and
post-deployment wiring verification.

## 4. Documentation requests

The highest-value additions would be:

1. One end-to-end contract example that stores a handle, reuses it in a later
   transaction, grants a viewer, publicly decrypts a selected output, and
   verifies the proof on-chain.
2. A concise ACL matrix for sender, consumer contract, viewer, token operator,
   and smart-account/module roles.
3. A proof-service lifecycle and error taxonomy with recommended polling and
   recovery behavior.
4. An ERC-7984 exact-funding example that covers underfunding and confidential
   conservation.
5. A Safe or ERC-4337 preparation example with no arbitrary execution surface.
6. A version compatibility table covering Handle SDK, protocol contracts,
   confidential contracts, Hardhat plugin, supported Node versions, and
   supported networks.

## 5. Verification boundary

The observations above are limited to the pinned VeilBid implementation and its
recorded Sepolia runs. They do not establish formal security, mainnet readiness,
Nox infrastructure correctness, or behavior outside the tested versions.
Confidential values, handles, proofs, wallet signatures, RPC credentials, and
private keys were intentionally excluded from this file and committed evidence.
