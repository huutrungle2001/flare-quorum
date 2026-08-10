import {
  decodeBidReceipt,
  encodePrivateBidSubmission,
  encryptPrivateBidForTee,
  flareBidIngressTypedData,
  prepareBidReceiptSet,
  privateBidCommitment,
  recoverBidReceiptSigner,
  flareQuorumFlareMarketAbi,
  type FlareBidReceipt,
  type FlarePrivateBidSubmission,
  type FlareTeePublicKey,
} from "@flarequorum/flare-bindings";
import {
  bytesToHex,
  createPublicClient,
  getAddress,
  hexToBytes,
  http,
  isAddress,
  isAddressEqual,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const requestTimeoutMs = 15_000;
const pollingAttempts = 30;
const pollingDelayMs = 2_000;

export interface FlareIngressMachine {
  teeId: Address;
  fingerprint: Hex;
  publicKey: FlareTeePublicKey;
}

export interface FlareIngressAction {
  actionId: Hex;
  teeId: Address;
  expiresAt: bigint;
}

export interface FlareBidReceiptSet {
  submission: FlarePrivateBidSubmission;
  commitment: Hex;
  receipts: readonly [FlareBidReceipt, FlareBidReceipt, FlareBidReceipt];
  actions: readonly [FlareIngressAction, FlareIngressAction, FlareIngressAction];
}

export interface FlareBidSubmissionResult extends FlareBidReceiptSet {
  transactionHash: Hex;
  blockNumber: bigint;
}

function ingressUrl(env: Record<string, string | undefined> = import.meta.env): string {
  const value = env.VITE_FLARE_INGRESS_URL?.trim();
  if (!value) throw new Error("FLARE_INGRESS_NOT_CONFIGURED");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("FLARE_INGRESS_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("FLARE_INGRESS_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function rpcUrl(env: Record<string, string | undefined> = import.meta.env): string {
  const value = env.VITE_COSTON2_RPC_URL?.trim();
  if (!value) throw new Error("COSTON2_RPC_URL_MISSING");
  return value;
}

function positiveId(value: bigint): string {
  if (value <= 0n) throw new Error("INVALID_FLARE_TENDER_ID");
  return value.toString();
}

function randomHex(byteLength: number): Hex {
  if (!Number.isInteger(byteLength) || byteLength <= 0) throw new Error("INVALID_RANDOM_LENGTH");
  if (!globalThis.crypto?.getRandomValues) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function jsonResponse(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new Error("FLARE_INGRESS_UNAVAILABLE");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function machineResponse(value: unknown, tenderId: bigint): readonly [FlareIngressMachine, FlareIngressMachine, FlareIngressMachine] {
  const record = jsonResponse(value, "FLARE_INGRESS_RESPONSE_INVALID");
  if (record.schemaVersion !== 1 || record.tenderId !== tenderId.toString() || !Array.isArray(record.machines) || record.machines.length !== 3) {
    throw new Error("FLARE_INGRESS_RESPONSE_INVALID");
  }
  const machines = record.machines.map((item) => {
    const candidate = jsonResponse(item, "FLARE_INGRESS_RESPONSE_INVALID");
    if (
      typeof candidate.teeId !== "string" || !isAddress(candidate.teeId) ||
      typeof candidate.fingerprint !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(candidate.fingerprint) ||
      !candidate.publicKey || typeof candidate.publicKey !== "object"
    ) throw new Error("FLARE_INGRESS_RESPONSE_INVALID");
    const key = candidate.publicKey as Record<string, unknown>;
    if (
      typeof key.x !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key.x) ||
      typeof key.y !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key.y)
    ) throw new Error("FLARE_INGRESS_RESPONSE_INVALID");
    return {
      teeId: getAddress(candidate.teeId),
      fingerprint: candidate.fingerprint as Hex,
      publicKey: { x: key.x as Hex, y: key.y as Hex },
    } satisfies FlareIngressMachine;
  });
  return machines as unknown as [FlareIngressMachine, FlareIngressMachine, FlareIngressMachine];
}

export async function loadFlareIngressMachines(
  tenderId: bigint,
  env: Record<string, string | undefined> = import.meta.env,
): Promise<readonly [FlareIngressMachine, FlareIngressMachine, FlareIngressMachine]> {
  const response = await fetchWithTimeout(`${ingressUrl(env)}/flare/ingress/tenders/${positiveId(tenderId)}/machines`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(response.status === 503 ? "FLARE_INGRESS_UNAVAILABLE" : "FLARE_INGRESS_RESPONSE_INVALID");
  return machineResponse(await response.json(), tenderId);
}

function actionResponse(value: unknown, expected: { actionId: Hex; teeId: Address }): FlareIngressAction {
  const record = jsonResponse(value, "FLARE_INGRESS_RESPONSE_INVALID");
  if (
    record.schemaVersion !== 1 || record.status !== undefined && record.status !== "accepted" ||
    typeof record.actionId !== "string" || record.actionId.toLowerCase() !== expected.actionId.toLowerCase() ||
    typeof record.teeId !== "string" || !isAddressEqual(record.teeId as Address, expected.teeId) ||
    typeof record.expiresAt !== "string" || !/^[1-9][0-9]*$/.test(record.expiresAt)
  ) throw new Error("FLARE_INGRESS_RESPONSE_INVALID");
  return {
    actionId: record.actionId as Hex,
    teeId: record.teeId as Address,
    expiresAt: BigInt(record.expiresAt),
  };
}

async function submitEncrypted(
  tender: FlarePublicTender,
  vendor: Address,
  machine: FlareIngressMachine,
  submissionNonce: bigint,
  ciphertext: Hex,
  expiresAt: bigint,
  walletClient: WalletClient,
  env: Record<string, string | undefined>,
): Promise<FlareIngressAction> {
  const authorizationInput = {
    market: tenderMarket(env),
    tenderId: tender.tenderId,
    vendor,
    teeId: machine.teeId,
    submissionNonce,
    ciphertext,
    expiresAt,
  } as const;
  const typedData = flareBidIngressTypedData(authorizationInput);
  const authorization = await walletClient.signTypedData({
    account: vendor,
    ...typedData,
  });
  const response = await fetchWithTimeout(`${ingressUrl(env)}/flare/ingress/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      market: authorizationInput.market,
      tenderId: tender.tenderId.toString(),
      vendor,
      teeId: machine.teeId,
      submissionNonce: submissionNonce.toString(),
      ciphertext,
      expiresAt: expiresAt.toString(),
      authorization,
    }),
  });
  if (!response.ok && response.status !== 202) {
    throw new Error(response.status === 503 ? "FLARE_INGRESS_UNAVAILABLE" : "FLARE_BID_REJECTED");
  }
  const parsed = jsonResponse(await response.json(), "FLARE_INGRESS_RESPONSE_INVALID");
  if (typeof parsed.actionId !== "string") throw new Error("FLARE_INGRESS_RESPONSE_INVALID");
  return actionResponse({ ...parsed, status: "accepted" }, { actionId: parsed.actionId as Hex, teeId: machine.teeId });
}

function tenderMarket(env: Record<string, string | undefined>): Address {
  const value = env.VITE_FLARE_MARKET_ADDRESS?.trim();
  if (!value || !isAddress(value)) throw new Error("FLARE_MARKET_NOT_CONFIGURED");
  return getAddress(value);
}

export function assertFlareVendorApproved(approved: boolean): void {
  if (approved !== true) throw new Error("FLARE_VENDOR_NOT_APPROVED");
}

async function waitForReceipt(
  tenderId: bigint,
  machineIndex: number,
  action: FlareIngressAction,
  env: Record<string, string | undefined>,
): Promise<FlareBidReceipt> {
  for (let attempt = 0; attempt < pollingAttempts; attempt += 1) {
    const response = await fetchWithTimeout(
      `${ingressUrl(env)}/flare/ingress/tenders/${positiveId(tenderId)}/machines/${machineIndex}/results/${action.actionId}`,
      { headers: { accept: "application/json" } },
    );
    if (response.status === 202 || response.status === 404) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, pollingDelayMs));
      continue;
    }
    if (!response.ok) throw new Error(response.status === 503 ? "FLARE_INGRESS_UNAVAILABLE" : "FLARE_RECEIPT_INVALID");
    const record = jsonResponse(await response.json(), "FLARE_RECEIPT_INVALID");
    if (record.status !== "ready" || record.actionId !== action.actionId || typeof record.data !== "string") {
      throw new Error("FLARE_RECEIPT_INVALID");
    }
    const receipt = decodeBidReceipt(record.data as Hex);
    if (receipt.teeId.toLowerCase() !== action.teeId.toLowerCase() || receipt.expiry !== action.expiresAt) {
      throw new Error("FLARE_RECEIPT_BINDING_INVALID");
    }
    const signer = await recoverBidReceiptSigner(receipt);
    if (!isAddressEqual(signer, action.teeId)) throw new Error("FLARE_RECEIPT_SIGNATURE_INVALID");
    return receipt;
  }
  throw new Error("FLARE_RECEIPT_PENDING");
}

export async function submitFlareBid(input: {
  tender: FlarePublicTender;
  vendor: Address;
  priceMicros: bigint;
  deliveryDays: number;
  warrantyDays: number;
  walletClient: WalletClient;
  onStage?: (stage: "keys" | "encrypting" | "authorizing" | "waiting-receipts" | "signing" | "confirming") => void;
  env?: Record<string, string | undefined>;
}): Promise<FlareBidSubmissionResult> {
  const env = input.env ?? import.meta.env;
  const market = tenderMarket(env);
  const now = BigInt(Math.floor(Date.now() / 1_000));
  if (input.tender.status !== "Open" || input.tender.bidDeadline <= now) throw new Error("FLARE_BID_NOT_AVAILABLE");
  if (input.tender.scoringPolicy.requiredCredentials.length !== 0) throw new Error("FLARE_CREDENTIALS_REQUIRED");
  if (input.priceMicros <= 0n || input.priceMicros > input.tender.scoringPolicy.ceilingXrpMicros) throw new Error("FLARE_BID_PRICE_INVALID");
  if (!Number.isInteger(input.deliveryDays) || input.deliveryDays < 0 || input.deliveryDays > input.tender.scoringPolicy.maxDeliveryDays) throw new Error("FLARE_BID_DELIVERY_INVALID");
  if (!Number.isInteger(input.warrantyDays) || input.warrantyDays < input.tender.scoringPolicy.minWarrantyDays || input.warrantyDays > input.tender.scoringPolicy.maxWarrantyDays) throw new Error("FLARE_BID_WARRANTY_INVALID");
  const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl(env)) });
  const approved = await publicClient.readContract({
    address: market,
    abi: flareQuorumFlareMarketAbi,
    functionName: "isApprovedVendor",
    args: [input.tender.tenderId, input.vendor],
  });
  assertFlareVendorApproved(approved === true);
  const machines = await loadFlareIngressMachines(input.tender.tenderId, env);
  input.onStage?.("encrypting");
  const submissionNonce = BigInt(randomHex(8));
  const receiptExpiry = input.tender.bidDeadline < now + 240n ? input.tender.bidDeadline : now + 240n;
  const submission: FlarePrivateBidSubmission = {
    schemaVersion: 1,
    chainId: 114n,
    market,
    extensionId: input.tender.extensionId,
    codeVersion: input.tender.codeVersion,
    tenderId: input.tender.tenderId,
    vendor: input.vendor,
    submissionNonce,
    rules: input.tender.scoringPolicy,
    receiptExpiry,
    quoteCurrency: 0,
    priceMicros: input.priceMicros,
    deliveryDays: input.deliveryDays,
    warrantyDays: input.warrantyDays,
    credentials: [],
    salt: randomHex(32),
  };
  const commitment = privateBidCommitment(submission);
  const plaintext = hexToBytes(encodePrivateBidSubmission(submission));
  input.onStage?.("authorizing");
  const actions = [] as FlareIngressAction[];
  for (const machine of machines) {
    const ciphertext = await encryptPrivateBidForTee(plaintext, machine.publicKey);
    actions.push(await submitEncrypted(input.tender, input.vendor, machine, submissionNonce, ciphertext, receiptExpiry, input.walletClient, env));
  }
  input.onStage?.("waiting-receipts");
  const receipts = await Promise.all(actions.map((action, index) => waitForReceipt(input.tender.tenderId, index, action, env)));
  const prepared = await prepareBidReceiptSet(receipts, {
    market,
    extensionId: input.tender.extensionId,
    codeVersion: input.tender.codeVersion,
    tenderId: input.tender.tenderId,
    rulesHash: input.tender.rulesHash,
    vendor: input.vendor,
    submissionNonce,
    plaintextCommitment: commitment,
    bidDeadline: input.tender.bidDeadline,
    teeIds: machines.map((machine) => machine.teeId) as [Address, Address, Address],
  });
  input.onStage?.("signing");
  const simulation = await publicClient.simulateContract({
    account: input.vendor,
    address: market,
    abi: flareQuorumFlareMarketAbi,
    functionName: "submitBidReceipts",
    args: [input.tender.tenderId, prepared.receipts, prepared.signatures],
  });
  const transactionHash = await input.walletClient.writeContract(simulation.request);
  input.onStage?.("confirming");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error("FLARE_BID_TRANSACTION_FAILED");
  return {
    submission,
    commitment,
    receipts: receipts as [FlareBidReceipt, FlareBidReceipt, FlareBidReceipt],
    actions: actions as [FlareIngressAction, FlareIngressAction, FlareIngressAction],
    transactionHash,
    blockNumber: receipt.blockNumber,
  };
}
