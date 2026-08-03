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

interface IVeilBidSafeRegistry {
    function isModuleEnabled(address module) external view returns (bool);

    function isOwner(address owner) external view returns (bool);
}

/// @notice Imports Safe-owner inputs for one configured VeilBid market.
/// @dev This contract deliberately has no Safe execution or arbitrary-call
/// function. Registration is used only as a revocable preparation signal.
contract VeilBidSafePreparationModule {
    bytes32 public constant ACTION_CREATE_TENDER =
        keccak256("VEILBID_ACTION_CREATE_TENDER_V1");

    struct PreparedInput {
        euint256 amount;
        uint256 nonce;
        bool consumed;
    }

    error ActionAlreadyPrepared();
    error InputAlreadyConsumed();
    error InvalidActionData();
    error InvalidActionHash();
    error InvalidConsumer();
    error InvalidMarket();
    error InvalidSafe();
    error ModuleDisabled();
    error NonceAlreadyUsed();
    error NotMarket();
    error NotSafe();
    error NotSafeOwner();

    IVeilBidSafeRegistry public immutable safe;
    address public market;

    mapping(uint256 nonce => bool used) public usedNonces;
    mapping(bytes32 actionHash => PreparedInput input) private _preparedInputs;

    event MarketConfigured(address indexed market);
    event InputPrepared(
        bytes32 indexed actionHash,
        uint256 indexed nonce,
        address indexed owner
    );
    event InputConsumed(bytes32 indexed actionHash, uint256 indexed nonce);

    constructor(IVeilBidSafeRegistry safe_) {
        if (address(safe_) == address(0)) revert InvalidSafe();
        safe = safe_;
    }

    function configureMarket(address market_) external {
        if (msg.sender != address(safe)) revert NotSafe();
        if (market != address(0) || market_ == address(0)) {
            revert InvalidMarket();
        }
        market = market_;
        emit MarketConfigured(market_);
    }

    function computeActionHash(
        bytes32 actionDataHash,
        uint256 nonce
    ) public view returns (bytes32) {
        if (actionDataHash == bytes32(0)) revert InvalidActionData();
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(safe),
                    address(this),
                    market,
                    ACTION_CREATE_TENDER,
                    actionDataHash,
                    nonce
                )
            );
    }

    function prepareInput(
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        address consumer,
        bytes32 actionDataHash,
        bytes32 actionHash,
        uint256 nonce
    ) external {
        if (!safe.isOwner(msg.sender)) revert NotSafeOwner();
        _validatePreparation(
            consumer,
            actionDataHash,
            actionHash,
            nonce
        );

        _storePreparedInput(
            Nox.fromExternal(encryptedAmount, inputProof),
            actionHash,
            nonce,
            msg.sender
        );
    }

    /// @notice Imports an owner's encrypted input inside a threshold-authorized
    /// Safe batch so preparation and tender creation can execute atomically.
    function prepareInputForSafe(
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        address inputOwner,
        address consumer,
        bytes32 actionDataHash,
        bytes32 actionHash,
        uint256 nonce
    ) external {
        if (msg.sender != address(safe)) revert NotSafe();
        if (!safe.isOwner(inputOwner)) revert NotSafeOwner();
        _validatePreparation(
            consumer,
            actionDataHash,
            actionHash,
            nonce
        );

        bytes32 handle = externalEuint256.unwrap(encryptedAmount);
        INoxCompute(Nox.noxComputeContract()).validateInputProof(
            handle,
            inputOwner,
            inputProof,
            TEEType.Uint256
        );
        _storePreparedInput(
            euint256.wrap(handle),
            actionHash,
            nonce,
            inputOwner
        );
    }

    function _validatePreparation(
        address consumer,
        bytes32 actionDataHash,
        bytes32 actionHash,
        uint256 nonce
    ) internal view {
        if (!safe.isModuleEnabled(address(this))) {
            revert ModuleDisabled();
        }
        if (consumer != market || market == address(0)) {
            revert InvalidConsumer();
        }
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (actionHash != computeActionHash(actionDataHash, nonce)) {
            revert InvalidActionHash();
        }
        if (
            Nox.isInitialized(_preparedInputs[actionHash].amount) ||
            _preparedInputs[actionHash].consumed
        ) {
            revert ActionAlreadyPrepared();
        }
    }

    function _storePreparedInput(
        euint256 amount,
        bytes32 actionHash,
        uint256 nonce,
        address inputOwner
    ) internal {
        Nox.allowThis(amount);
        Nox.allow(amount, address(safe));
        Nox.allow(amount, market);

        usedNonces[nonce] = true;
        _preparedInputs[actionHash] = PreparedInput({
            amount: amount,
            nonce: nonce,
            consumed: false
        });
        emit InputPrepared(actionHash, nonce, inputOwner);
    }

    function consumePreparedInput(
        bytes32 actionHash
    ) external returns (euint256 amount) {
        if (msg.sender != market) revert NotMarket();
        PreparedInput storage prepared = _preparedInputs[actionHash];
        if (
            !Nox.isInitialized(prepared.amount) ||
            prepared.consumed
        ) {
            revert InputAlreadyConsumed();
        }

        prepared.consumed = true;
        amount = prepared.amount;
        Nox.allowTransient(amount, market);
        emit InputConsumed(actionHash, prepared.nonce);
    }

    function preparedHandle(
        bytes32 actionHash
    ) external view returns (bytes32) {
        return euint256.unwrap(_preparedInputs[actionHash].amount);
    }

    function preparedConsumed(
        bytes32 actionHash
    ) external view returns (bool) {
        return _preparedInputs[actionHash].consumed;
    }

    function preparedAllowedFor(
        bytes32 actionHash,
        address account
    ) external view returns (bool) {
        return
            Nox.isAllowed(
                _preparedInputs[actionHash].amount,
                account
            );
    }
}
