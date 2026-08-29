// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {Marketplace} from "../src/core/Marketplace.sol";
import {PriceOracle} from "../src/oracles/PriceOracle.sol";
import {KYCRegistry} from "../src/compliance/KYCRegistry.sol";

/// @notice Deploys the two core contracts that never made it onto Sepolia:
///         Marketplace and PriceOracle. Both are wired to the ALREADY-LIVE
///         PropertyRegistry / KYCRegistry rather than deploying a fresh stack,
///         so existing properties, tokens and offerings keep working.
///
///         Unlike DeployCore this script leaves the deployer as admin — it
///         matches the live Sepolia role layout, where the deployer (not a
///         timelock) holds every admin role. Do not use it for mainnet.
///
///         Required env vars:
///           PROPERTY_REGISTRY  – live PropertyRegistry proxy
///           KYC_REGISTRY       – live KYCRegistry proxy
///           PAYMENT_TOKEN      – ERC-20 used for marketplace settlement (USDC)
///         Optional:
///           TREASURY_ADDRESS   – receives marketplace fees (default: deployer)
///           MARKETPLACE_FEE_BPS– protocol fee in basis points (default: 50 = 0.5%)
contract DeployMissing is Script {
    function run() external returns (address marketplaceProxy, address priceOracleProxy) {
        address registry = vm.envAddress("PROPERTY_REGISTRY");
        address kyc = vm.envAddress("KYC_REGISTRY");
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");

        vm.startBroadcast();
        address deployer = msg.sender;

        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        uint16 feeBps = uint16(vm.envOr("MARKETPLACE_FEE_BPS", uint256(50)));

        // ── Marketplace ──────────────────────────────────────────────────────
        Marketplace marketImpl = new Marketplace();
        Marketplace market = Marketplace(
            address(
                new ERC1967Proxy(
                    address(marketImpl),
                    abi.encodeCall(Marketplace.initialize, (deployer, registry, kyc, paymentToken, feeBps, treasury))
                )
            )
        );

        // ── Whitelist the marketplace as a KYC-verified holder ───────────────
        // Marketplace escrows the seller's tokens, so it is the `to` of a
        // PropertyToken transfer. PropertyToken._update requires BOTH sides to be
        // KYC-verified, so an unverified escrow makes createListing revert with
        // KYCRegistry__NotVerified(marketplace). See Marketplace.t.sol setUp.
        KYCRegistry kycRegistry = KYCRegistry(kyc);
        if (kycRegistry.hasRole(kycRegistry.VERIFIER_ROLE(), deployer)) {
            if (!kycRegistry.isVerified(address(market))) {
                kycRegistry.verify(address(market), 0, 0, 0); // no country, no type, never expires
                console2.log("Marketplace whitelisted in KYCRegistry.");
            }
        } else {
            console2.log("WARNING: deployer lacks VERIFIER_ROLE - whitelist the marketplace manually:");
            console2.log("  kyc.verify(marketplace, 0, 0, 0)  else createListing will revert.");
        }

        // ── PriceOracle ──────────────────────────────────────────────────────
        PriceOracle oracleImpl = new PriceOracle();
        PriceOracle oracle = PriceOracle(
            address(new ERC1967Proxy(address(oracleImpl), abi.encodeCall(PriceOracle.initialize, (deployer))))
        );

        vm.stopBroadcast();

        marketplaceProxy = address(market);
        priceOracleProxy = address(oracle);

        console2.log("=== DeployMissing ===");
        console2.log("Marketplace (proxy):", marketplaceProxy);
        console2.log("Marketplace (impl) :", address(marketImpl));
        console2.log("PriceOracle (proxy):", priceOracleProxy);
        console2.log("PriceOracle (impl) :", address(oracleImpl));
        console2.log("");
        console2.log("Wired to registry  :", registry);
        console2.log("Wired to KYC       :", kyc);
        console2.log("Payment token      :", paymentToken);
        console2.log("Fee bps / treasury :", feeBps, treasury);
        console2.log("Deployment block   :", block.number);
    }
}
