// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {
    INoxCompute
} from "@iexec-nox/nox-protocol-contracts/contracts/interfaces/INoxCompute.sol";
import {
    TEEType
} from "@iexec-nox/nox-protocol-contracts/contracts/utils/TypeUtils.sol";

interface IVeilBidSafeOwnerRegistry {
    function isOwner(address owner) external view returns (bool);
}

interface IVeilBidConfidentialBalance {
    function confidentialBalanceOf(
        address account
    ) external view returns (bytes32);
}

/// @notice Atomically prepares one owner-encrypted amount for a Safe partial
/// unwrap through the canonical confidential wrapper.
/// @dev The Safe must call this contract and the wrapper in one normal
/// threshold-authorized batch. Access is transient, so no prepared amount can
/// be consumed by a later transaction. This contract has no Safe execution,
/// token operator, custody, or arbitrary-call surface.
contract VeilBidSafeUnwrapPreparation {
    error BalanceHandleChanged();
    error HandleAlreadyUsed();
    error InvalidBalanceHandle();
    error InvalidEncryptedAmount();
    error InvalidSafe();
    error InvalidWrapper();
    error NonceAlreadyUsed();
    error NotSafeOwner();

    address public immutable wrapper;

    mapping(address safe => mapping(uint256 nonce => bool used))
        public usedNonces;
    mapping(address safe => mapping(bytes32 handle => bool used))
        public usedHandles;

    event PartialUnwrapPrepared(
        address indexed safe,
        address indexed owner,
        uint256 indexed nonce
    );

    constructor(address wrapper_) {
        if (wrapper_ == address(0) || wrapper_.code.length == 0) {
            revert InvalidWrapper();
        }
        wrapper = wrapper_;
    }

    function preparePartialUnwrap(
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        address inputOwner,
        bytes32 expectedBalanceHandle,
        uint256 nonce
    ) external {
        if (msg.sender.code.length == 0) revert InvalidSafe();
        if (
            inputOwner == address(0) ||
            !IVeilBidSafeOwnerRegistry(msg.sender).isOwner(inputOwner)
        ) {
            revert NotSafeOwner();
        }
        if (expectedBalanceHandle == bytes32(0)) {
            revert InvalidBalanceHandle();
        }
        if (
            IVeilBidConfidentialBalance(wrapper).confidentialBalanceOf(
                msg.sender
            ) != expectedBalanceHandle
        ) {
            revert BalanceHandleChanged();
        }
        if (usedNonces[msg.sender][nonce]) revert NonceAlreadyUsed();

        bytes32 amountHandle = externalEuint256.unwrap(encryptedAmount);
        if (amountHandle == bytes32(0)) revert InvalidEncryptedAmount();
        if (usedHandles[msg.sender][amountHandle]) {
            revert HandleAlreadyUsed();
        }

        INoxCompute(Nox.noxComputeContract()).validateInputProof(
            amountHandle,
            inputOwner,
            inputProof,
            TEEType.Uint256
        );

        usedNonces[msg.sender][nonce] = true;
        usedHandles[msg.sender][amountHandle] = true;

        euint256 amount = euint256.wrap(amountHandle);
        Nox.allowTransient(amount, msg.sender);
        Nox.allowTransient(amount, wrapper);

        emit PartialUnwrapPrepared(msg.sender, inputOwner, nonce);
    }
}
