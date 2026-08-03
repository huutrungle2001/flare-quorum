import assert from "node:assert/strict";
import test from "node:test";

import {
  gateStatus,
  isStableProxyUrl,
  normalizePrivateKey,
  parseVersion,
  verifyTeeProxyReleaseRecipe,
  verifyPinnedSources,
  versionAtLeast,
} from "../flare/foundations.mjs";

test("parses and compares strict semantic versions", () => {
  assert.deepEqual(parseVersion("v0.0.24"), [0, 0, 24]);
  assert.deepEqual(parseVersion("forge Version: 1.7.1"), [1, 7, 1]);
  assert.equal(parseVersion("develop"), null);
  assert.equal(versionAtLeast("v0.0.24", "0.0.22"), true);
  assert.equal(versionAtLeast("v0.0.21", "0.0.22"), false);
});

test("accepts only stable HTTPS proxy origins", () => {
  assert.equal(
    isStableProxyUrl("https://fcc.veilbid.example", "trycloudflare.com"),
    true,
  );
  assert.equal(
    isStableProxyUrl("https://random.trycloudflare.com", "trycloudflare.com"),
    false,
  );
  assert.equal(isStableProxyUrl("http://localhost:6674", "trycloudflare.com"), false);
  assert.equal(isStableProxyUrl("not-a-url", "trycloudflare.com"), false);
});

test("normalizes a key without disclosing or mutating its bytes", () => {
  const raw = "11".repeat(32);
  assert.equal(normalizePrivateKey(raw), `0x${raw}`);
  assert.equal(normalizePrivateKey(`0x${raw}`), `0x${raw}`);
  assert.equal(normalizePrivateKey(""), null);
});

test("requires every assertion before reporting a passed gate", () => {
  assert.equal(gateStatus({ chain: true, manager: true }), "PASSED");
  assert.equal(gateStatus({ chain: true, manager: false }), "IN_PROGRESS");
});

test("checks pinned source bytes against their SHA-256 digest", async () => {
  const body = Buffer.from("official-source");
  const fetchImplementation = async () => new Response(body, { status: 200 });
  const checks = await verifyPinnedSources(
    [
      {
        id: "source",
        url: "https://example.invalid/source",
        sha256: "c13f57a826ba58f1d170a58078a2bca6a78de42adf9283a4bc301e0f6b843fcb",
      },
    ],
    fetchImplementation,
  );
  assert.deepEqual(checks, [{ id: "source", matches: true }]);
});

test("requires an exact checksum-pinned tee-proxy release recipe", () => {
  const recipe = {
    platform: "linux/amd64",
    sourceCommit: "1".repeat(40),
    sourceUrl: "https://example.invalid/proxy.tar.gz",
    sourceSha256: "2".repeat(64),
    builderImage: `builder@sha256:${"3".repeat(64)}`,
    runtimeImage: `runtime@sha256:${"4".repeat(64)}`,
  };
  const source = [
    `FROM --platform=${recipe.platform} ${recipe.builderImage} AS builder`,
    `ADD --checksum=sha256:${recipe.sourceSha256} ${recipe.sourceUrl} /tmp/source.tar.gz`,
    "RUN go mod verify",
    `RUN go build -buildvcs=false -ldflags=Revision=${recipe.sourceCommit}`,
    `FROM --platform=${recipe.platform} ${recipe.runtimeImage}`,
    "USER 65532:65532",
    'ENTRYPOINT ["/app/tee-proxy"]',
  ].join("\n");
  assert.equal(verifyTeeProxyReleaseRecipe(source, recipe), true);
  assert.equal(
    verifyTeeProxyReleaseRecipe(source.replace("go mod verify", "go mod download"), recipe),
    false,
  );
});
