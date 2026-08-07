# VeilBid Flare — 60-second privacy and trust explanation

VeilBid makes the procurement rule and the outcome public while keeping the
commercial bid values private. A vendor's browser encrypts the bid separately
to each of the three tender-frozen FCC machines. The hosted gateway accepts only
opaque ciphertext and a wallet authorization; it does not store a bid body.

Each TEE validates the same market, tender, vendor, rules hash, code version,
and one-time nonce, then returns a signed receipt. The market admits a bid only
when all three receipts agree on the commitment. At close, the market freezes
the ordered root and the official FTSO snapshot. The TEEs score inside the FCC
boundary. Finalization accepts two distinct registered machines only when they
sign the exact same result digest.

The winner and winning FTestXRP amount are public by design so a judge can
verify settlement. Losing prices, credential inputs, salts, ciphertext, and
TEE plaintext are not published. FAssets, FDC, and Smart Accounts are used in
the XRP-native funding path; VeilBid never receives an XRPL secret. This is
testnet, simulated-TEE, unaudited software with explicit availability and
restart limitations—not a claim of anonymity, perfect privacy, or mainnet
readiness.

