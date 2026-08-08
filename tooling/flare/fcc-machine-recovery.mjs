import { getAddress } from "viem";

function sameAddress(left, right) {
  return getAddress(left) === getAddress(right);
}

export function planStaleMachineRetirement({
  activeMachines,
  currentMachines,
  expectedOwner,
  openTenders,
}) {
  const blockers = [];
  const currentIds = new Set(currentMachines.map(({ teeId }) => getAddress(teeId)));
  const currentUrls = new Set(currentMachines.map(({ publicUrl }) => publicUrl));
  if (currentMachines.length !== 3 || currentIds.size !== 3 || currentUrls.size !== 3) {
    blockers.push("THREE_CURRENT_MACHINES_REQUIRED");
  }

  const activeById = new Map(activeMachines.map((machine) => [getAddress(machine.teeId), machine]));
  for (const machine of currentMachines) {
    const active = activeById.get(getAddress(machine.teeId));
    if (!active || Number(active.status) !== 2 || active.url !== machine.publicUrl) {
      blockers.push(`CURRENT_MACHINE_${machine.machine}_NOT_PRODUCTION`);
    }
  }

  const candidates = activeMachines.filter((machine) =>
    Number(machine.status) === 2 &&
    sameAddress(machine.owner, expectedOwner) &&
    currentUrls.has(machine.url) &&
    !currentIds.has(getAddress(machine.teeId))
  );
  const candidateIds = new Set(candidates.map(({ teeId }) => getAddress(teeId)));
  const blockingTenders = openTenders.filter((tender) =>
    tender.teeIds.some((teeId) => candidateIds.has(getAddress(teeId)))
  );
  if (blockingTenders.length > 0) blockers.push("STALE_MACHINE_FROZEN_BY_OPEN_TENDER");

  return {
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers,
    candidates,
    blockingTenderIds: blockingTenders.map(({ tenderId }) => tenderId),
  };
}
