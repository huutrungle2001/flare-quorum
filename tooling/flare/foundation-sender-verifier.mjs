import { getAddress, keccak256, padHex } from "viem";

export function patchSingleAddressImmutables(deployedBytecode, immutableReferences, address) {
  if (typeof deployedBytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(deployedBytecode)) {
    throw new Error("INVALID_DEPLOYED_BYTECODE");
  }
  const replacement = padHex(getAddress(address), { size: 32 }).slice(2).toLowerCase();
  let bytes = deployedBytecode.slice(2).toLowerCase();
  const references = Object.values(immutableReferences ?? {}).flat();
  if (references.length === 0) throw new Error("IMMUTABLE_REFERENCES_MISSING");
  for (const reference of references) {
    if (!Number.isSafeInteger(reference.start) || reference.length !== 32) {
      throw new Error("INVALID_IMMUTABLE_REFERENCE");
    }
    const start = reference.start * 2;
    const end = (reference.start + reference.length) * 2;
    bytes = `${bytes.slice(0, start)}${replacement}${bytes.slice(end)}`;
  }
  return `0x${bytes}`;
}

export function expectedFoundationRuntime(artifact, managerAddress) {
  const patched = patchSingleAddressImmutables(
    artifact?.deployedBytecode?.object,
    artifact?.deployedBytecode?.immutableReferences,
    managerAddress,
  );
  return {
    code: patched,
    size: (patched.length - 2) / 2,
    hash: keccak256(patched),
  };
}
