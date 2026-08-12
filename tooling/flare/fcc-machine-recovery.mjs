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

export function planRollingMachineReplacement({
  previousMachines,
  currentMachines,
  activeMachines,
  expectedOwner,
  openTenders,
  machineIndex,
}) {
  const blockers = [];
  if (
    !Number.isInteger(machineIndex) || machineIndex < 0 || machineIndex > 2 ||
    previousMachines.length !== 3 || currentMachines.length !== 3
  ) {
    return { status: "BLOCKED", blockers: ["ROLLING_MACHINE_SET_INVALID"] };
  }
  const previousIds = new Set(previousMachines.map(({ teeId }) => getAddress(teeId)));
  const currentIds = new Set(currentMachines.map(({ teeId }) => getAddress(teeId)));
  if (previousIds.size !== 3 || currentIds.size !== 3) {
    blockers.push("ROLLING_MACHINE_IDENTITIES_NOT_DISTINCT");
  }
  for (let index = 0; index < 3; index += 1) {
    const previous = previousMachines[index];
    const current = currentMachines[index];
    if (previous.publicUrl !== current.publicUrl) blockers.push("ROLLING_MACHINE_ROUTE_CHANGED");
    const changed = !sameAddress(previous.teeId, current.teeId);
    if ((index === machineIndex) !== changed) blockers.push("ROLLING_ONLY_SELECTED_MACHINE_MAY_CHANGE");
  }
  const oldMachine = previousMachines[machineIndex];
  const replacement = currentMachines[machineIndex];
  const activeById = new Map(activeMachines.map((machine) => [getAddress(machine.teeId), machine]));
  if (activeMachines.length !== 3 || activeMachines.some(({ teeId }) => !previousIds.has(getAddress(teeId)))) {
    blockers.push("ROLLING_ACTIVE_SET_NOT_PREVIOUS_CHECKPOINT");
  }
  const oldActive = activeById.get(getAddress(oldMachine.teeId));
  if (
    !oldActive || Number(oldActive.status) !== 2 ||
    !sameAddress(oldActive.owner, expectedOwner) || oldActive.url !== oldMachine.publicUrl
  ) blockers.push("ROLLING_OLD_MACHINE_NOT_OWNED_PRODUCTION");
  if (activeById.has(getAddress(replacement.teeId))) {
    blockers.push("ROLLING_REPLACEMENT_ALREADY_ACTIVE");
  }
  const blockingTenderIds = openTenders
    .filter(({ teeIds }) => teeIds.some((teeId) => sameAddress(teeId, oldMachine.teeId)))
    .map(({ tenderId }) => tenderId);
  if (blockingTenderIds.length > 0) blockers.push("ROLLING_OLD_MACHINE_FROZEN_BY_OPEN_TENDER");
  return {
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers,
    oldMachine,
    replacement,
    blockingTenderIds,
  };
}
