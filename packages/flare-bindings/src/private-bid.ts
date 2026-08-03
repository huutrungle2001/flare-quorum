import { secp256k1 } from "@noble/curves/secp256k1";
import {
  bytesToHex,
  concatBytes,
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  isAddress,
  isAddressEqual,
  keccak256,
  padHex,
  recoverMessageAddress,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import {
  assertFlareScoringPolicy,
  calculateFlareRulesHash,
  type FlareScoringPolicy,
} from "./smart-account.js";

const uint64Max = 0xffff_ffff_ffff_ffffn;
const uint16Max = 0xffff;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const bidDomain = keccak256(stringToHex("VEILBID_BID_V1"));
const credentialDomain = keccak256(stringToHex("VEILBID_CREDENTIAL_V1"));
const bidReceiptDomain = keccak256(stringToHex("VEILBID_BID_RECEIPT_V1"));

export const veilBidDirectOpType = padHex(stringToHex("VEILBID_BID"), { dir: "right", size: 32 });
export const veilBidDirectSubmitCommand = padHex(stringToHex("SUBMIT_V1"), { dir: "right", size: 32 });

const credentialRequirementComponents = [
  { name: "credentialType", type: "bytes32" },
  { name: "issuer", type: "address" },
] as const;

const scoringRulesComponents = [
  { name: "schemaVersion", type: "uint16" },
  { name: "ceilingXrpMicros", type: "uint64" },
  { name: "bidDeadline", type: "uint64" },
  { name: "allowXrp", type: "bool" },
  { name: "allowUsd", type: "bool" },
  { name: "ftsoFeedId", type: "bytes21" },
  { name: "maxDeliveryDays", type: "uint16" },
  { name: "minWarrantyDays", type: "uint16" },
  { name: "maxWarrantyDays", type: "uint16" },
  { name: "priceWeightBps", type: "uint16" },
  { name: "deliveryWeightBps", type: "uint16" },
  { name: "warrantyWeightBps", type: "uint16" },
  { name: "requiredCredentials", type: "tuple[]", components: credentialRequirementComponents },
] as const;

const credentialComponents = [
  { name: "credentialType", type: "bytes32" },
  { name: "issuer", type: "address" },
  { name: "validUntil", type: "uint64" },
  { name: "nonce", type: "bytes32" },
  { name: "signature", type: "bytes" },
] as const;

const bidSubmissionParameter = {
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "market", type: "address" },
    { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" },
    { name: "tenderId", type: "uint256" },
    { name: "vendor", type: "address" },
    { name: "submissionNonce", type: "uint256" },
    { name: "rules", type: "tuple", components: scoringRulesComponents },
    { name: "receiptExpiry", type: "uint64" },
    { name: "quoteCurrency", type: "uint8" },
    { name: "priceMicros", type: "uint64" },
    { name: "deliveryDays", type: "uint16" },
    { name: "warrantyDays", type: "uint16" },
    { name: "credentials", type: "tuple[]", components: credentialComponents },
    { name: "salt", type: "bytes32" },
  ],
} as const;

const bidReceiptParameter = {
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "market", type: "address" },
    { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" },
    { name: "tenderId", type: "uint256" },
    { name: "vendor", type: "address" },
    { name: "submissionNonce", type: "uint256" },
    { name: "rulesHash", type: "bytes32" },
    { name: "plaintextCommitment", type: "bytes32" },
    { name: "teeId", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "signature", type: "bytes" },
  ],
} as const;

