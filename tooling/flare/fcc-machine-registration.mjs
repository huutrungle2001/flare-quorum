import { createHash } from "node:crypto";

import { getAddress } from "viem";
import { publicKeyToAddress } from "viem/accounts";

import { isStableProxyUrl } from "./foundations.mjs";

const bytes32Pattern = /^0x[0-9a-f]{64}$/i;

function list(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function localOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function securePublicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.hostname.length > 0 && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function fixedHex(value) {
  const normalized = String(value ?? "").replace(/^0x/i, "").padStart(64, "0");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw new Error("FCC_MACHINE_PUBLIC_KEY_INVALID");
  return normalized.toLowerCase();
}

export function parseMachineInfo(info, expected) {
  const machine = info?.machineData;
  if (!machine || typeof machine !== "object" || Array.isArray(machine)) {
    throw new Error("FCC_MACHINE_INFO_INVALID");
  }
  const x = fixedHex(machine.publicKey?.x);
  const y = fixedHex(machine.publicKey?.y);
  const publicKey = `0x04${x}${y}`;
  const fields = {
    extensionId: String(machine.extensionId ?? "").toLowerCase(),
    initialOwner: getAddress(machine.initialOwner),
    codeHash: String(machine.codeHash ?? "").toLowerCase(),
    platform: String(machine.platform ?? "").toLowerCase(),
    governanceHash: String(machine.governanceHash ?? "").toLowerCase(),
  };
  if (
    !bytes32Pattern.test(fields.extensionId) ||
    !bytes32Pattern.test(fields.codeHash) ||
    !bytes32Pattern.test(fields.platform) ||
    !bytes32Pattern.test(fields.governanceHash) ||
    fields.extensionId !== expected.extensionId.toLowerCase() ||
    fields.initialOwner !== getAddress(expected.initialOwner) ||
    fields.codeHash !== expected.codeHash.toLowerCase() ||
    fields.platform !== expected.platform.toLowerCase()
  ) throw new Error("FCC_MACHINE_INFO_BINDING_MISMATCH");
  return {
    ...fields,
    teeId: publicKeyToAddress(publicKey),
    publicKeyX: `0x${x}`,
    publicKeyY: `0x${y}`,
    publicKeyFingerprintSha256: createHash("sha256").update(publicKey).digest("hex"),
  };
}

function sameMachine(left, right) {
  return [
    "extensionId", "initialOwner", "codeHash", "platform", "governanceHash",
    "teeId", "publicKeyX", "publicKeyY",
  ].every((field) => String(left[field]).toLowerCase() === String(right[field]).toLowerCase());
}

async function jsonInfo(origin, fetchImplementation) {
  const response = await fetchImplementation(new URL("info", origin), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("FCC_MACHINE_INFO_UNREACHABLE");
  return response.json();
}

export async function inspectMachineRegistrationEndpoints({
  publicUrls,
  localUrls,
  controlUrls,
  normalProxyUrl,
  expected,
  forbiddenHostnameSuffix = "trycloudflare.com",
  fetchImplementation = fetch,
}) {
  const effectiveControlUrls = controlUrls ?? localUrls ?? [];
  const blockers = [];
  if (
    publicUrls.length !== 3 ||
    !publicUrls.every((url) => isStableProxyUrl(url, forbiddenHostnameSuffix)) ||
    new Set(publicUrls).size !== 3
  ) blockers.push("THREE_STABLE_PROXY_URLS_NOT_CONFIGURED");
  if (
    effectiveControlUrls.length !== 3 ||
    !effectiveControlUrls.every((url) =>
      localOrigin(url) || isStableProxyUrl(url, forbiddenHostnameSuffix)
    )
  ) {
    blockers.push("THREE_CONTROL_PROXY_URLS_INVALID");
  }
  if (!securePublicUrl(normalProxyUrl)) blockers.push("NORMAL_PROXY_URL_INVALID");
  if (blockers.length > 0) return { status: "BLOCKED", blockers, machines: [] };

  try {
    await jsonInfo(normalProxyUrl, fetchImplementation);
  } catch {
    blockers.push("NORMAL_PROXY_UNREACHABLE");
  }

  const machines = [];
  for (let index = 0; index < 3; index += 1) {
    try {
      const [local, remote] = await Promise.all([
        jsonInfo(effectiveControlUrls[index], fetchImplementation),
        jsonInfo(publicUrls[index], fetchImplementation),
      ]);
      const localMachine = parseMachineInfo(local, expected);
      const publicMachine = parseMachineInfo(remote, expected);
      if (!sameMachine(localMachine, publicMachine)) {
        blockers.push(`MACHINE_${index + 1}_PUBLIC_IDENTITY_MISMATCH`);
        continue;
      }
      machines.push({
        machine: index + 1,
        controlUrl: effectiveControlUrls[index],
        publicUrl: publicUrls[index],
        ...localMachine,
      });
    } catch {
      blockers.push(`MACHINE_${index + 1}_ENDPOINT_NOT_READY`);
    }
  }
  if (machines.length === 3 && new Set(machines.map(({ teeId }) => teeId)).size !== 3) {
    blockers.push("THREE_DISTINCT_TEE_IDENTITIES_REQUIRED");
  }
  return {
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers,
    machines,
  };
}

export function machineRegistrationEnvironment(environment = process.env) {
  const configuredControlUrls = list(environment.FCC_PROXY_CONTROL_URLS);
  return {
    publicUrls: list(environment.FLARE_FCC_PROXY_URLS),
    controlUrls: configuredControlUrls.length > 0
      ? configuredControlUrls
      : list(environment.FCC_PROXY_LOCAL_URLS).length > 0
        ? list(environment.FCC_PROXY_LOCAL_URLS)
        : ["http://127.0.0.1:6674/", "http://127.0.0.1:6675/", "http://127.0.0.1:6676/"],
    normalProxyUrl:
      environment.NORMAL_PROXY_URL?.trim() || "https://tee-proxy-coston2-1.flare.rocks/",
  };
}

export function registrationAddresses(manifest) {
  return {
    FlareSystemsManager: manifest.contracts.flareSystemsManager,
    Fdc2Hub: manifest.contracts.fccFdc2Hub,
    FlareTeeManager: manifest.contracts.flareTeeManager,
  };
}

export function evaluateRegisteredMachine({
  machine,
  status,
  registeredExtensionId,
  record,
  publicKey,
  expectedExtensionId,
}) {
  const assertions = {
    productionStatus: status === 2,
    extensionMatches: registeredExtensionId === expectedExtensionId,
    teeIdMatches: getAddress(record.teeId) === getAddress(machine.teeId),
    urlMatches: record.url === machine.publicUrl,
    codeHashMatches: String(record.codeHash).toLowerCase() === machine.codeHash,
    platformMatches: String(record.platform).toLowerCase() === machine.platform,
    publicKeyMatches:
      String(publicKey.x).toLowerCase() === machine.publicKeyX &&
      String(publicKey.y).toLowerCase() === machine.publicKeyY,
  };
  return {
    machine: machine.machine,
    teeId: machine.teeId,
    url: machine.publicUrl,
    status: Number(status),
    publicKeyFingerprintSha256: machine.publicKeyFingerprintSha256,
    assertions,
  };
}
