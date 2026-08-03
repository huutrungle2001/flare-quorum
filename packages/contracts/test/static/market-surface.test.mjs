import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../../contracts/market/VeilBidMarket.sol", import.meta.url),
  "utf8",
);
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const functions = artifact.abi.filter(({ type }) => type === "function");

function abiFunction(name) {
  return functions.find((entry) => entry.name === name);
}

describe("VeilBidMarket production surface", () => {
  it("accepts no plaintext winner or winner address during finalization", () => {
    const finalize = abiFunction("finalizeTender");
    assert.ok(finalize);
    assert.deepEqual(
      finalize.inputs.map(({ type }) => type),
      ["uint256", "bytes"],
    );
    assert.match(
      source,
      /Nox\.publicDecrypt\(\s*tender\.encryptedWinnerBidId,/,
    );
    assert.match(source, /winningBid\.vendor/);
  });

  it("keeps bid prices encrypted and never publishes best price", () => {
    assert.match(source, /euint256 encryptedPrice;/);
    assert.match(source, /euint256 encryptedBestPrice;/);
    assert.doesNotMatch(source, /mapping\([^;]*plaintext/i);
    assert.doesNotMatch(
      source,
      /allowPublicDecryption\(tender\.encryptedBestPrice\)/,
    );
    assert.equal(
      [...source.matchAll(/Nox\.allowPublicDecryption\(/g)].length,
      2,
      "only the funding equality and winner ID may be public",
    );
  });

  it("matches the reviewed encrypted argmin operation order", () => {
    const submitStart = source.indexOf("function submitBid");
    const closeStart = source.indexOf("function closeTender");
    const submit = source.slice(submitStart, closeStart);
    const operations = [
      "Nox.gt(",
      "Nox.select(isPositive",
      "Nox.le(",
      "Nox.select(isWithinCeiling",
      "Nox.lt(candidate, tender.encryptedBestPrice)",
      "tender.encryptedBestPrice = Nox.select(",
      "tender.encryptedWinnerBidId = Nox.select(",
    ];
    let previous = -1;
    for (const operation of operations) {
      const current = submit.indexOf(operation);
      assert.ok(current > previous, operation);
      previous = current;
    }
    assert.equal(
      submit.includes("Nox.le(candidate, tender.encryptedBestPrice)"),
      false,
      "strict less-than is required to preserve the earliest tie",
    );
  });

  it("bounds admission to eight unique one-shot vendor slots", () => {
    assert.match(source, /uint256 public constant MAX_BIDS = 8;/);
    assert.match(source, /approvedVendors\.length > MAX_BIDS/);
    assert.match(source, /isApprovedVendor\[tenderId\]\[vendor\]/);
    assert.match(source, /hasSubmittedBid\[tenderId\]\[msg\.sender\]/);
  });

  it("closes when the deadline passes or every approved vendor has bid", () => {
    assert.match(
      source,
      /tender\.approvedVendorCount = uint8\(approvedVendors\.length\)/,
    );
    assert.match(
      source,
      /block\.timestamp < tender\.bidDeadline &&\s*tender\.bidCount < tender\.approvedVendorCount/,
    );
    assert.match(
      source,
      /block\.timestamp >= tender\.bidDeadline \|\|\s*tender\.bidCount == tender\.approvedVendorCount/,
    );
    const getTender = abiFunction("getTender");
    const components = getTender.outputs[0].components.map(({ name }) => name);
    assert.ok(components.includes("approvedVendorCount"));
  });

  it("binds one review wallet at creation and grants it only after finalization", () => {
    const authorized = abiFunction("createTenderAuthorized");
    assert.ok(authorized);
    assert.deepEqual(
      authorized.inputs.map(({ type }) => type),
      ["bytes32", "uint256", "uint64", "address[]", "address", "address", "uint256"],
    );
    const getTender = abiFunction("getTender");
    assert.ok(
      getTender.outputs[0].components.some(
        ({ name, type }) => name === "reviewViewer" && type === "address",
      ),
    );
    const submit = source.slice(
      source.indexOf("function submitBid"),
      source.indexOf("function closeTender"),
    );
    assert.doesNotMatch(submit, /reviewViewer/);
    const finalize = source.slice(
      source.indexOf("function finalizeTender"),
      source.indexOf("function cancelTender"),
    );
    assert.match(finalize, /TenderStatus\.Refunded;\s*_grantAutomaticReviewAccess/);
    assert.match(finalize, /TenderStatus\.Awarded;[\s\S]*?_grantAutomaticReviewAccess/);
    assert.match(
      source,
      /Nox\.addViewer\([\s\S]*?tender\.reviewViewer[\s\S]*?ViewerGranted/,
    );
  });

  it("exposes no administrator, arbitrary withdrawal, or Safe execution path", () => {
    const forbidden = new Set([
      "admin",
      "execute",
      "executeTransaction",
      "execTransactionFromModule",
      "owner",
      "setWinner",
      "withdraw",
    ]);
    assert.deepEqual(
      functions.filter(({ name }) => forbidden.has(name)).map(({ name }) => name),
      [],
    );
  });

  it("fits the EIP-170 runtime bytecode limit", () => {
    const deployedBytes = (artifact.deployedBytecode.length - 2) / 2;
    assert.ok(
      deployedBytes <= 24_576,
      `runtime bytecode is ${deployedBytes} bytes`,
    );
  });

  it("guards every lifecycle write against reentrancy", () => {
    for (const name of [
      "createTender",
      "createTenderAuthorized",
      "confirmTenderFunding",
      "submitBid",
      "closeTender",
      "finalizeTender",
      "cancelTender",
      "grantBidViewer",
    ]) {
      assert.match(
        source,
        new RegExp(
          `function\\s+${name}\\s*\\([\\s\\S]*?\\)\\s+external[\\s\\S]*?nonReentrant`,
        ),
        name,
      );
    }
  });

  it("commits terminal state before confidential token interactions", () => {
    const finalizeStart = source.indexOf("function finalizeTender");
    const cancelStart = source.indexOf("function cancelTender");
    const viewerStart = source.indexOf("function grantBidViewer");
    const finalize = source.slice(finalizeStart, cancelStart);
    const cancel = source.slice(cancelStart, viewerStart);

    assert.ok(
      finalize.indexOf("TenderStatus.Refunded") <
        finalize.indexOf("paymentToken.confidentialTransfer"),
    );
    assert.ok(
      finalize.indexOf("TenderStatus.Awarded") <
        finalize.lastIndexOf("paymentToken.confidentialTransfer"),
    );
    assert.ok(
      cancel.indexOf("TenderStatus.Cancelled") <
        cancel.indexOf("paymentToken.confidentialTransfer"),
    );
  });

  it("contains no timeout, winner override, or emergency withdrawal escape", () => {
    for (const fragment of [
      "emergencyWithdraw",
      "forceWinner",
      "overrideWinner",
      "timeoutRefund",
    ]) {
      assert.equal(source.includes(fragment), false, fragment);
    }
  });
});
