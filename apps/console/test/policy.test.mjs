import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sources(path)
        : entry.name.endsWith(".ts")
          ? readFile(path, "utf8")
          : [];
    }),
  );
  return files.flat(Infinity).join("\n");
}

test("operator source has no signer, write, or decryption implementation", async () => {
  const source = await sources(
    fileURLToPath(new URL("../src", import.meta.url)),
  );
  for (const forbidden of [
    "createWalletClient",
    "privateKeyToAccount",
    "writeContract",
    ".decrypt(",
    ".publicDecrypt(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
