import type { HandleClient } from "@iexec-nox/handle";
import type { Hex } from "viem";

export interface PublicDecryptionResult {
  value: unknown;
  decryptionProof: Hex;
}

export async function waitForPublicDecryption(
  handleClient: Pick<HandleClient, "publicDecrypt">,
  handle: Hex,
  {
    attempts = 12,
    delayMs = 5_000,
  }: {
    attempts?: number;
    delayMs?: number;
  } = {},
): Promise<PublicDecryptionResult> {
  if (attempts < 1) throw new Error("Public decryption attempts must be positive.");
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await handleClient.publicDecrypt(handle as never);
      return {
        value: result.value,
        decryptionProof: result.decryptionProof as Hex,
      };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Public decryption is not available yet.");
}
