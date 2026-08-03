# Operator Console

The console exposes two strictly isolated, read-only MCP servers:

- `pnpm mcp` inspects the historical verified Sepolia/Nox baseline;
- `pnpm flare:mcp` inspects only an explicitly configured Coston2 market.

Neither server has a signer, transaction writer, bid-decryption capability, or
success fallback. Tool errors expose allowlisted codes instead of raw RPC
responses.

## Coston2 MCP

The Flare server requires all four public configuration values:

```dotenv
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
FLARE_MARKET_ADDRESS=0x...
FLARE_MARKET_DEPLOYMENT_BLOCK=...
FLARE_DEPLOYMENT_STATUS=planned
```

It refuses missing metadata, another chain, absent bytecode, and a deployment
block that has not reached the 12-block read finality boundary. Public tender
state and award logs are both read at the same finalized block.

The four tools are:

- `list_flare_tenders`
- `get_flare_tender`
- `inspect_flare_selection`
- `inspect_flare_protocol_binding`

They return public roots, quorum bitmap, extension/code/machine fingerprints,
FTSO snapshot, request/retry facts, award facts, runtime code hash, immutable
Flare dependencies, and threshold constants. They never return bid plaintext,
ciphertext, raw FCC response bodies, signatures, credentials, or secret
configuration.

## Historical MCP

The Sepolia server exposes:

- `list_tenders`
- `get_tender`
- `explain_tender_readiness`
- `inspect_settlement_evidence`
- `inspect_bid_viewer`

Its data must never be presented as the Coston2 judge lifecycle.
