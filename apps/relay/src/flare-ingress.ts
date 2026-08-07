import {
  decodeBidReceipt,
  directBidInstruction,
  flareBidIngressTypedData,
  recoverBidReceiptSigner,
  teeIdentityFromPublicKey,
  teePublicKeyFingerprint,
  veilBidDirectOpType,
  veilBidDirectSubmitCommand,
  type FlareTeePublicKey,
} from "@veilbid/flare-bindings";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";

const maxAuthorizationLifetime = 5n * 60n;
const minimumEciesCiphertextBytes = 114;
const maximumEciesCiphertextBytes = 256 * 1024;
const requestKeys = [
  "schemaVersion", "market", "tenderId", "vendor", "teeId", "submissionNonce",
  "ciphertext", "expiresAt", "authorization",
] as const;

export interface FlareBidIngressRequest {
  schemaVersion: 1;
  market: Address;
  tenderId: bigint;
  vendor: Address;
  teeId: Address;
  submissionNonce: bigint;
  ciphertext: Hex;
  expiresAt: bigint;
  authorization: Hex;
}

export interface FlareBidIngressTender {
  market: Address;
  status: "FundingPending" | "Open" | "Closed" | "ComputePending" | "Awarded" | "Refunded" | "Cancelled";
  chainTimestamp: bigint;
  bidDeadline: bigint;
  rulesHash: Hex;
  extensionId: bigint;
  codeVersion: Hex;
  teeIds: readonly [Address, Address, Address];
  teeKeyFingerprints: readonly [Hex, Hex, Hex];
  teePublicKeys: readonly [FlareTeePublicKey, FlareTeePublicKey, FlareTeePublicKey];
  approved: boolean;
  submitted: boolean;
}

export interface FlareBidIngressChain {
  inspect(tenderId: bigint, vendor?: Address): Promise<FlareBidIngressTender>;
}

export interface FlareBidIngressProxy {
  submit(
    machineIndex: number,
    instruction: ReturnType<typeof directBidInstruction>,
  ): Promise<{ actionId: Hex }>;
  result(
    machineIndex: number,
    actionId: Hex,
  ): Promise<{ actionId: Hex; status: number; submissionTag: string; opType: Hex; opCommand: Hex; data: Hex }>;
}

export interface FlareBidIngressAccepted {
  actionId: Hex;
  teeId: Address;
  expiresAt: bigint;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_BID_INGRESS_REQUEST");
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== requestKeys.length || requestKeys.some((key) => !keys.includes(key))) {
    throw new Error("INVALID_BID_INGRESS_REQUEST");
  }
  return candidate;
}

function positiveDecimal(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) throw new Error("INVALID_BID_INGRESS_REQUEST");
  return BigInt(value);
}

function address(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) throw new Error("INVALID_BID_INGRESS_REQUEST");
  return getAddress(value);
}

function opaqueCiphertext(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error("INVALID_BID_INGRESS_REQUEST");
  }
  const bytes = (value.length - 2) / 2;
  if (bytes < minimumEciesCiphertextBytes || bytes > maximumEciesCiphertextBytes) {
    throw new Error("INVALID_BID_INGRESS_REQUEST");
  }
  return value as Hex;
}

export function parseFlareBidIngressRequest(value: unknown): FlareBidIngressRequest {
  const candidate = record(value);
  if (candidate.schemaVersion !== 1) throw new Error("INVALID_BID_INGRESS_REQUEST");
  if (typeof candidate.authorization !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(candidate.authorization)) {
    throw new Error("INVALID_BID_INGRESS_REQUEST");
  }
  return {
    schemaVersion: 1,
    market: address(candidate.market),
    tenderId: positiveDecimal(candidate.tenderId),
    vendor: address(candidate.vendor),
    teeId: address(candidate.teeId),
    submissionNonce: positiveDecimal(candidate.submissionNonce),
    ciphertext: opaqueCiphertext(candidate.ciphertext),
    expiresAt: positiveDecimal(candidate.expiresAt),
    authorization: candidate.authorization as Hex,
  };
}

export class FlareBidIngressGateway {
  readonly chain: FlareBidIngressChain;
  readonly proxy: FlareBidIngressProxy;

  constructor(chain: FlareBidIngressChain, proxy: FlareBidIngressProxy) {
    this.chain = chain;
    this.proxy = proxy;
  }

