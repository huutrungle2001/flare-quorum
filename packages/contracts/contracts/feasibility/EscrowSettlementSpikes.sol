// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {
    ERC20ToERC7984Wrapper
} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {
    IERC7984
} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

contract TestUSDC is ERC20 {
    constructor() ERC20("VeilBid Test USDC", "vUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TestConfidentialUSDC is ERC20ToERC7984Wrapper {
    constructor(
        IERC20 underlying
    )
        ERC20ToERC7984Wrapper(
            "VeilBid Confidential USDC",
            "vcUSDC",
            "https://veilbid.local/test-token",
            underlying
        )
    {}
}

abstract contract SettlementState {
    error AlreadyFunded();
    error FundingAlreadyAttempted();
    error InvalidFundingProof();
    error AlreadySettled();
    error NotBuyer();
    error NotFunded();
    error WinningPriceMissing();

    IERC7984 public immutable token;
    address public immutable buyer;
    uint256 public immutable publicBudget;
    bool public fundingAttempted;
    bool public funded;
    bool public settled;

    euint256 internal _escrowedBudget;
    ebool internal _fundingMatchesBudget;
    euint256 internal _winningPrice;

    constructor(IERC7984 token_, address buyer_, uint256 budget_) {
        token = token_;
        buyer = buyer_;
        publicBudget = budget_;
    }

    function escrowedBudgetHandle() external view returns (bytes32) {
        return euint256.unwrap(_escrowedBudget);
    }

    function winningPriceHandle() external view returns (bytes32) {
        return euint256.unwrap(_winningPrice);
    }

    function fundingCheckHandle() external view returns (bytes32) {
        return ebool.unwrap(_fundingMatchesBudget);
    }

    function confirmFunding(bytes calldata fundingProof) external {
        if (!fundingAttempted) revert NotFunded();
        if (funded) revert AlreadyFunded();
        if (!Nox.publicDecrypt(_fundingMatchesBudget, fundingProof)) {
            revert InvalidFundingProof();
        }
        funded = true;
    }

    function _recordFundingAttempt(euint256 transferred) internal {
        _escrowedBudget = transferred;
        Nox.allowThis(_escrowedBudget);

        _fundingMatchesBudget = Nox.eq(
            _escrowedBudget,
            Nox.toEuint256(publicBudget)
        );
        Nox.allowThis(_fundingMatchesBudget);
        Nox.allowPublicDecryption(_fundingMatchesBudget);
        fundingAttempted = true;
    }

    function _requireFunded() internal view {
        if (!funded) revert NotFunded();
    }
}

/// @notice Gate D single-contract custody spike. Not production code.
contract SingleEscrowSettlementSpike is SettlementState {
    constructor(
        IERC7984 token_,
        address buyer_,
        uint256 budget_
    ) SettlementState(token_, buyer_, budget_) {}

    function fund() external {
        if (msg.sender != buyer) revert NotBuyer();
        if (fundingAttempted) revert FundingAlreadyAttempted();

        euint256 transferred = token.confidentialTransferFrom(
            buyer,
            address(this),
            Nox.toEuint256(publicBudget)
        );
        _recordFundingAttempt(transferred);
    }

    function setWinningPrice(
        externalEuint256 encryptedPrice,
        bytes calldata inputProof
    ) external {
        if (msg.sender != buyer) revert NotBuyer();
        _winningPrice = Nox.fromExternal(encryptedPrice, inputProof);
        Nox.allowThis(_winningPrice);
    }

    function settleWinner(address winner) external {
        if (msg.sender != buyer) revert NotBuyer();
        _requireFunded();
        if (settled) revert AlreadySettled();
        if (!Nox.isInitialized(_winningPrice)) revert WinningPriceMissing();
        settled = true;

        Nox.allowTransient(_winningPrice, address(token));
        token.confidentialTransfer(winner, _winningPrice);

        euint256 remainder = Nox.sub(_escrowedBudget, _winningPrice);
        Nox.allowThis(remainder);
        Nox.allowTransient(remainder, address(token));
        token.confidentialTransfer(buyer, remainder);
    }

    function refundNoWinner() external {
        if (msg.sender != buyer) revert NotBuyer();
        _requireFunded();
        if (settled) revert AlreadySettled();
        settled = true;

        Nox.allowTransient(_escrowedBudget, address(token));
        token.confidentialTransfer(buyer, _escrowedBudget);
    }
}

interface ISplitEscrowSpike {
    function settleWinner(euint256 winningPrice, address winner) external;

    function refundNoWinner() external;
}

/// @notice Gate D custody-only contract for explicit cross-contract ACL testing.
contract SplitEscrowSpike is SettlementState {
    error AlreadyConfigured();
    error NotMarket();
    error NotOwner();

    address public immutable owner;
    address public market;

    constructor(
        IERC7984 token_,
        address buyer_,
        uint256 budget_
    ) SettlementState(token_, buyer_, budget_) {
        owner = msg.sender;
    }

    function configureMarket(address market_) external {
        if (msg.sender != owner) revert NotOwner();
        if (market != address(0)) revert AlreadyConfigured();
        market = market_;
    }

    function fund() external {
        if (msg.sender != buyer) revert NotBuyer();
        if (fundingAttempted) revert FundingAlreadyAttempted();

        euint256 transferred = token.confidentialTransferFrom(
            buyer,
            address(this),
            Nox.toEuint256(publicBudget)
        );
        _recordFundingAttempt(transferred);
    }

    function settleWinner(euint256 winningPrice, address winner) external {
        if (msg.sender != market) revert NotMarket();
        _requireFunded();
        if (settled) revert AlreadySettled();
        settled = true;

        Nox.allowTransient(winningPrice, address(token));
        token.confidentialTransfer(winner, winningPrice);

        euint256 remainder = Nox.sub(_escrowedBudget, winningPrice);
        Nox.allowThis(remainder);
        Nox.allowTransient(remainder, address(token));
        token.confidentialTransfer(buyer, remainder);
    }

    function refundNoWinner() external {
        if (msg.sender != market) revert NotMarket();
        _requireFunded();
        if (settled) revert AlreadySettled();
        settled = true;

        Nox.allowTransient(_escrowedBudget, address(token));
        token.confidentialTransfer(buyer, _escrowedBudget);
    }
}

/// @notice Gate D market side of the split-custody spike. Not production code.
contract SplitMarketSettlementSpike {
    error AlreadySettled();
    error NotBuyer();
    error WinningPriceMissing();

    address public immutable buyer;
    ISplitEscrowSpike public immutable escrow;
    bool public settled;
    euint256 private _winningPrice;

    constructor(address buyer_, ISplitEscrowSpike escrow_) {
        buyer = buyer_;
        escrow = escrow_;
    }

    function setWinningPrice(
        externalEuint256 encryptedPrice,
        bytes calldata inputProof
    ) external {
        if (msg.sender != buyer) revert NotBuyer();
        _winningPrice = Nox.fromExternal(encryptedPrice, inputProof);
        Nox.allowThis(_winningPrice);
    }

    function settleWinner(address winner) external {
        if (msg.sender != buyer) revert NotBuyer();
        if (settled) revert AlreadySettled();
        if (!Nox.isInitialized(_winningPrice)) revert WinningPriceMissing();
        settled = true;

        Nox.allowTransient(_winningPrice, address(escrow));
        escrow.settleWinner(_winningPrice, winner);
    }

    function settleWithoutTransientAccessForTest(address winner) external {
        if (msg.sender != buyer) revert NotBuyer();
        if (settled) revert AlreadySettled();
        escrow.settleWinner(_winningPrice, winner);
    }

    function refundNoWinner() external {
        if (msg.sender != buyer) revert NotBuyer();
        if (settled) revert AlreadySettled();
        settled = true;
        escrow.refundNoWinner();
    }

    function winningPriceHandle() external view returns (bytes32) {
        return euint256.unwrap(_winningPrice);
    }
}
