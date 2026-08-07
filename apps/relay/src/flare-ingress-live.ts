import {
  parseFccActionResponse,
  teeIdentityFromPublicKey,
  teePublicKeyFingerprint,
  veilBidDirectOpType,
  veilBidDirectSubmitCommand,
  veilBidFlareMarketAbi,
  type FlareTeePublicKey,
} from "@veilbid/flare-bindings";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { FlareIngressConfig } from "./flare-ingress-config.js";
import type {
  FlareBidIngressChain,
  FlareBidIngressProxy,
  FlareBidIngressTender,
} from "./flare-ingress.js";
import { parseFlareTender } from "./flare-lifecycle.js";

const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const teeManagerAbi = [
  {
    type: "function",
    name: "getTeeMachineStatus",
    stateMutability: "view",
    inputs: [{ name: "teeId", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "getExtensionId",
    stateMutability: "view",
    inputs: [{ name: "teeId", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPublicKey",
    stateMutability: "view",
    inputs: [{ name: "teeId", type: "address" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "x", type: "bytes32" },
        { name: "y", type: "bytes32" },
      ],
    }],
  },
  {
    type: "function",
    name: "getTeeMachineWithAttestationData",
    stateMutability: "view",
    inputs: [{ name: "teeId", type: "address" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "teeId", type: "address" },
        { name: "initialTeeId", type: "address" },
        { name: "url", type: "string" },
        { name: "codeHash", type: "bytes32" },
        { name: "platform", type: "bytes32" },
      ],
    }],
  },
] as const satisfies Abi;

const marketAbi = veilBidFlareMarketAbi as Abi;
const proxyResponseLimit = 640 * 1024;

export interface FlareIngressReader {
  getChainId(): Promise<number>;
  getBlock(): Promise<{ number: bigint | null; timestamp: bigint }>;
  getCode(args: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
}

export type FlareIngressFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function createReader(rpcUrl: string): FlareIngressReader {
  const client = createPublicClient({
    chain: coston2Chain,
    transport: http(rpcUrl, { retryCount: 2, timeout: 12_000 }),
  });
  return {
    getChainId: () => client.getChainId(),
    getBlock: async () => {
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp };
    },
    getCode: (args) => client.getCode(args),
    readContract: (args) => client.readContract(args as never),
  };
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function bytes32(value: unknown, code: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(code);
  return value.toLowerCase() as Hex;
}

function address(value: unknown, code: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(code);
  return getAddress(value);
}

function machinePublicKey(value: unknown): FlareTeePublicKey {
  const key = object(value, "MALFORMED_FCC_PUBLIC_KEY");
  const result = {
    x: bytes32(key.x, "MALFORMED_FCC_PUBLIC_KEY"),
    y: bytes32(key.y, "MALFORMED_FCC_PUBLIC_KEY"),
  };
  if (/^0x0{64}$/.test(result.x) || /^0x0{64}$/.test(result.y)) {
    throw new Error("MALFORMED_FCC_PUBLIC_KEY");
  }
  return result;
}

function numericStatus(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint" && value >= 0n && value <= 255n) return Number(value);
  throw new Error("MALFORMED_FCC_MACHINE_STATUS");
}

function extensionId(value: unknown): bigint {
  if (typeof value !== "bigint" || value <= 0n) throw new Error("MALFORMED_FCC_EXTENSION_ID");
  return value;
}

function registeredProxyUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("MALFORMED_FCC_MACHINE_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("MALFORMED_FCC_MACHINE_URL");
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash
  ) throw new Error("MALFORMED_FCC_MACHINE_URL");
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function exactBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

export class LiveFlareBidIngressChain implements FlareBidIngressChain {
  readonly config: Pick<FlareIngressConfig, "marketAddress" | "proxyUrls" | "rpcUrl" | "teeManagerAddress">;
  readonly reader: FlareIngressReader;

  constructor(
    config: Pick<FlareIngressConfig, "marketAddress" | "proxyUrls" | "rpcUrl" | "teeManagerAddress">,
    reader: FlareIngressReader = createReader(config.rpcUrl),
  ) {
    this.config = config;
    this.reader = reader;
  }

