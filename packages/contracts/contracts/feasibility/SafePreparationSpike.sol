// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    IERC7984
} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface ISafeRegistry {
    function isModuleEnabled(address module) external view returns (bool);

    function isOwner(address owner) external view returns (bool);
}

/// @notice Gate E preparation-only module spike. It intentionally has no Safe
/// execution entry point and cannot call execTransactionFromModule.
contract SafePreparationModuleSpike {
    bytes32 public constant ACTION_FUND_TENDER =
        keccak256("VEILBID_ACTION_FUND_TENDER_V1");

    struct PreparedInput {
        euint256 amount;
        uint256 nonce;
        bool consumed;
    }

    error ActionAlreadyPrepared();
    error InputAlreadyConsumed();
    error InvalidActionHash();
    error InvalidConsumer();
    error InvalidMarket();
    error ModuleDisabled();
    error NonceAlreadyUsed();
    error NotMarket();
    error NotSafe();
    error NotSafeOwner();

    ISafeRegistry public immutable safe;
    address public market;
    mapping(uint256 nonce => bool used) public usedNonces;
    mapping(bytes32 actionHash => PreparedInput input) private _preparedInputs;

    constructor(ISafeRegistry safe_) {
        safe = safe_;
    }

    function configureMarket(address market_) external {
        if (msg.sender != address(safe)) revert NotSafe();
        if (market != address(0) || market_ == address(0)) {
            revert InvalidMarket();
        }
        market = market_;
    }

    function computeActionHash(uint256 nonce) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(safe),
                    address(this),
                    market,
                    ACTION_FUND_TENDER,
                    nonce
                )
            );
    }

    function prepareInput(
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        address consumer,
        bytes32 actionHash,
        uint256 nonce
    ) external {
        if (!safe.isOwner(msg.sender)) revert NotSafeOwner();
        if (!safe.isModuleEnabled(address(this))) revert ModuleDisabled();
        if (consumer != market || market == address(0)) {
            revert InvalidConsumer();
        }
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (actionHash != computeActionHash(nonce)) revert InvalidActionHash();
        if (
            Nox.isInitialized(_preparedInputs[actionHash].amount) ||
            _preparedInputs[actionHash].consumed
        ) {
            revert ActionAlreadyPrepared();
        }

        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);
        Nox.allowThis(amount);
        Nox.allow(amount, address(safe));
        Nox.allow(amount, market);

        usedNonces[nonce] = true;
        _preparedInputs[actionHash] = PreparedInput({
            amount: amount,
            nonce: nonce,
            consumed: false
        });
    }

    function consumePreparedInput(
        bytes32 actionHash
    ) external returns (euint256 amount) {
        if (msg.sender != market) revert NotMarket();
        PreparedInput storage prepared = _preparedInputs[actionHash];
        if (!Nox.isInitialized(prepared.amount) || prepared.consumed) {
            revert InputAlreadyConsumed();
        }
        prepared.consumed = true;
        amount = prepared.amount;
        Nox.allowTransient(amount, market);
    }

    function preparedHandle(bytes32 actionHash) external view returns (bytes32) {
        return euint256.unwrap(_preparedInputs[actionHash].amount);
    }

    function preparedConsumed(bytes32 actionHash) external view returns (bool) {
        return _preparedInputs[actionHash].consumed;
    }

    function preparedAllowedFor(
        bytes32 actionHash,
        address account
    ) external view returns (bool) {
        return Nox.isAllowed(_preparedInputs[actionHash].amount, account);
    }
}

interface ISafePreparationModuleSpike {
    function consumePreparedInput(
        bytes32 actionHash
    ) external returns (euint256);
}

/// @notice Gate E Safe-authorized funding consumer. Not production code.
contract SafeFundingConsumerSpike {
    error AlreadyFunded();
    error FundingAlreadyAttempted();
    error InvalidFundingProof();
    error NotSafe();

    address public immutable safe;
    ISafePreparationModuleSpike public immutable module;
    IERC7984 public immutable token;
    uint256 public immutable publicBudget;
    bool public fundingAttempted;
    bool public funded;

    euint256 private _escrowedBudget;
    ebool private _fundingMatchesBudget;

    constructor(
        address safe_,
        ISafePreparationModuleSpike module_,
        IERC7984 token_,
        uint256 publicBudget_
    ) {
        safe = safe_;
        module = module_;
        token = token_;
        publicBudget = publicBudget_;
    }

    function fundFromSafe(bytes32 actionHash) external {
        if (msg.sender != safe) revert NotSafe();
        if (fundingAttempted) revert FundingAlreadyAttempted();

        euint256 preparedAmount = module.consumePreparedInput(actionHash);
        Nox.allowTransient(preparedAmount, address(token));
        _escrowedBudget = token.confidentialTransferFrom(
            safe,
            address(this),
            preparedAmount
        );
        Nox.allowThis(_escrowedBudget);

        _fundingMatchesBudget = Nox.eq(
            _escrowedBudget,
            Nox.toEuint256(publicBudget)
        );
        Nox.allowThis(_fundingMatchesBudget);
        Nox.allowPublicDecryption(_fundingMatchesBudget);
        fundingAttempted = true;
    }

    function confirmFunding(bytes calldata fundingProof) external {
        if (funded) revert AlreadyFunded();
        if (!Nox.publicDecrypt(_fundingMatchesBudget, fundingProof)) {
            revert InvalidFundingProof();
        }
        funded = true;
    }

    function escrowedBudgetHandle() external view returns (bytes32) {
        return euint256.unwrap(_escrowedBudget);
    }

    function fundingCheckHandle() external view returns (bytes32) {
        return ebool.unwrap(_fundingMatchesBudget);
    }
}
