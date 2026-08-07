import { resolve } from "node:path";

import { ensureLocalFccSecrets } from "../flare/local-fcc-secrets.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const variables = ensureLocalFccSecrets(resolve(repositoryRoot, ".env.local"));
  console.log(JSON.stringify({ status: "ready", variables }));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    code: error instanceof Error ? error.message : "FCC_LOCAL_SECRET_SETUP_FAILED",
  }));
  process.exitCode = 1;
}
