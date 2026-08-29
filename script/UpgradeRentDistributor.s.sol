// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {RentDistributor} from "../src/core/RentDistributor.sol";
import {Types} from "../src/utils/Types.sol";

/// @notice Upgrades the RentDistributor proxy to pick up the getRentPeriod /
///         periodCount / hasClaimed view getters. The original implementation kept
///         every period in private storage with no accessor, so no UI could show
///         what had been deposited or claimed.
///
///         Storage layout is untouched — the upgrade adds view functions only — so
///         existing periods and claim flags survive.
///
///         Like UpgradeKYCDemo this does NOT route through the Timelock: ADMIN_ROLE
///         (which gates _authorizeUpgrade) is held by the deployer directly.
///
///         Required env vars:
///           RENT_DISTRIBUTOR – the RentDistributor proxy address
///
///         Usage:
///           forge script script/UpgradeRentDistributor.s.sol --rpc-url $RPC_URL \
///             --private-key $PRIVATE_KEY --broadcast
contract UpgradeRentDistributor is Script {
    function run() external {
        address proxy = vm.envAddress("RENT_DISTRIBUTOR");

        console2.log("=== Upgrade RentDistributor (add view getters) ===");
        console2.log("Proxy:", proxy);

        vm.startBroadcast();

        RentDistributor impl = new RentDistributor();
        console2.log("New implementation:", address(impl));

        UUPSUpgradeable(proxy).upgradeToAndCall(address(impl), "");

        vm.stopBroadcast();

        // Prove the new getters answer through the proxy before we call it done.
        uint256 count = RentDistributor(proxy).periodCount(1);
        console2.log("Proxy upgraded. periodCount(1) =", count);
    }
}