  async inspect(tenderId: bigint, vendor?: Address): Promise<FlareBidIngressTender> {
    if (tenderId <= 0n) throw new Error("INVALID_FLARE_TENDER_ID");
    const [chainId, block] = await Promise.all([this.reader.getChainId(), this.reader.getBlock()]);
    if (chainId !== 114) throw new Error("WRONG_FLARE_INGRESS_CHAIN");
    if (block.number === null || block.timestamp <= 0n) throw new Error("MALFORMED_FLARE_CHAIN_SNAPSHOT");

    const [marketCode, managerValue, tenderValue] = await Promise.all([
      this.reader.getCode({ address: this.config.marketAddress, blockNumber: block.number }),
      this.reader.readContract({
        address: this.config.marketAddress,
        abi: marketAbi,
        functionName: "teeManager",
        blockNumber: block.number,
      }),
      this.reader.readContract({
        address: this.config.marketAddress,
        abi: marketAbi,
        functionName: "getTender",
        args: [tenderId],
        blockNumber: block.number,
      }),
    ]);
    if (marketCode === undefined || marketCode === "0x") throw new Error("FLARE_MARKET_CODE_MISSING");
    const manager = address(managerValue, "MALFORMED_FLARE_TEE_MANAGER");
    if (!isAddressEqual(manager, this.config.teeManagerAddress)) {
      throw new Error("FLARE_TEE_MANAGER_BINDING_MISMATCH");
    }
    const managerCode = await this.reader.getCode({ address: manager, blockNumber: block.number });
    if (managerCode === undefined || managerCode === "0x") throw new Error("FLARE_TEE_MANAGER_CODE_MISSING");
    const tender = parseFlareTender(tenderId, tenderValue);

    const machineValues = await Promise.all(tender.teeIds.map(async (teeId) => {
      const [status, machineExtensionId, publicKey, machine] = await Promise.all([
        this.reader.readContract({
          address: manager,
          abi: teeManagerAbi,
          functionName: "getTeeMachineStatus",
          args: [teeId],
          blockNumber: block.number as bigint,
        }),
        this.reader.readContract({
          address: manager,
          abi: teeManagerAbi,
          functionName: "getExtensionId",
          args: [teeId],
          blockNumber: block.number as bigint,
        }),
        this.reader.readContract({
          address: manager,
          abi: teeManagerAbi,
          functionName: "getPublicKey",
          args: [teeId],
          blockNumber: block.number as bigint,
        }),
        this.reader.readContract({
          address: manager,
          abi: teeManagerAbi,
          functionName: "getTeeMachineWithAttestationData",
          args: [teeId],
          blockNumber: block.number as bigint,
        }),
      ]);
      return { status, machineExtensionId, publicKey, machine };
    }));

    const teePublicKeys = machineValues.map((value, index) => {
      if (numericStatus(value.status) !== 2) throw new Error("FCC_MACHINE_NOT_PRODUCTION");
      if (extensionId(value.machineExtensionId) !== tender.extensionId) {
        throw new Error("FCC_MACHINE_EXTENSION_MISMATCH");
      }
      const teeId = tender.teeIds[index];
      const machine = object(value.machine, "MALFORMED_FCC_MACHINE");
      if (!isAddressEqual(address(machine.teeId, "MALFORMED_FCC_MACHINE"), teeId)) {
        throw new Error("FCC_MACHINE_IDENTITY_MISMATCH");
      }
      if (bytes32(machine.codeHash, "MALFORMED_FCC_MACHINE") !== tender.codeVersion.toLowerCase()) {
        throw new Error("FCC_MACHINE_CODE_VERSION_MISMATCH");
      }
      const configuredUrl = this.config.proxyUrls[index];
      if (registeredProxyUrl(machine.url) !== configuredUrl) throw new Error("FCC_MACHINE_PROXY_URL_MISMATCH");
      const publicKey = machinePublicKey(value.publicKey);
      if (
        !isAddressEqual(teeIdentityFromPublicKey(publicKey), teeId) ||
        teePublicKeyFingerprint(publicKey).toLowerCase() !== tender.teeKeyFingerprints[index].toLowerCase()
      ) throw new Error("FCC_TEE_IDENTITY_MISMATCH");
      return publicKey;
    }) as [FlareTeePublicKey, FlareTeePublicKey, FlareTeePublicKey];

    let approved = false;
    let submitted = false;
    if (vendor !== undefined) {
      const [approvedValue, submittedValue] = await Promise.all([
        this.reader.readContract({
          address: this.config.marketAddress,
          abi: marketAbi,
          functionName: "isApprovedVendor",
          args: [tenderId, vendor],
          blockNumber: block.number,
        }),
        this.reader.readContract({
          address: this.config.marketAddress,
          abi: marketAbi,
          functionName: "hasSubmittedBid",
          args: [tenderId, vendor],
          blockNumber: block.number,
        }),
      ]);
      approved = exactBoolean(approvedValue, "MALFORMED_FLARE_VENDOR_ADMISSION");
      submitted = exactBoolean(submittedValue, "MALFORMED_FLARE_VENDOR_SUBMISSION");
    }
    return {
      market: this.config.marketAddress,
      status: tender.status,
      chainTimestamp: block.timestamp,
      bidDeadline: tender.bidDeadline,
      rulesHash: tender.rulesHash,
      extensionId: tender.extensionId,
      codeVersion: tender.codeVersion,
      teeIds: tender.teeIds,
      teeKeyFingerprints: tender.teeKeyFingerprints,
      teePublicKeys,
      approved,
      submitted,
    };
  }
}

async function boundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > proxyResponseLimit)) {
    throw new Error("FCC_PROXY_RESPONSE_INVALID");
  }
  if (response.body === null) throw new Error("FCC_PROXY_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > proxyResponseLimit) {
      await reader.cancel();
      throw new Error("FCC_PROXY_RESPONSE_INVALID");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function verifyProxyAction(value: unknown, instruction: {
  opType: Hex;
  opCommand: Hex;
  message: Hex;
}): Hex {
  const response = object(value, "FCC_PROXY_RESPONSE_INVALID");
  const data = object(response.data, "FCC_PROXY_RESPONSE_INVALID");
  const id = bytes32(data.id, "FCC_PROXY_RESPONSE_INVALID");
  if (data.type !== "direct" || data.submissionTag !== "submit") {
    throw new Error("FCC_PROXY_RESPONSE_INVALID");
  }
  const encoded = data.message;
  if (typeof encoded !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(encoded)) {
    throw new Error("FCC_PROXY_RESPONSE_INVALID");
  }
  let returned: Record<string, unknown>;
  try {
    const bytes = Uint8Array.from(encoded.slice(2).match(/.{2}/g) ?? [], (item) => Number.parseInt(item, 16));
    returned = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), "FCC_PROXY_RESPONSE_INVALID");
  } catch {
    throw new Error("FCC_PROXY_RESPONSE_INVALID");
  }
  const returnedKeys = Object.keys(returned).sort();
  if (
    returnedKeys.length !== 3 || !["message", "opCommand", "opType"].every((key) => returnedKeys.includes(key)) ||
    typeof returned.opType !== "string" || returned.opType.toLowerCase() !== instruction.opType.toLowerCase() ||
    typeof returned.opCommand !== "string" || returned.opCommand.toLowerCase() !== instruction.opCommand.toLowerCase() ||
    typeof returned.message !== "string" || returned.message.toLowerCase() !== instruction.message.toLowerCase()
  ) throw new Error("FCC_PROXY_ACTION_MISMATCH");
  return id;
}

