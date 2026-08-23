// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {KYCRegistryDemo} from "../src/compliance/KYCRegistryDemo.sol";

/// @notice TESTNET ONLY. Upgrades a KYCRegistry proxy to KYCRegistryDemo, which lets
///         any wallet verify itself, and restores DEFAULT_ADMIN_ROLE / VERIFIER_ROLE
///         to the deployer so the admin KYC panel works again.
///
///         Unlike UpgradeContract.s.sol this does NOT route through the Timelock —
///         on this deployment ADMIN_ROLE (which gates _authorizeUpgrade) is held by
///         the deployer directly, and the Timelock holds nothing.
///
///         Required env vars:
///           KYC_REGISTRY      – the KYCRegistry proxy address
///           DEPLOYER_ADDRESS  – wallet holding ADMIN_ROLE; receives the restored roles
///
///         Usage:
///           forge script script/UpgradeKYCDemo.s.sol --rpc-url $RPC_URL \
///             --private-key $PRIVATE_KEY --broadcast
///
///         To disable self-verification later, upgrade the same proxy back to
///         KYCRegistry — every record written in the meantime is preserved.
contract UpgradeKYCDemo is Script {
    function run() external {
        address proxy = vm.envAddress("KYC_REGISTRY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        console2.log("=== Upgrade KYCRegistry -> KYCRegistryDemo (TESTNET ONLY) ===");
        console2.log("Proxy:   ", proxy);
        console2.log("Deployer:", deployer);

        vm.startBroadcast();

        KYCRegistryDemo impl = new KYCRegistryDemo();
        console2.log("New implementation:", address(impl));

        UUPSUpgradeable(proxy).upgradeToAndCall(address(impl), "");
        console2.log("Proxy upgraded.");

        // ADMIN_ROLE is the only authority left on this deployment; use it to make
        // the registry manageable again.
        KYCRegistryDemo(proxy).bootstrapRoles(deployer);
        console2.log("DEFAULT_ADMIN_ROLE + VERIFIER_ROLE granted to deployer.");

        vm.stopBroadcast();
    }
}