const credentialDigestParameters = [
  { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" },
  { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "address" },
  { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" },
] as const;

const receiptDigestParameters = [
  { type: "bytes32" }, { type: "uint16" }, { type: "uint256" }, { type: "address" },
  { type: "uint256" }, { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" },
  { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "address" },
  { type: "uint64" },
] as const;

export interface FlareBidCredential {
  credentialType: Hex;
  issuer: Address;
  validUntil: bigint;
  nonce: Hex;
  signature: Hex;
}

export interface FlarePrivateBidSubmission {
  schemaVersion: 1;
  chainId: 114n;
  market: Address;
  extensionId: bigint;
  codeVersion: Hex;
  tenderId: bigint;
  vendor: Address;
  submissionNonce: bigint;
  rules: FlareScoringPolicy;
  receiptExpiry: bigint;
  quoteCurrency: 0 | 1;
  priceMicros: bigint;
  deliveryDays: number;
  warrantyDays: number;
  credentials: readonly FlareBidCredential[];
  salt: Hex;
}

export interface FlareBidReceipt {
  schemaVersion: number;
  chainId: bigint;
  market: Address;
  extensionId: bigint;
  codeVersion: Hex;
  tenderId: bigint;
  vendor: Address;
  submissionNonce: bigint;
  rulesHash: Hex;
  plaintextCommitment: Hex;
  teeId: Address;
  expiry: bigint;
  signature: Hex;
}

export interface FlareTeePublicKey {
  x: Hex;
  y: Hex;
}

export interface FlareBidReceiptSetContext {
  market: Address;
  extensionId: bigint;
  codeVersion: Hex;
  tenderId: bigint;
  rulesHash: Hex;
  vendor: Address;
  submissionNonce: bigint;
  plaintextCommitment: Hex;
  bidDeadline: bigint;
  teeIds: readonly [Address, Address, Address];
}

export interface FlareContractBidReceipt {
  schemaVersion: number;
  vendor: Address;
  submissionNonce: bigint;
  plaintextCommitment: Hex;
  teeId: Address;
  expiry: bigint;
}

export interface PreparedFlareBidReceiptSet {
  receipts: readonly [FlareContractBidReceipt, FlareContractBidReceipt, FlareContractBidReceipt];
  signatures: readonly [Hex, Hex, Hex];
}

export interface DeterministicEciesEntropy {
  /** Test/vector hook. Production callers must omit this object. */
  ephemeralPrivateKey: Hex;
  /** Test/vector hook. Production callers must omit this object. */
  iv: Hex;
}

function validHash(value: Hex): boolean {
  return bytes32Pattern.test(value) && !/^0x0{64}$/.test(value);
}

function validAddress(value: Address): boolean {
  return isAddress(value, { strict: true }) && value.toLowerCase() !== zeroAddress;
}

function validUint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= uint16Max;
}

export function assertPrivateBidSubmission(submission: FlarePrivateBidSubmission): void {
  assertFlareScoringPolicy(submission.rules);
  if (
    submission.schemaVersion !== 1 || submission.chainId !== 114n || !validAddress(submission.market) ||
    submission.extensionId < 0x10000n || !validHash(submission.codeVersion) || submission.tenderId <= 0n ||
    !validAddress(submission.vendor) || submission.submissionNonce <= 0n || submission.receiptExpiry <= 0n ||
    submission.receiptExpiry > submission.rules.bidDeadline || submission.priceMicros <= 0n ||
    submission.priceMicros > uint64Max || !validUint16(submission.deliveryDays) ||
    submission.deliveryDays > submission.rules.maxDeliveryDays || !validUint16(submission.warrantyDays) ||
    submission.warrantyDays < submission.rules.minWarrantyDays || !validHash(submission.salt) ||
    submission.credentials.length !== submission.rules.requiredCredentials.length ||
    (submission.quoteCurrency !== 0 && submission.quoteCurrency !== 1) ||
    (submission.quoteCurrency === 0 && !submission.rules.allowXrp) ||
    (submission.quoteCurrency === 0 && submission.priceMicros > submission.rules.ceilingXrpMicros) ||
    (submission.quoteCurrency === 1 && !submission.rules.allowUsd)
  ) throw new Error("INVALID_PRIVATE_BID");
  const requirements = new Set(submission.rules.requiredCredentials.map((value) =>
    `${value.credentialType.toLowerCase()}:${value.issuer.toLowerCase()}`,
  ));
  const observed = new Set<string>();
  for (const credential of submission.credentials) {
    const key = `${credential.credentialType.toLowerCase()}:${credential.issuer.toLowerCase()}`;
    if (
      !requirements.has(key) || observed.has(key) || credential.validUntil < submission.rules.bidDeadline ||
      credential.validUntil > uint64Max || !validHash(credential.nonce) ||
      !/^0x[0-9a-fA-F]{130}$/.test(credential.signature)
    ) throw new Error("INVALID_PRIVATE_BID_CREDENTIAL");
    observed.add(key);
  }
}

export function encodePrivateBidSubmission(submission: FlarePrivateBidSubmission): Hex {
  assertPrivateBidSubmission(submission);
  return encodeAbiParameters([bidSubmissionParameter], [submission]);
}

export function privateBidCommitment(submission: FlarePrivateBidSubmission): Hex {
  assertPrivateBidSubmission(submission);
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, bidSubmissionParameter], [bidDomain, submission]));
}

