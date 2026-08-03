import { keccak256 } from "viem";

function immutableRanges(immutableReferences) {
  const ranges = Object.values(immutableReferences ?? {}).flat().map((reference) => {
    if (!Number.isSafeInteger(reference?.start) || reference.start < 0 || reference?.length !== 32) {
      throw new Error("INVALID_IMMUTABLE_REFERENCE");
    }
    return { start: reference.start, length: reference.length };
  }).sort((left, right) => left.start - right.start);
  if (ranges.length === 0) throw new Error("IMMUTABLE_REFERENCES_MISSING");
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].start + ranges[index - 1].length > ranges[index].start) {
      throw new Error("OVERLAPPING_IMMUTABLE_REFERENCES");
    }
  }
  return ranges;
}

export function maskImmutableRuntime(runtime, immutableReferences) {
  if (typeof runtime !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(runtime)) {
    throw new Error("INVALID_RUNTIME_BYTECODE");
  }
  let bytes = runtime.slice(2).toLowerCase();
  for (const reference of immutableRanges(immutableReferences)) {
    if ((reference.start + reference.length) * 2 > bytes.length) {
      throw new Error("IMMUTABLE_REFERENCE_OUT_OF_RANGE");
    }
    const start = reference.start * 2;
    const end = (reference.start + reference.length) * 2;
    bytes = `${bytes.slice(0, start)}${"00".repeat(reference.length)}${bytes.slice(end)}`;
  }
  return `0x${bytes}`;
}

export function compareMarketRuntime(artifact, liveRuntime) {
  const artifactRuntime = artifact?.deployedBytecode?.object;
  const references = artifact?.deployedBytecode?.immutableReferences;
  const expectedMasked = maskImmutableRuntime(artifactRuntime, references);
  const liveMasked = maskImmutableRuntime(liveRuntime, references);
  return {
    runtimeSize: (liveRuntime.length - 2) / 2,
    artifactRuntimeSize: (artifactRuntime.length - 2) / 2,
    runtimeHash: keccak256(liveRuntime),
    maskedRuntimeHash: keccak256(liveMasked),
    artifactMaskedRuntimeHash: keccak256(expectedMasked),
    sizeMatches: liveRuntime.length === artifactRuntime.length,
    logicMatches: liveMasked === expectedMasked,
  };
}
