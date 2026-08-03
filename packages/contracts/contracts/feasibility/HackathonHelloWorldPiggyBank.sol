// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    Nox,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @notice iExec Nox Hello World journey contract.
/// @dev Isolated feasibility/registration evidence, never a production
/// VeilBid deployment input.
contract HackathonHelloWorldPiggyBank {
    euint256 public balance;
    address public owner;

    constructor() {
        owner = msg.sender;
        balance = Nox.toEuint256(0);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function deposit(
        externalEuint256 inputHandle,
        bytes calldata inputProof
    ) external {
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.add(balance, amount);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function withdraw(
        externalEuint256 inputHandle,
        bytes calldata inputProof
    ) external {
        require(msg.sender == owner, "only owner");
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.sub(balance, amount);
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }
}
