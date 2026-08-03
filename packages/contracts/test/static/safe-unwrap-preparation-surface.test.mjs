import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL(
    "../../contracts/safe/VeilBidSafeUnwrapPreparation.sol",
    import.meta.url,
  ),
  "utf8",
);
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const functions = artifact.abi.filter(({ type }) => type === "function");

describe("VeilBidSafeUnwrapPreparation production surface", () => {
  it("exposes one preparation write and no execution or operator surface", () => {
    const writes = functions
      .filter(
        ({ stateMutability }) =>
          stateMutability !== "view" && stateMutability !== "pure",
      )
      .map(({ name }) => name);
    assert.deepEqual(writes, ["preparePartialUnwrap"]);

    const names = new Set(functions.map(({ name }) => name));
    for (const name of [
      "execTransactionFromModule",
      "execute",
      "setOperator",
      "unwrap",
    ]) {
      assert.equal(names.has(name), false, name);
    }
  });

  it("binds owner proof to a fresh Safe nonce and current balance handle", () => {
    const prepare = functions.find(
      ({ name }) => name === "preparePartialUnwrap",
    );
    assert.deepEqual(
      prepare.inputs.map(({ type }) => type),
      ["bytes32", "bytes", "address", "bytes32", "uint256"],
    );
    assert.match(source, /IVeilBidSafeOwnerRegistry\(msg\.sender\)\.isOwner/);
    assert.match(source, /confidentialBalanceOf\(\s*msg\.sender\s*\)/);
    assert.match(source, /usedNonces\[msg\.sender\]\[nonce\]/);
    assert.match(source, /usedHandles\[msg\.sender\]\[amountHandle\]/);
  });

  it("grants only transaction-scoped compute access", () => {
    assert.match(source, /Nox\.allowTransient\(amount, msg\.sender\)/);
    assert.match(source, /Nox\.allowTransient\(amount, wrapper\)/);
    assert.doesNotMatch(source, /Nox\.allow\(amount,/);
  });

  it("emits no confidential handle or amount", () => {
    const event = artifact.abi.find(
      ({ type, name }) =>
        type === "event" && name === "PartialUnwrapPrepared",
    );
    assert.deepEqual(
      event.inputs.map(({ type }) => type),
      ["address", "address", "uint256"],
    );
  });
});
