import assert from "node:assert/strict";
import test from "node:test";

import {
  gateStatus,
  isStableProxyUrl,
  normalizePrivateKey,
  parseVersion,
  verifyFccExtensionReleaseRecipe,
  verifyFccRuntimeAlignment,
  verifyTeeProxyReleaseRecipe,
  verifyTeeRegistrationReleaseRecipe,
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
  assert.equal(
    isStableProxyUrl(
      ["https://user", "secret@fcc.veilbid.example"].join(":"),
      "trycloudflare.com",
    ),
    false,
  );
  assert.equal(
    isStableProxyUrl("https://fcc.veilbid.example/private", "trycloudflare.com"),
    false,
  );
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
    dockerfileFrontend: `frontend@sha256:${"5".repeat(64)}`,
    builderImage: `builder@sha256:${"3".repeat(64)}`,
    runtimeImage: `runtime@sha256:${"4".repeat(64)}`,
  };
  const source = [
    `# syntax=${recipe.dockerfileFrontend}`,
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

test("requires an aligned checksum-pinned register-tee recipe", () => {
  const recipe = {
    platform: "linux/amd64",
    sourceCommit: "1".repeat(40),
    sourceUrl: "https://example.invalid/scaffold.tar.gz",
    sourceSha256: "2".repeat(64),
    teeNodeModuleVersion: "0.0.23",
    goFlareCommonModuleVersion: "v1.2.2-test",
    dockerfileFrontend: `frontend@sha256:${"5".repeat(64)}`,
    builderImage: `builder@sha256:${"3".repeat(64)}`,
    runtimeImage: `runtime@sha256:${"4".repeat(64)}`,
  };
  const source = [
    `# syntax=${recipe.dockerfileFrontend}`,
    `FROM --platform=${recipe.platform} ${recipe.builderImage} AS builder`,
    `ADD --checksum=sha256:${recipe.sourceSha256} ${recipe.sourceUrl} /tmp/source.tar.gz`,
    `RUN go mod edit -require=github.com/flare-foundation/tee-node@v${recipe.teeNodeModuleVersion}`,
    `RUN go mod edit -require=github.com/flare-foundation/go-flare-common@${recipe.goFlareCommonModuleVersion}`,
    "RUN go get ./cmd/register-tee && go mod verify",
    "RUN go build -mod=readonly -trimpath -buildvcs=false",
    `FROM --platform=${recipe.platform} ${recipe.runtimeImage}`,
    "COPY --chmod=0555 --chown=65532:65532 --from=builder /out/register-tee /app/register-tee",
    "USER 65532:65532",
    'ENTRYPOINT ["/app/register-tee"]',
  ].join("\n");
  assert.equal(verifyTeeRegistrationReleaseRecipe(source, recipe), true);
  assert.equal(
    verifyTeeRegistrationReleaseRecipe(source.replace("v0.0.23", "v0.0.21"), recipe),
    false,
  );
});

test("requires exact pinned inputs and safe defaults for the FCC extension image", () => {
  const recipe = {
    context: "apps/fcc-extension",
    platform: "linux/amd64",
    version: "0.2.0",
    dockerfileFrontend: `frontend@sha256:${"5".repeat(64)}`,
    builderImage: `builder@sha256:${"3".repeat(64)}`,
    runtimeImage: `runtime@sha256:${"4".repeat(64)}`,
  };
  const source = [
    `# syntax=${recipe.dockerfileFrontend}`,
    `FROM ${recipe.builderImage} AS builder`,
    "RUN go mod download && go mod verify",
    'RUN GOFLAGS="-buildvcs=false" go build -trimpath',
    `FROM ${recipe.runtimeImage}`,
    "COPY --chmod=555 --chown=0:0 --from=builder /app/extension-tee /app/extension-tee",
    "ENV MODE=0 CHAIN_ID=114 SEALED_STORE_DIR=/var/lib/veilbid/sealed",
    "USER 0:0",
    'VOLUME ["/var/lib/veilbid/sealed"]',
    'CMD ["/app/extension-tee"]',
  ].join("\n");
  assert.equal(verifyFccExtensionReleaseRecipe(source, recipe), true);
  assert.equal(
    verifyFccExtensionReleaseRecipe(source.replace("ENV MODE=0", "ENV MODE=1"), recipe),
    false,
  );
});

test("requires the extension and proxy to resolve the same tee-node wire version", () => {
  const goMod = "module example\nrequire github.com/flare-foundation/tee-node v0.0.23\n";
  const teeNode = { tag: "v0.0.23", minimumOrganizerVersion: "0.0.22" };
  const teeProxy = { teeNodeModuleVersion: "0.0.23" };
  assert.equal(verifyFccRuntimeAlignment(goMod, teeNode, teeProxy), true);
  assert.equal(
    verifyFccRuntimeAlignment(
      goMod.replace("v0.0.23", "v0.0.24"),
      teeNode,
      teeProxy,
    ),
    false,
  );
  assert.equal(
    verifyFccRuntimeAlignment(goMod, teeNode, { teeNodeModuleVersion: "0.0.24" }),
    false,
  );
});
