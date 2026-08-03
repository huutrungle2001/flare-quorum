import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  constructorArgumentsMatch,
  runtimeLogicMatches,
  stripSolidityMetadata,
} from "../../verify/bytecode.mjs";

describe("release verifier bytecode comparison", () => {
  it("ignores only a valid Solidity CBOR metadata trailer", () => {
    const logic = "0x6001600055";
    const first = `${logic}a1646970667341010008`;
    const second = `${logic}a1646970667341020008`;

    assert.equal(stripSolidityMetadata(first), logic);
    assert.equal(stripSolidityMetadata(second), logic);
    assert.equal(runtimeLogicMatches(first, second, {}), true);
    assert.equal(
      runtimeLogicMatches("0x6002600055", second, {}),
      false,
    );
  });

  it("checks current ABI constructor arguments independently of metadata", () => {
    const abi = [
      {
        type: "constructor",
        inputs: [{ name: "owner", type: "address" }],
      },
    ];
    const owner = "0x1111111111111111111111111111111111111111";
    const input = `0x6000${"0".repeat(24)}${owner.slice(2)}`;

    assert.equal(constructorArgumentsMatch(input, abi, [owner]), true);
    assert.equal(
      constructorArgumentsMatch(input, abi, [
        "0x2222222222222222222222222222222222222222",
      ]),
      false,
    );
  });
});
