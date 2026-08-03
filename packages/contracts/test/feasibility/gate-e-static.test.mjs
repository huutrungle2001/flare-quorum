import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/contracts/feasibility/SafePreparationSpike.sol/SafePreparationModuleSpike.json",
      import.meta.url,
    ),
  ),
);

describe("Gate E preparation-only module surface", () => {
  it("contains no Safe execution or arbitrary execute function", () => {
    const functions = artifact.abi
      .filter(({ type }) => type === "function")
      .map(({ name }) => name);

    assert.equal(functions.includes("execTransactionFromModule"), false);
    assert.equal(functions.includes("execTransactionFromModuleReturnData"), false);
    assert.equal(functions.includes("execute"), false);
    assert.equal(functions.includes("executeTransaction"), false);
  });
});
