// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Deploys a TimelockController and logs its address.
///
///         Required env vars:
///           MULTISIG_ADDRESS  – sole initial proposer (and canceller) of the timelock
///           TIMELOCK_DELAY    – minimum delay in seconds (e.g. 172800 = 48 hours)
///
///         Executor is set to address(0), meaning anyone may execute an operation
///         once the delay has elapsed.
///         Admin is set to address(0) so the timelock is self-administered after deploy.
contract DeployGovernance is Script {
    function run() external returns (address timelockAddress) {
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        uint256 delay    = vm.envUint("TIMELOCK_DELAY");

        address[] memory proposers = new address[](1);
        proposers[0] = multisig;

        // address(0) as the sole executor means anyone can execute after the delay.
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        vm.startBroadcast();

        TimelockController timelock = new TimelockController(
            delay,
            proposers,
            executors,
            address(0) // no external admin — timelock is self-administered
        );

        vm.stopBroadcast();

        timelockAddress = address(timelock);

        console2.log("=== Governance Deployment ===");
        console2.log("TimelockController :", timelockAddress);
        console2.log("Min delay (seconds):", delay);
        console2.log("Proposer (multisig):", multisig);
        console2.log("Executor           : anyone (address(0))");
    }
}
