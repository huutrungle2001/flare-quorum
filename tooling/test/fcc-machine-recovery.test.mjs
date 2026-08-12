import assert from "node:assert/strict";
import test from "node:test";

import {
  planRollingMachineReplacement,
  planStaleMachineRetirement,
} from "../flare/fcc-machine-recovery.mjs";

const owner = "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const other = "0x0000000000000000000000000000000000000009";
const ids = [1, 2, 3, 4].map((value) => `0x${value.toString(16).padStart(40, "0")}`);
const address = (digit) => `0x${digit.repeat(40)}`;
const currentMachines = ids.slice(0, 3).map((teeId, index) => ({
  machine: index + 1,
  teeId,
  publicUrl: `https://fcc-${index + 1}.example`,
}));
const activeMachines = [
  ...currentMachines.map((machine) => ({ ...machine, url: machine.publicUrl, owner, status: 2 })),
  { teeId: ids[3], url: currentMachines[0].publicUrl, owner, status: 2 },
  { teeId: other, url: currentMachines[1].publicUrl, owner: other, status: 2 },
];

test("retires only owned production identities replaced at a current origin", () => {
  const result = planStaleMachineRetirement({
    activeMachines,
    currentMachines,
    expectedOwner: owner,
    openTenders: [],
  });
  assert.equal(result.status, "READY");
  assert.deepEqual(result.candidates.map(({ teeId }) => teeId), [ids[3]]);
});

test("plans exactly one safe rolling identity replacement", () => {
  const previousMachines = [
    { teeId: address("1"), publicUrl: "https://one.example" },
    { teeId: address("2"), publicUrl: "https://two.example" },
    { teeId: address("3"), publicUrl: "https://three.example" },
  ];
  const currentMachines = [
    { teeId: address("4"), publicUrl: "https://one.example" },
    previousMachines[1],
    previousMachines[2],
  ];
  const activeMachines = previousMachines.map(({ teeId, publicUrl }) => ({
    teeId,
    url: publicUrl,
    owner: address("a"),
    status: 2,
  }));
  const result = planRollingMachineReplacement({
    previousMachines,
    currentMachines,
    activeMachines,
    expectedOwner: address("a"),
    openTenders: [],
    machineIndex: 0,
  });
  assert.equal(result.status, "READY");
  assert.equal(result.oldMachine.teeId, address("1"));
  assert.equal(result.replacement.teeId, address("4"));
});

test("blocks rolling replacement when an unfinished tender froze the old identity", () => {
  const previousMachines = [
    { teeId: address("1"), publicUrl: "https://one.example" },
    { teeId: address("2"), publicUrl: "https://two.example" },
    { teeId: address("3"), publicUrl: "https://three.example" },
  ];
  const result = planRollingMachineReplacement({
    previousMachines,
    currentMachines: [
      { teeId: address("4"), publicUrl: "https://one.example" },
      previousMachines[1],
      previousMachines[2],
    ],
    activeMachines: previousMachines.map(({ teeId, publicUrl }) => ({
      teeId, url: publicUrl, owner: address("a"), status: 2,
    })),
    expectedOwner: address("a"),
    openTenders: [{ tenderId: "9", teeIds: [address("1")] }],
    machineIndex: 0,
  });
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.blockingTenderIds, ["9"]);
});

test("blocks retirement when an unfinished tender froze a stale identity", () => {
  const result = planStaleMachineRetirement({
    activeMachines,
    currentMachines,
    expectedOwner: owner,
    openTenders: [{ tenderId: "7", teeIds: [ids[3], ids[1], ids[2]] }],
  });
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.blockers, ["STALE_MACHINE_FROZEN_BY_OPEN_TENDER"]);
  assert.deepEqual(result.blockingTenderIds, ["7"]);
});

test("requires all three replacement identities to be live before retirement", () => {
  const result = planStaleMachineRetirement({
    activeMachines: activeMachines.filter(({ teeId }) => teeId !== ids[1]),
    currentMachines,
    expectedOwner: owner,
    openTenders: [],
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("CURRENT_MACHINE_2_NOT_PRODUCTION"));
});
