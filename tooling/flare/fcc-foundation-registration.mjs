import { getAddress, parseAbi, stringToHex, zeroAddress } from "viem";

export const evmKeyType = stringToHex("EVM", { size: 32 });

export const teeManagerRegistrationAbi = parseAbi([
  "event TeeExtensionRegistered(uint256 indexed extensionId, address indexed owner)",
  "event TeeExtensionContractsSet(uint256 indexed extensionId, address indexed teeExtensionStateVerifier, address indexed teeExtensionInstructionsSender)",
  "function nextPublicExtensionId() view returns (uint256)",
  "function allExtensionOwnersAllowed() view returns (bool)",
  "function isAllowedExtensionOwner(address owner) view returns (bool)",
  "function register(address teeExtensionStateVerifier, address teeExtensionInstructionsSender) returns (uint256)",
  "function getTeeExtensionInstructionsSender(uint256 extensionId) view returns (address)",
  "function getTeeExtensionStateVerifier(uint256 extensionId) view returns (address)",
  "function isAllowedTeeMachineOwner(uint256 extensionId, address owner) view returns (bool)",
  "function addAllowedTeeMachineOwners(uint256 extensionId, address[] owners)",
  "function isAllowedTeeWalletProjectOwner(uint256 extensionId, address owner) view returns (bool)",
  "function addAllowedTeeWalletProjectOwners(uint256 extensionId, address[] owners)",
  "function isKeyTypeSupported(uint256 extensionId, bytes32 keyType) view returns (bool)",
  "function addSupportedKeyTypes(uint256 extensionId, bytes32[] keyTypes)",
  "event TeeVersionAdded(uint256 indexed extensionId, bytes32 version, bytes32 indexed codeHash, bytes32[] platforms)",
  "function addTeeVersion(uint256 extensionId, bytes32 version, bytes32 codeHash, bytes32[] platforms)",
  "function isCodeHashPlatformSupported(uint256 extensionId, bytes32 codeHash, bytes32 platform) view returns (bool)",
  "function getCodeHashInfo(uint256 extensionId, bytes32 codeHash) view returns (bytes32 version, bytes32[] platforms)",
]);

export const foundationSenderReadAbi = parseAbi([
  "function COSTON2_CHAIN_ID() view returns (uint256)",
  "function FOUNDATION_SENDER_VERSION() view returns (uint16)",
  "function teeExtensionRegistry() view returns (address)",
  "function teeMachineRegistry() view returns (address)",
  "function owner() view returns (address)",
  "function getExtensionId() view returns (uint256)",
  "function setExtensionIdExplicit(uint256 extensionId)",
]);

function sameAddress(left, right) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

export function evaluateFoundationRegistration({
  chainId,
  declaredDeployer,
  deployer,
  manager,
  sender,
  runtimeComparison,
  deploymentReceipt,
  registrationReceipt,
  extensionId,
  nextPublicExtensionId,
  registeredOwner,
  registeredSender,
  registeredStateVerifier,
  senderChainId,
  senderVersion,
  senderOwner,
  senderRegistry,
  senderMachineRegistry,
  senderExtensionId,
  machineOwnerAllowed,
  walletProjectOwnerAllowed,
  evmKeyTypeSupported,
}) {
  const assertions = {
    chainIdMatches: chainId === 114,
    deployerMatchesDeclaredWallet: sameAddress(deployer, declaredDeployer),
    deploymentSucceeded:
      deploymentReceipt?.status === "success" &&
      sameAddress(deploymentReceipt?.contractAddress, sender),
    registrationSucceeded: registrationReceipt?.status === "success",
    extensionIdIsPublic:
      typeof extensionId === "bigint" && extensionId >= 0x10000n &&
      extensionId < nextPublicExtensionId,
    registrationOwnerMatches: sameAddress(registeredOwner, deployer),
    registrationSenderMatches: sameAddress(registeredSender, sender),
    registrationStateVerifierIsZero: sameAddress(registeredStateVerifier, zeroAddress),
    runtimeSizeMatches: runtimeComparison?.sizeMatches === true,
    runtimeLogicMatchesArtifact: runtimeComparison?.logicMatches === true,
    senderChainMatches: senderChainId === 114n,
    senderVersionMatches: senderVersion === 2,
    senderOwnerMatches: sameAddress(senderOwner, deployer),
    senderRegistryMatches: sameAddress(senderRegistry, manager),
    senderMachineRegistryMatches: sameAddress(senderMachineRegistry, manager),
    senderExtensionBindingMatches: senderExtensionId === extensionId,
    machineOwnerAllowed: machineOwnerAllowed === true,
    walletProjectOwnerAllowed: walletProjectOwnerAllowed === true,
    evmKeyTypeSupported: evmKeyTypeSupported === true,
  };
  return {
    status: Object.values(assertions).every(Boolean) ? "PASSED" : "FAILED",
    assertions,
  };
}
