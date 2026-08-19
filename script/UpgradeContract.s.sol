// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Generic UUPS upgrade script via TimelockController proposal flow.
///
///         Steps:
///           1. schedule()  — propose the upgrade (tx must be from a PROPOSER)
///           2. Wait minDelay seconds on-chain
///           3. execute()   — execute the upgrade (tx must be from an EXECUTOR)
///
///         Required env vars:
///           TIMELOCK_ADDRESS   – deployed TimelockController address
///           PROXY_ADDRESS      – proxy to upgrade
///           NEW_IMPL_ADDRESS   – new implementation address
///
///         Usage:
///           # Step 1: schedule
///           forge script script/UpgradeContract.s.sol --sig "schedule()" ...
///           # Step 2: (wait minDelay)
///           # Step 3: execute
///           forge script script/UpgradeContract.s.sol --sig "execute()" ...
contract UpgradeContract is Script {

    /// @notice Schedule the upgrade proposal on the TimelockController.
    function schedule() external {
        address timelockAddress = vm.envAddress("TIMELOCK_ADDRESS");
        address proxyAddress    = vm.envAddress("PROXY_ADDRESS");
        address newImpl         = vm.envAddress("NEW_IMPL_ADDRESS");

        TimelockController timelock = TimelockController(payable(timelockAddress));

        // upgradeToAndCall(newImpl, "") — empty calldata means no post-upgrade init
        bytes memory upgradeCalldata = abi.encodeCall(
            UUPSUpgradeable.upgradeToAndCall,
            (newImpl, "")
        );

        uint256 minDelay = timelock.getMinDelay();
        bytes32 predecessor = bytes32(0);
        bytes32 salt = keccak256(abi.encodePacked("upgrade", proxyAddress, newImpl, block.timestamp));

        vm.startBroadcast();

        timelock.schedule(
            proxyAddress,    // target
            0,               // value
            upgradeCalldata, // data
            predecessor,
            salt,
            minDelay
        );

        vm.stopBroadcast();

        bytes32 opId = timelock.hashOperation(proxyAddress, 0, upgradeCalldata, predecessor, salt);

        console2.log("=== Upgrade Scheduled ===");
        console2.log("Proxy          :", proxyAddress);
        console2.log("New impl       :", newImpl);
        console2.log("Timelock       :", timelockAddress);
        console2.log("Min delay (s)  :", minDelay);
        console2.log("Operation ID   :");
        console2.logBytes32(opId);
        console2.log("Salt           :");
        console2.logBytes32(salt);
        console2.log("Execute after  :", block.timestamp + minDelay);
    }

    /// @notice Execute a previously scheduled upgrade.
    ///         Set SALT env var to the salt used during schedule().
    function execute() external {
        address timelockAddress = vm.envAddress("TIMELOCK_ADDRESS");
        address proxyAddress    = vm.envAddress("PROXY_ADDRESS");
        address newImpl         = vm.envAddress("NEW_IMPL_ADDRESS");
        bytes32 salt            = vm.envBytes32("UPGRADE_SALT");

        TimelockController timelock = TimelockController(payable(timelockAddress));

        bytes memory upgradeCalldata = abi.encodeCall(
            UUPSUpgradeable.upgradeToAndCall,
            (newImpl, "")
        );

        bytes32 predecessor = bytes32(0);

        vm.startBroadcast();

        timelock.execute(
            proxyAddress,
            0,
            upgradeCalldata,
            predecessor,
            salt
        );

        vm.stopBroadcast();

        console2.log("=== Upgrade Executed ===");
        console2.log("Proxy    :", proxyAddress);
        console2.log("New impl :", newImpl);
    }

    /// @notice Helper: compute the operation ID for a pending upgrade (read-only).
    function operationId() external view returns (bytes32 opId) {
        address timelockAddress = vm.envAddress("TIMELOCK_ADDRESS");
        address proxyAddress    = vm.envAddress("PROXY_ADDRESS");
        address newImpl         = vm.envAddress("NEW_IMPL_ADDRESS");
        bytes32 salt            = vm.envBytes32("UPGRADE_SALT");

        TimelockController timelock = TimelockController(payable(timelockAddress));

        bytes memory upgradeCalldata = abi.encodeCall(
            UUPSUpgradeable.upgradeToAndCall,
            (newImpl, "")
        );

        opId = timelock.hashOperation(proxyAddress, 0, upgradeCalldata, bytes32(0), salt);

        console2.log("Operation ID:");
        console2.logBytes32(opId);
        console2.log("Is pending  :", timelock.isOperationPending(opId));
        console2.log("Is ready    :", timelock.isOperationReady(opId));
        console2.log("Is done     :", timelock.isOperationDone(opId));
    }
}
