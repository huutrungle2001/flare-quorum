// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {
    ERC20ToERC7984Wrapper
} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/// @notice Valueless Sepolia faucet asset for the VeilBid demo.
contract VeilBidTestUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6;

    constructor() ERC20("VeilBid Test USDC", "vUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}

/// @notice Official Nox ERC-7984 wrapper configured for the demo asset.
contract VeilBidConfidentialUSDC is ERC20ToERC7984Wrapper {
    constructor(
        IERC20 underlying
    )
        ERC20ToERC7984Wrapper(
            "VeilBid Confidential USDC",
            "vcUSDC",
            "https://veilbid.xyz/test-token",
            underlying
        )
    {}
}
