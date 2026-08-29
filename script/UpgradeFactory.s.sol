// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {PropertyFactory} from "../src/core/PropertyFactory.sol";

/// @notice Re-points the PropertyFactory proxy at the current PropertyToken bytecode.
///
///         The live factory was compiled before PropertyToken gained its
///         self-delegation hook in `_update`, so every token it minted left holders
///         with `delegates(holder) == address(0)` and therefore ZERO voting power.
///         RentDistributor caps each claim at
///             ceil(getPastVotes * totalRent / getPastTotalSupply)
///         so a holder with no votes has a cap of zero and every claim reverts —
///         rent distribution is silently impossible on tokens from the old factory.
///
///         This fixes NEW tokens only. Tokens already deployed are plain (non-proxy)
///         contracts and cannot be upgraded; their holders must call `delegate(self)`
///         once, and any rent snapshot must be taken AFTER that transaction.
///
///         Required env vars:
///           PROPERTY_FACTORY – the PropertyFactory proxy address
contract UpgradeFactory is Script {
    function run() external {
        address proxy = vm.envAddress("PROPERTY_FACTORY");

        console2.log("=== Upgrade PropertyFactory (self-delegating PropertyToken) ===");
        console2.log("Proxy:", proxy);

        vm.startBroadcast();

        PropertyFactory impl = new PropertyFactory();
        console2.log("New implementation:", address(impl));

        UUPSUpgradeable(proxy).upgradeToAndCall(address(impl), "");

        vm.stopBroadcast();

        console2.log("Upgraded. New tokens will self-delegate on first receipt.");
    }
}
