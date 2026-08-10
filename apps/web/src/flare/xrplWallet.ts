import type { Hex } from "viem";

const xrplClassicAddress = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const xrplTransactionHash = /^[0-9a-f]{64}$/i;

export interface GemWalletPaymentInput {
  owner: string;
  destination: string;
  amountUBA: string;
  memoData: Hex;
}

function normalizeHash(value: unknown): Hex {
  const normalized = typeof value === "string" ? value.trim().replace(/^0x/i, "") : "";
  if (!xrplTransactionHash.test(normalized)) throw new Error("XRPL_WALLET_TRANSACTION_HASH_INVALID");
  return `0x${normalized.toLowerCase()}` as Hex;
}

function responseResult(value: unknown, code: string): unknown {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "response") {
    throw new Error(code);
  }
  return (value as { result?: unknown }).result;
}

/**
 * Submit exactly the public Payment draft through the user's GemWallet
 * extension. The wallet owns signing and submission; no seed, private key, or
 * signed blob enters the FlareQuorum process.
 */
export async function sendXrplTestnetPaymentWithGemWallet(input: GemWalletPaymentInput): Promise<Hex> {
  if (!xrplClassicAddress.test(input.owner.trim())) throw new Error("XRPL_WALLET_OWNER_INVALID");
  if (!xrplClassicAddress.test(input.destination.trim())) throw new Error("XRPL_WALLET_DESTINATION_INVALID");
  if (!/^[1-9][0-9]*$/.test(input.amountUBA)) throw new Error("XRPL_WALLET_AMOUNT_INVALID");
  if (!/^0x[0-9a-f]{84}$/i.test(input.memoData)) throw new Error("XRPL_WALLET_MEMO_INVALID");

  let wallet: typeof import("@gemwallet/api");
  try {
    wallet = await import("@gemwallet/api");
  } catch {
    throw new Error("XRPL_WALLET_PROVIDER_UNAVAILABLE");
  }

  const network = await wallet.getNetwork();
  const networkResult = responseResult(network, "XRPL_WALLET_NETWORK_UNAVAILABLE");
  if (!networkResult || typeof networkResult !== "object") throw new Error("XRPL_WALLET_NETWORK_UNAVAILABLE");
  const networkData = networkResult as { chain?: unknown; network?: unknown };
  if (networkData.chain !== "XRPL" || networkData.network !== "Testnet") {
    throw new Error("XRPL_WALLET_WRONG_NETWORK");
  }

  const addressResponse = await wallet.getAddress();
  const addressResult = responseResult(addressResponse, "XRPL_WALLET_ADDRESS_UNAVAILABLE");
  const address = addressResult && typeof addressResult === "object"
    ? (addressResult as { address?: unknown }).address
    : undefined;
  if (typeof address !== "string" || address.toLowerCase() !== input.owner.trim().toLowerCase()) {
    throw new Error("XRPL_WALLET_OWNER_MISMATCH");
  }

  const response = await wallet.sendPayment({
    amount: input.amountUBA,
    destination: input.destination.trim(),
    memos: [{ memo: { memoData: input.memoData.slice(2).toUpperCase(), memoType: "FLAREQUORUM_0XFE" } }],
  });
  const result = responseResult(response, "XRPL_WALLET_PAYMENT_REJECTED");
  const hash = result && typeof result === "object" ? (result as { hash?: unknown }).hash : undefined;
  return normalizeHash(hash);
}
