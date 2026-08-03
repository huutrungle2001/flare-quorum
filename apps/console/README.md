# Operator Console

> Historical runtime note: the implemented tools inspect the Sepolia/Nox
> baseline. Planned Flare inspection must use generated Coston2 bindings and
> cannot claim support until those tools are implemented.

Local procurement queries and optional MCP stdio tools. Public reads are the
only implemented policy. The service returns public tender terms, lifecycle
readiness, settlement/receipt evidence, and per-bid viewer checks without
returning encrypted handles or requesting decryption.

## MCP stdio

After building, start the local server with:

```bash
pnpm mcp
```

It exposes exactly five tools:

- `list_tenders`
- `get_tender`
- `explain_tender_readiness`
- `inspect_settlement_evidence`
- `inspect_bid_viewer`

All inputs use strict schemas. Tool errors return allowlisted codes rather than
raw RPC messages. Standard output is reserved for MCP JSON-RPC; the server has
no signer, transaction, or private-decryption implementation.
