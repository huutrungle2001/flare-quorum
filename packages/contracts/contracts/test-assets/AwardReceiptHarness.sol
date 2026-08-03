// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    VeilBidAwardReceipt
} from "../receipt/VeilBidAwardReceipt.sol";

contract AwardReceiptHarness {
    VeilBidAwardReceipt public immutable receipt;

    constructor() {
        receipt = new VeilBidAwardReceipt();
    }

    function mint(
        uint256 tenderId,
        address buyer,
        address winner,
        address paymentToken
    ) external {
        receipt.mint(tenderId, buyer, winner, paymentToken);
    }
}
