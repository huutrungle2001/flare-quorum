import { encodeAbiParameters } from "viem";

export function maskImmutables(bytecode, immutableReferences) {
  const bytes = bytecode.slice(2).match(/.{2}/g) ?? [];
  for (const references of Object.values(immutableReferences ?? {})) {
    for (const { length, start } of references) {
      bytes.splice(start, length, ...Array(length).fill("00"));
    }
  }
  return `0x${bytes.join("")}`;
}

/**
 * Removes the compiler-appended CBOR trailer while retaining executable code.
 * Solidity stores the CBOR byte length in the final two bytes.
 */
export function stripSolidityMetadata(bytecode) {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(bytecode)) {
    throw new Error("invalid-bytecode");
  }
  const body = bytecode.slice(2);
  if (body.length < 4) return bytecode.toLowerCase();
  const metadataBytes = Number.parseInt(body.slice(-4), 16);
  const trailerHexLength = (metadataBytes + 2) * 2;
  if (trailerHexLength > body.length) return bytecode.toLowerCase();
  const metadataStart = body.length - trailerHexLength;
  const firstMetadataByte = Number.parseInt(
    body.slice(metadataStart, metadataStart + 2),
    16,
  );
  if (firstMetadataByte < 0xa0 || firstMetadataByte > 0xbf) {
    return bytecode.toLowerCase();
  }
  return `0x${body.slice(0, metadataStart).toLowerCase()}`;
}

export function runtimeLogicMatches(
  onchainBytecode,
  artifactBytecode,
  immutableReferences,
) {
  return (
    stripSolidityMetadata(
      maskImmutables(onchainBytecode, immutableReferences),
    ) ===
    stripSolidityMetadata(
      maskImmutables(artifactBytecode, immutableReferences),
    )
  );
}

export function constructorArgumentsMatch(transactionInput, abi, args) {
  const constructor = abi.find((item) => item.type === "constructor");
  const inputs = constructor?.inputs ?? [];
  if (inputs.length !== args.length) return false;
  if (inputs.length === 0) return true;
  const encoded = encodeAbiParameters(inputs, args).slice(2).toLowerCase();
  return transactionInput.toLowerCase().endsWith(encoded);
}
