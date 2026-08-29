// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {RentDistributor} from "../src/core/RentDistributor.sol";

/// @notice Deploys a real, initialised RentDistributor proxy.
///
///         The address previously recorded as `rentDistributor`
///         (0x6f56Df21…) was never a RentDistributor at all — it is a stray,
///         never-used KYCRegistry proxy from the botched DeployCore run, so
///         `registry` and `paymentToken` read as zero and no rent could ever be
///         deposited through it. It cannot be repaired in place: OZ Initializable
///         already flagged it initialised, so `initialize` reverts.
///
///         Required env vars:
///           PROPERTY_REGISTRY   – live PropertyRegistry proxy
///           PAYMENT_TOKEN       – ERC-20 rent is paid in (USDC)
///         Optional:
///           RENT_DISTRIBUTOR_IMPL – reuse an already-deployed implementation
///                                   instead of deploying a fresh one
contract DeployRentDistributor is Script {
    function run() external returns (address proxy) {
        address registry = vm.envAddress("PROPERTY_REGISTRY");
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");
        address existingImpl = vm.envOr("RENT_DISTRIBUTOR_IMPL", address(0));

        vm.startBroadcast();
        address deployer = msg.sender;

        address impl = existingImpl;
        if (impl == address(0)) {
            impl = address(new RentDistributor());
        }

        RentDistributor dist = RentDistributor(
            address(
                new ERC1967Proxy(impl, abi.encodeCall(RentDistributor.initialize, (deployer, registry, paymentToken)))
            )
        );

        vm.stopBroadcast();

        proxy = address(dist);

        console2.log("=== DeployRentDistributor ===");
        console2.log("RentDistributor (proxy):", proxy);
        console2.log("RentDistributor (impl) :", impl);
        console2.log("registry               :", address(dist.registry()));
        console2.log("paymentToken           :", address(dist.paymentToken()));
        console2.log("periodCount(1)         :", dist.periodCount(1));
        console2.log("Deployment block       :", block.number);
    }
}
