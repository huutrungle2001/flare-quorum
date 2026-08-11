const signaturePattern = /^0x[0-9a-fA-F]{130}$/;

/** Normalizes Ethereum message-signature recovery bytes for go-ethereum signature validation. */
export function normalizeCredentialSignature(signature) {
  if (!signaturePattern.test(signature)) throw new Error("INVALID_CREDENTIAL_SIGNATURE");
  const recovery = Number.parseInt(signature.slice(-2), 16);
  if (recovery !== 0 && recovery !== 1 && recovery !== 27 && recovery !== 28) {
    throw new Error("INVALID_CREDENTIAL_SIGNATURE_RECOVERY");
  }
  const normalized = recovery >= 27 ? recovery - 27 : recovery;
  return `${signature.slice(0, -2)}${normalized.toString(16).padStart(2, "0")}`;
}
