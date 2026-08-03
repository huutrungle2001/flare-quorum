import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const functions = artifact.abi.filter(({ type }) => type === "function");
const functionNames = new Set(functions.map(({ name }) => name));

describe("VeilBidSafePreparationModule production surface", () => {
  it("contains no Safe execution or arbitrary call function", () => {
    for (const name of [
      "execTransactionFromModule",
      "execTransactionFromModuleReturnData",
      "execute",
      "executeTransaction",
    ]) {
      assert.equal(functionNames.has(name), false, name);
    }
  });

  it("exposes only preparation, one-time consumption, and inspection writes", () => {
    const writes = functions
      .filter(
        ({ stateMutability }) =>
          stateMutability !== "view" && stateMutability !== "pure",
      )
      .map(({ name }) => name)
      .sort();
    assert.deepEqual(writes, [
      "configureMarket",
      "consumePreparedInput",
      "prepareInput",
      "prepareInputForSafe",
    ]);
  });

  it("binds preparation to full action data and a nonce", () => {
    const compute = functions.find(({ name }) => name === "computeActionHash");
    const prepare = functions.find(({ name }) => name === "prepareInput");
    assert.deepEqual(
      compute.inputs.map(({ type }) => type),
      ["bytes32", "uint256"],
    );
    assert.deepEqual(
      prepare.inputs.map(({ type }) => type),
      ["bytes32", "bytes", "address", "bytes32", "bytes32", "uint256"],
    );
  });

  it("supports atomic Safe preparation without granting execution authority", () => {
    const prepareForSafe = functions.find(
      ({ name }) => name === "prepareInputForSafe",
    );
    assert.deepEqual(
      prepareForSafe.inputs.map(({ type }) => type),
      [
        "bytes32",
        "bytes",
        "address",
        "address",
        "bytes32",
        "bytes32",
        "uint256",
      ],
    );
  });
});
