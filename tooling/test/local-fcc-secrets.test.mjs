import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ensureLocalFccSecrets } from "../flare/local-fcc-secrets.mjs";

test("creates missing FCC runtime secrets without replacing existing values", () => {
  const directory = mkdtempSync(join(tmpdir(), "veilbid-fcc-secrets-"));
  const path = join(directory, ".env.local");
  try {
    writeFileSync(path, "PROXY_PRIVATE_KEY=already-set\nFCC_DIRECT_API_KEY=\n", {
      mode: 0o600,
    });
    const statuses = ensureLocalFccSecrets(path, () => Buffer.alloc(32, 0x11));
    const source = readFileSync(path, "utf8");
    assert.deepEqual(statuses, {
      PROXY_PRIVATE_KEY: "existing",
      FCC_DIRECT_API_KEY: "created",
    });
    assert.match(source, /^PROXY_PRIVATE_KEY=already-set$/mu);
    assert.match(source, /^FCC_DIRECT_API_KEY=ERERERERERERERERERERERERERERERERERERERERERE$/mu);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
