import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL(
    "../../contracts/safe/VeilBidSafeModuleFactory.sol",
    import.meta.url,
  ),
  "utf8",
);
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const functions = artifact.abi.filter(({ type }) => type === "function");

describe("VeilBidSafeModuleFactory production surface", () => {
  it("deploys only the reviewed preparation module with deterministic binding", () => {
    assert.match(
      source,
      /new VeilBidSafePreparationModule\{salt: saltFor\(safe\)\}/,
    );
    assert.match(
      source,
      /keccak256\(abi\.encode\(block\.chainid, safe, market\)\)/,
    );
    assert.match(source, /safe\.code\.length == 0/);
  });

  it("contains no Safe execution, configuration, or arbitrary-call surface", () => {
    const names = new Set(functions.map(({ name }) => name));
    for (const name of [
      "enableModule",
      "execTransactionFromModule",
      "execute",
      "configureMarket",
      "setOperator",
    ]) {
      assert.equal(names.has(name), false, name);
    }
  });

  it("exposes one idempotent deployment write and read-only discovery", () => {
    const writes = functions
      .filter(
        ({ stateMutability }) =>
          stateMutability !== "view" && stateMutability !== "pure",
      )
      .map(({ name }) => name);
    assert.deepEqual(writes, ["deployModule"]);
    for (const name of [
      "creationCodeHash",
      "isCanonicalModule",
      "market",
      "moduleOf",
      "predictModule",
      "saltFor",
    ]) {
      assert.equal(
        functions.some((entry) => entry.name === name),
        true,
        name,
      );
    }
  });
});
