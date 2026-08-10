# FlareQuorum validation protocol

This protocol is ready for real participants. It is a plan, not evidence of
completed interviews or pilot traction. Do not fill in results until a person
has actually completed the task, and do not record wallet addresses, seeds,
private bids, or personal data in the repository.

This current Gate H validation track is separate from the planned post-Summer
Signal V2 release upgrade. Its recorded state remains `NOT_RUN` until the
sessions below occur; staged V2 work does not change that state.

## Buyer/treasury interview (five sessions)

Recruit XRP treasury, DAO operations, or procurement users who regularly choose
vendors. Ask before showing the implementation:

1. What procurement decision is hardest to run with a small or distributed
   treasury?
2. Which terms must be public for vendors to trust the process?
3. Which terms must remain private from the buyer, other vendors, or a relay?
4. How would you fund a Coston2 testnet tender from an XRPL payment?
5. What would make a delayed FDC/Smart Account result understandable and safe?

Then ask each participant to inspect the wallet-free dossier and explain, in
their own words, what FCC, FTSO, FDC, Smart Accounts, and FAssets do. Record
only anonymized observations, task completion, confusion, and requested
changes. A participant must never be asked for a private key, seed, XRPL
secret, bid value, or credential.

## Vendor usability test (five sessions)

Give each vendor a disposable Coston2 wallet and a synthetic procurement brief.
Ask them to:

1. open the Vendor workspace;
2. confirm the public ceiling, delivery bound, and warranty bound;
3. submit one test quote and observe the three-receipt progress;
4. inspect the public result without expecting losing prices to be visible; and
5. explain what should happen if one TEE or the ingress becomes unavailable.

Success means the vendor can identify the public/private boundary, understand
that the quote is encrypted before transport, and recover from a pending state
without retrying a bid with changed terms. The test operator must use only
testnet assets and must clear browser state after the session.

## Pilot/partner outreach

Ask at least one treasury, DAO, or ecosystem infrastructure team whether it
would run a limited Coston2 procurement pilot. The pilot request should link to
the live app, public evidence ledger, integration guide, and threat-model
limits. Record the response as `interested`, `not now`, or `declined`, with the
date and an anonymized reason. Never call an unanswered message traction.

## Results ledger template

Store completed results outside the repository until consent and redaction are
confirmed. A repository-safe entry contains only:

```text
participantId: anonymous-01
role: buyer | vendor | partner
date: YYYY-MM-DD
tasksCompleted: 0
blockingConfusions: []
requestedChanges: []
consentToQuote: false
followUp: none | pilot | clarification
```

The release cannot claim user validation until five buyer/treasury sessions,
five vendor sessions, and one honest pilot/interest result are present.