export class LiveFlareBidIngressProxy implements FlareBidIngressProxy {
  readonly #urls: readonly [string, string, string];
  readonly #apiKeys: readonly [string, string, string];
  readonly #fetch: FlareIngressFetch;

  constructor(
    config: Pick<FlareIngressConfig, "directApiKeys" | "proxyUrls">,
    fetchImplementation: FlareIngressFetch = fetch,
  ) {
    this.#urls = config.proxyUrls;
    this.#apiKeys = config.directApiKeys;
    this.#fetch = fetchImplementation;
  }

  async submit(
    machineIndex: number,
    instruction: { opType: Hex; opCommand: Hex; message: Hex },
  ): Promise<{ actionId: Hex }> {
    if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex >= 3) {
      throw new Error("FCC_PROXY_MACHINE_INDEX_INVALID");
    }
    let response: Response;
    try {
      response = await this.#fetch(`${this.#urls[machineIndex]}/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.#apiKeys[machineIndex],
        },
        body: JSON.stringify(instruction),
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new Error("FCC_PROXY_UNAVAILABLE");
    }
    if (!response.ok) throw new Error("FCC_PROXY_REJECTED");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new Error("FCC_PROXY_RESPONSE_INVALID");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await boundedBody(response));
    } catch (error) {
      if (error instanceof Error && error.message === "FCC_PROXY_RESPONSE_INVALID") throw error;
      throw new Error("FCC_PROXY_RESPONSE_INVALID");
    }
    return { actionId: verifyProxyAction(parsed, instruction) };
  }

  async result(
    machineIndex: number,
    actionId: Hex,
  ): Promise<{ actionId: Hex; status: number; submissionTag: string; opType: Hex; opCommand: Hex; data: Hex }> {
    if (!Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex >= 3) {
      throw new Error("FCC_PROXY_MACHINE_INDEX_INVALID");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(actionId)) throw new Error("FCC_PROXY_ACTION_INVALID");
    const resultUrl = new URL(`${this.#urls[machineIndex]}/action/result/${actionId}`);
    resultUrl.searchParams.set("submissionTag", "submit");
    let response: Response;
    try {
      response = await this.#fetch(resultUrl, {
        method: "GET",
        headers: { accept: "application/json", "X-API-Key": this.#apiKeys[machineIndex] },
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new Error("FCC_PROXY_UNAVAILABLE");
    }
    if (response.status === 404 || response.status === 202) throw new Error("FCC_PROXY_RESULT_PENDING");
    if (!response.ok) throw new Error("FCC_PROXY_REJECTED");
    if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      throw new Error("FCC_PROXY_RESPONSE_INVALID");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await boundedBody(response));
    } catch (error) {
      if (error instanceof Error && error.message === "FCC_PROXY_RESPONSE_INVALID") throw error;
      throw new Error("FCC_PROXY_RESPONSE_INVALID");
    }
    const action = parseFccActionResponse(parsed).result;
    if (
      action.id.toLowerCase() !== actionId.toLowerCase() || action.submissionTag !== "submit" ||
      action.opType.toLowerCase() !== veilBidDirectOpType.toLowerCase() ||
      action.opCommand.toLowerCase() !== veilBidDirectSubmitCommand.toLowerCase()
    ) throw new Error("FCC_PROXY_ACTION_MISMATCH");
    return {
      actionId: action.id,
      status: action.status,
      submissionTag: action.submissionTag,
      opType: action.opType,
      opCommand: action.opCommand,
      data: action.data,
    };
  }
}
