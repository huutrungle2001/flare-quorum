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
FLARE_MARKET_ADDRESS=0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05
FLARE_MARKET_DEPLOYMENT_BLOCK=33746695
FLARE_DEPLOYMENT_STATUS=verified
```

These values identify the verified release in
`packages/flare-contracts/deployments/coston2.release.json`; keep them public
and do not add credentials or signer variables to the MCP process. It refuses
missing metadata, another chain, absent bytecode, and a deployment block that
has not reached the 12-block read finality boundary. Public tender state and
award receipt state are read at the same finalized block. The reader does not
scan an unbounded event history, so it remains usable against the Coston2 RPC
range limit.

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