export function credentialDigest(input: {
  submission: Pick<FlarePrivateBidSubmission, "chainId" | "market" | "extensionId" | "codeVersion" | "tenderId" | "vendor" | "rules">;
  credential: Pick<FlareBidCredential, "credentialType" | "issuer" | "validUntil" | "nonce">;
}): Hex {
  return keccak256(encodeAbiParameters(credentialDigestParameters, [
    credentialDomain,
    input.submission.chainId,
    input.submission.market,
    input.submission.extensionId,
    input.submission.codeVersion,
    input.submission.tenderId,
    calculateFlareRulesHash(input.submission.rules),
    input.submission.vendor,
    input.credential.credentialType,
    input.credential.validUntil,
    input.credential.nonce,
  ]));
}

export function decodeBidReceipt(data: Hex): FlareBidReceipt {
  const [receipt] = decodeAbiParameters([bidReceiptParameter], data);
  return receipt;
}

export function bidReceiptDigest(receipt: FlareBidReceipt): Hex {
  return keccak256(encodeAbiParameters(receiptDigestParameters, [
    bidReceiptDomain,
    receipt.schemaVersion,
    receipt.chainId,
    receipt.market,
    receipt.extensionId,
    receipt.codeVersion,
    receipt.tenderId,
    receipt.rulesHash,
    receipt.vendor,
    receipt.submissionNonce,
    receipt.plaintextCommitment,
    receipt.teeId,
    receipt.expiry,
  ]));
}

export async function recoverBidReceiptSigner(receipt: FlareBidReceipt): Promise<Address> {
  return getAddress(await recoverMessageAddress({
    message: { raw: bidReceiptDigest(receipt) },
    signature: receipt.signature,
  }));
}

function equalHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Verifies all private-ingress bindings before exposing contract calldata. */
export async function prepareBidReceiptSet(
  received: readonly FlareBidReceipt[],
  context: FlareBidReceiptSetContext,
): Promise<PreparedFlareBidReceiptSet> {
  if (
    received.length !== 3 || new Set(context.teeIds.map((value) => value.toLowerCase())).size !== 3 ||
    !validAddress(context.market) || context.extensionId < 0x10000n || !validHash(context.codeVersion) ||
    context.tenderId <= 0n || !validHash(context.rulesHash) || !validAddress(context.vendor) ||
    context.submissionNonce <= 0n || !validHash(context.plaintextCommitment) || context.bidDeadline <= 0n
  ) throw new Error("INVALID_BID_RECEIPT_CONTEXT");
  const ordered: FlareBidReceipt[] = [];
  for (const teeId of context.teeIds) {
    const candidates = received.filter((receipt) => isAddressEqual(receipt.teeId, teeId));
    if (candidates.length !== 1) throw new Error("INVALID_BID_RECEIPT_SET");
    ordered.push(candidates[0]);
  }
  const expiry = ordered[0].expiry;
  for (const receipt of ordered) {
    if (
      receipt.schemaVersion !== 1 || receipt.chainId !== 114n || !isAddressEqual(receipt.market, context.market) ||
      receipt.extensionId !== context.extensionId || !equalHex(receipt.codeVersion, context.codeVersion) ||
      receipt.tenderId !== context.tenderId || !equalHex(receipt.rulesHash, context.rulesHash) ||
      !isAddressEqual(receipt.vendor, context.vendor) || receipt.submissionNonce !== context.submissionNonce ||
      !equalHex(receipt.plaintextCommitment, context.plaintextCommitment) || receipt.expiry !== expiry ||
      receipt.expiry <= 0n || receipt.expiry > context.bidDeadline ||
      !/^0x[0-9a-fA-F]{130}$/.test(receipt.signature)
    ) throw new Error("INVALID_BID_RECEIPT_SET");
    let signer: Address;
    try {
      signer = await recoverBidReceiptSigner(receipt);
    } catch {
      throw new Error("INVALID_BID_RECEIPT_SIGNATURE");
    }
    if (!isAddressEqual(signer, receipt.teeId)) throw new Error("INVALID_BID_RECEIPT_SIGNATURE");
  }
  const contractReceipt = (receipt: FlareBidReceipt): FlareContractBidReceipt => ({
    schemaVersion: receipt.schemaVersion,
    vendor: receipt.vendor,
    submissionNonce: receipt.submissionNonce,
    plaintextCommitment: receipt.plaintextCommitment,
    teeId: receipt.teeId,
    expiry: receipt.expiry,
  });
  return {
    receipts: [contractReceipt(ordered[0]), contractReceipt(ordered[1]), contractReceipt(ordered[2])],
    signatures: [ordered[0].signature, ordered[1].signature, ordered[2].signature],
  };
}