  async machineKeys(tenderId: bigint): Promise<readonly {
    teeId: Address;
    fingerprint: Hex;
    publicKey: FlareTeePublicKey;
  }[]> {
    const tender = await this.chain.inspect(tenderId);
    return tender.teeIds.map((teeId, index) => {
      const publicKey = tender.teePublicKeys[index];
      if (
        !isAddressEqual(teeIdentityFromPublicKey(publicKey), teeId) ||
        teePublicKeyFingerprint(publicKey).toLowerCase() !== tender.teeKeyFingerprints[index].toLowerCase()
      ) throw new Error("FCC_TEE_IDENTITY_MISMATCH");
      return { teeId, fingerprint: tender.teeKeyFingerprints[index], publicKey };
    });
  }

  async submit(request: FlareBidIngressRequest): Promise<FlareBidIngressAccepted> {
    const authorized = await verifyTypedData({
      ...flareBidIngressTypedData(request),
      address: request.vendor,
      signature: request.authorization,
    });
    if (!authorized) throw new Error("BID_INGRESS_AUTHORIZATION_INVALID");
    const tender = await this.chain.inspect(request.tenderId, request.vendor);
    if (!isAddressEqual(tender.market, request.market)) throw new Error("BID_INGRESS_MARKET_MISMATCH");
    if (
      tender.status !== "Open" || tender.chainTimestamp >= tender.bidDeadline || !tender.approved || tender.submitted ||
      request.expiresAt <= tender.chainTimestamp || request.expiresAt > tender.chainTimestamp + maxAuthorizationLifetime ||
      request.expiresAt > tender.bidDeadline
    ) throw new Error("BID_INGRESS_NOT_AVAILABLE");
    const machineIndex = tender.teeIds.findIndex((teeId) => isAddressEqual(teeId, request.teeId));
    if (machineIndex < 0) throw new Error("BID_INGRESS_TEE_MISMATCH");
    const publicKey = tender.teePublicKeys[machineIndex];
    if (
      !isAddressEqual(teeIdentityFromPublicKey(publicKey), request.teeId) ||
      teePublicKeyFingerprint(publicKey).toLowerCase() !== tender.teeKeyFingerprints[machineIndex].toLowerCase()
    ) throw new Error("FCC_TEE_IDENTITY_MISMATCH");
    const accepted = await this.proxy.submit(machineIndex, directBidInstruction(request.ciphertext));
    if (!/^0x[0-9a-fA-F]{64}$/.test(accepted.actionId)) throw new Error("FCC_PROXY_ACTION_INVALID");
    return { actionId: accepted.actionId, teeId: request.teeId, expiresAt: request.expiresAt };
  }

  async result(tenderId: bigint, machineIndex: number, actionId: Hex): Promise<{
    actionId: Hex;
    teeId: Address;
    data: Hex;
    expiresAt: bigint;
  }> {
    if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex >= 3) {
      throw new Error("FCC_PROXY_MACHINE_INDEX_INVALID");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(actionId)) throw new Error("FCC_PROXY_ACTION_INVALID");
    const tender = await this.chain.inspect(tenderId);
    const expectedTeeId = tender.teeIds[machineIndex];
    const result = await this.proxy.result(machineIndex, actionId);
    if (
      result.actionId.toLowerCase() !== actionId.toLowerCase() ||
      result.status !== 1 || result.submissionTag !== "submit" ||
      result.opType.toLowerCase() !== veilBidDirectOpType.toLowerCase() ||
      result.opCommand.toLowerCase() !== veilBidDirectSubmitCommand.toLowerCase()
    ) throw new Error("FCC_PROXY_ACTION_MISMATCH");
    const receipt = decodeBidReceipt(result.data);
    const signer = await recoverBidReceiptSigner(receipt);
    if (!isAddressEqual(receipt.teeId, expectedTeeId) || !isAddressEqual(signer, expectedTeeId)) {
      throw new Error("FCC_TEE_IDENTITY_MISMATCH");
    }
    if (
      receipt.chainId !== 114n || receipt.tenderId !== tenderId ||
      !isAddressEqual(receipt.market, tender.market) ||
      receipt.extensionId !== tender.extensionId ||
      receipt.codeVersion.toLowerCase() !== tender.codeVersion.toLowerCase() ||
      receipt.rulesHash.toLowerCase() !== tender.rulesHash.toLowerCase() ||
      receipt.expiry <= 0n || receipt.expiry > tender.bidDeadline
    ) {
      throw new Error("FCC_PROXY_ACTION_MISMATCH");
    }
    return {
      actionId,
      teeId: expectedTeeId,
      data: result.data,
      expiresAt: receipt.expiry,
    };
  }
}
