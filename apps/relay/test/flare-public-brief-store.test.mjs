import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalFlarePublicBuyerBrief, hashFlarePublicBuyerBrief } from "@flarequorum/flare-bindings";
import { FileFlarePublicBriefStore } from "../dist/flare-public-brief-store.js";

const brief = canonicalFlarePublicBuyerBrief({
  title: "Immutable public Buyer Brief",
  category: "operations",
  objective: "Deliver the public operational procurement outcome.",
  acceptanceCriteria: "All stated public checks must pass.",
  vendorQuestions: "",
  bidDeadline: 1_800_000_000n,
  approvedVendors: ["0x2000000000000000000000000000000000000002"],
});

test("file public brief store is content-addressed, persistent, and idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flare-public-briefs-"));
  try {
    const store = new FileFlarePublicBriefStore(directory);
    const metadataHash = hashFlarePublicBuyerBrief(brief);
    assert.equal(await store.get(metadataHash), null);
    assert.deepEqual(await store.put(metadataHash, brief), brief);
    assert.deepEqual(await store.put(metadataHash, brief), brief);
    assert.deepEqual(await store.get(metadataHash), brief);
    const raw = await readFile(join(directory, `${metadataHash.slice(2)}.json`), "utf8");
    assert.equal(raw.includes("priceMicros"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
