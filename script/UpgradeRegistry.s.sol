// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {PropertyRegistry} from "../src/core/PropertyRegistry.sol";

/// @notice Upgrades the PropertyRegistry proxy to the current implementation in src/.
///
///         The deployed implementation predates three changes that the frontend already
///         depends on:
///           - `registerProperty` was PROPERTY_ADMIN_ROLE-gated, so self-serve listing
///             reverted with AccessControlUnauthorizedAccount for every non-admin wallet
///           - `rejectSubmission` did not exist (admin "Send back" button)
///           - `updateOfferingTerms` did not exist (listing wizard edit path)
///
///         Storage is unchanged across the upgrade: `Types.Property` keeps the same 12
///         fields in the same order, and the contract's own slots (_nextPropertyId,
///         _properties, __gap) are untouched. Existing properties survive.
///
///         Like UpgradeKYCDemo this does NOT route through the Timelock —
///         _authorizeUpgrade is gated on PROPERTY_ADMIN_ROLE, which the deployer holds
///         directly on this deployment.
///
///         Required env vars:
///           PROPERTY_REGISTRY – the proxy address
///
///         Usage:
///           forge script script/UpgradeRegistry.s.sol --rpc-url $RPC_URL \
///             --private-key $PRIVATE_KEY --broadcast
contract UpgradeRegistry is Script {
    function run() external {
        address proxy = vm.envAddress("PROPERTY_REGISTRY");

        uint256 before = PropertyRegistry(proxy).totalProperties();
        console2.log("=== Upgrade PropertyRegistry ===");
        console2.log("Proxy:              ", proxy);
        console2.log("Properties on chain:", before);

        vm.startBroadcast();

        PropertyRegistry impl = new PropertyRegistry();
        console2.log("New implementation: ", address(impl));

        UUPSUpgradeable(proxy).upgradeToAndCall(address(impl), "");

        vm.stopBroadcast();

        uint256 afterCount = PropertyRegistry(proxy).totalProperties();
        console2.log("Properties after:   ", afterCount);
        require(afterCount == before, "property count changed across upgrade");
        console2.log("Upgrade complete; existing properties intact.");
    }
}
