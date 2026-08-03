// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    IVeilBidSafeRegistry,
    VeilBidSafePreparationModule
} from "./VeilBidSafePreparationModule.sol";

/// @notice Deterministically deploys one canonical preparation module per Safe.
/// @dev Deployment is permissionless. A deployed module has no authority until
/// the target Safe enables it and threshold-authorizes its one-time market
/// configuration.
contract VeilBidSafeModuleFactory {
    error InvalidMarket();
    error InvalidSafe();
    error ModuleAddressMismatch();

    address public immutable market;

    mapping(address safe => address module) public moduleOf;

    event SafeModuleDeployed(
        address indexed safe,
        address indexed module,
        address indexed market
    );

    constructor(address market_) {
        if (market_ == address(0)) revert InvalidMarket();
        market = market_;
    }

    function saltFor(address safe) public view returns (bytes32) {
        if (safe == address(0)) revert InvalidSafe();
        return keccak256(abi.encode(block.chainid, safe, market));
    }

    function creationCodeHash(
        address safe
    ) public pure returns (bytes32) {
        if (safe == address(0)) revert InvalidSafe();
        return
            keccak256(
                abi.encodePacked(
                    type(VeilBidSafePreparationModule).creationCode,
                    abi.encode(IVeilBidSafeRegistry(safe))
                )
            );
    }

    function predictModule(address safe) public view returns (address) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                saltFor(safe),
                creationCodeHash(safe)
            )
        );
        return address(uint160(uint256(digest)));
    }

    function deployModule(address safe) external returns (address module) {
        if (safe == address(0) || safe.code.length == 0) {
            revert InvalidSafe();
        }

        module = moduleOf[safe];
        if (module != address(0)) return module;

        address predicted = predictModule(safe);
        module = address(
            new VeilBidSafePreparationModule{salt: saltFor(safe)}(
                IVeilBidSafeRegistry(safe)
            )
        );
        if (module != predicted) revert ModuleAddressMismatch();

        moduleOf[safe] = module;
        emit SafeModuleDeployed(safe, module, market);
    }

    function isCanonicalModule(
        address safe,
        address module
    ) external view returns (bool) {
        return
            module != address(0) &&
            moduleOf[safe] == module &&
            module == predictModule(safe);
    }
}