function validatedPublicKeyBytes(publicKey: FlareTeePublicKey): Uint8Array {
  if (!bytes32Pattern.test(publicKey.x) || !bytes32Pattern.test(publicKey.y)) {
    throw new Error("INVALID_TEE_PUBLIC_KEY");
  }
  const bytes = concatBytes([new Uint8Array([4]), hexToBytes(publicKey.x), hexToBytes(publicKey.y)]);
  try {
    secp256k1.ProjectivePoint.fromHex(bytes);
  } catch {
    throw new Error("INVALID_TEE_PUBLIC_KEY");
  }
  return bytes;
}

export function teePublicKeyFingerprint(publicKey: FlareTeePublicKey): Hex {
  validatedPublicKeyBytes(publicKey);
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [publicKey.x, publicKey.y]));
}

export function teeIdentityFromPublicKey(publicKey: FlareTeePublicKey): Address {
  validatedPublicKeyBytes(publicKey);
  const digest = keccak256(concatHex([publicKey.x, publicKey.y]));
  return getAddress(`0x${digest.slice(-40)}`);
}

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error("WEB_CRYPTO_UNAVAILABLE");
  }
  return globalThis.crypto;
}

function bufferSource(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await browserCrypto().subtle.digest("SHA-256", bufferSource(value)));
}

async function randomPrivateKey(): Promise<Uint8Array> {
  const value = new Uint8Array(32);
  do {
    browserCrypto().getRandomValues(value);
  } while (!secp256k1.utils.isValidPrivateKey(value));
  return value;
}

/**
 * Encrypts exactly as tee-node's go-ethereum ECIES_AES128_SHA256 path:
 * ephemeral secp256k1 key || AES-128-CTR(iv || ciphertext) || HMAC-SHA256.
 */
export async function encryptPrivateBidForTee(
  plaintext: Uint8Array,
  publicKey: FlareTeePublicKey,
  deterministicEntropy?: DeterministicEciesEntropy,
): Promise<Hex> {
  if (plaintext.length === 0 || plaintext.length > 256 * 1024) throw new Error("INVALID_PRIVATE_BID_SIZE");
  const recipient = validatedPublicKeyBytes(publicKey);
  const privateKey = deterministicEntropy
    ? hexToBytes(deterministicEntropy.ephemeralPrivateKey)
    : await randomPrivateKey();
  const iv = bufferSource(deterministicEntropy ? hexToBytes(deterministicEntropy.iv) : browserCrypto().getRandomValues(new Uint8Array(16)));
  if (privateKey.length !== 32 || !secp256k1.utils.isValidPrivateKey(privateKey) || iv.length !== 16) {
    throw new Error("INVALID_ECIES_ENTROPY");
  }
  const ephemeral = secp256k1.getPublicKey(privateKey, false);
  const sharedPoint = secp256k1.getSharedSecret(privateKey, recipient, false);
  const sharedX = sharedPoint.slice(1, 33);
  const derived = await sha256(concatBytes([new Uint8Array([0, 0, 0, 1]), sharedX]));
  const encryptionKey = derived.slice(0, 16);
  const macKey = await sha256(derived.slice(16, 32));
  try {
    const importedEncryptionKey = await browserCrypto().subtle.importKey("raw", bufferSource(encryptionKey), "AES-CTR", false, ["encrypt"]);
    const encrypted = new Uint8Array(await browserCrypto().subtle.encrypt(
      { name: "AES-CTR", counter: iv, length: 128 },
      importedEncryptionKey,
      bufferSource(plaintext),
    ));
    const encryptedMessage = concatBytes([iv, encrypted]);
    const importedMacKey = await browserCrypto().subtle.importKey(
      "raw",
      bufferSource(macKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const tag = new Uint8Array(await browserCrypto().subtle.sign("HMAC", importedMacKey, bufferSource(encryptedMessage)));
    return bytesToHex(concatBytes([ephemeral, encryptedMessage, tag]));
  } finally {
    privateKey.fill(0);
    encryptionKey.fill(0);
    macKey.fill(0);
    derived.fill(0);
    sharedX.fill(0);
  }
}

export function directBidInstruction(ciphertext: Hex): {
  opType: Hex;
  opCommand: Hex;
  message: Hex;
} {
  const byteLength = (ciphertext.length - 2) / 2;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(ciphertext) || byteLength > 256 * 1024) {
    throw new Error("INVALID_PRIVATE_BID_CIPHERTEXT");
  }
  return { opType: veilBidDirectOpType, opCommand: veilBidDirectSubmitCommand, message: ciphertext };
}
