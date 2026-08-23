// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {KYCRegistry} from "../src/compliance/KYCRegistry.sol";
import {PriceOracle} from "../src/oracles/PriceOracle.sol";
import {PropertyRegistry} from "../src/core/PropertyRegistry.sol";
import {PropertyFactory} from "../src/core/PropertyFactory.sol";
import {RentDistributor} from "../src/core/RentDistributor.sol";
import {Marketplace} from "../src/core/Marketplace.sol";

/// @notice Full deployment of all core contracts via UUPS proxies.
///
///         Dependency order:
///           KYCRegistry → PriceOracle → PropertyRegistry → PropertyToken →
///           RentDistributor → Marketplace
///
///         Each contract is deployed as:
///           1. Implementation (logic) contract
///           2. ERC1967Proxy pointing to the implementation, with initializer call
///
///         After deployment every admin / privileged role is transferred to the
///         TimelockController and the deployer's own admin role is renounced,
///         leaving the Timelock as the sole governance authority.
///
///         Required env vars:
///           PAYMENT_TOKEN      – address of the ERC-20 used for rent & marketplace payments
///           MULTISIG_ADDRESS   – multisig that will act as proposer on the timelock
///           TIMELOCK_ADDRESS   – address of the already-deployed TimelockController
///                                (from DeployGovernance.s.sol)
///           TREASURY_ADDRESS   – optional; receives marketplace protocol fees.
///                                Defaults to TIMELOCK_ADDRESS. Never leave this as the
///                                deployer EOA: the deployer renounces every role below,
///                                so fees would keep flowing to a key with no governance
///                                standing and only a timelock proposal could redirect them.
contract DeployCore is Script {
    // Role constants — must match the values in each contract.
    bytes32 private constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 private constant PROPERTY_ADMIN_ROLE = keccak256("PROPERTY_ADMIN_ROLE");
    bytes32 private constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 private constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 private constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 private constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    struct Deployment {
        // Proxy addresses (stable — use these for all interactions)
        address kycRegistry;
        address priceOracle;
        address propertyRegistry;
        address propertyFactory;
        address rentDistributor;
        address marketplace;
        // Implementation addresses (for reference / verification)
        address kycRegistryImpl;
        address priceOracleImpl;
        address propertyRegistryImpl;
        address propertyFactoryImpl;
        address rentDistributorImpl;
        address marketplaceImpl;
    }

    function run() external returns (Deployment memory d) {
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        address timelockAddress = vm.envAddress("TIMELOCK_ADDRESS");
        // Fees accrue to governance by default rather than to the deploying EOA.
        address treasury = vm.envOr("TREASURY_ADDRESS", timelockAddress);

        vm.startBroadcast();
        address deployer = msg.sender;

        // ── 1. Deploy implementations ────────────────────────────────────────

        KYCRegistry kycImpl = new KYCRegistry();
        PriceOracle oracleImpl = new PriceOracle();
        PropertyRegistry registryImpl = new PropertyRegistry();
        PropertyFactory factoryImpl = new PropertyFactory();
        RentDistributor rentImpl = new RentDistributor();
        Marketplace marketImpl = new Marketplace();

        // ── 2. Deploy proxies with initialization calldata ───────────────────

        KYCRegistry kyc = KYCRegistry(
            address(new ERC1967Proxy(address(kycImpl), abi.encodeCall(KYCRegistry.initialize, (deployer))))
        );

        PriceOracle oracle = PriceOracle(
            address(new ERC1967Proxy(address(oracleImpl), abi.encodeCall(PriceOracle.initialize, (deployer))))
        );

        PropertyRegistry registry = PropertyRegistry(
            address(new ERC1967Proxy(address(registryImpl), abi.encodeCall(PropertyRegistry.initialize, (deployer))))
        );

        PropertyFactory factory = PropertyFactory(
            address(new ERC1967Proxy(address(factoryImpl), abi.encodeCall(PropertyFactory.initialize, (deployer))))
        );

        RentDistributor rentDist = RentDistributor(
            address(
                new ERC1967Proxy(
                    address(rentImpl),
                    abi.encodeCall(RentDistributor.initialize, (deployer, address(registry), paymentToken))
                )
            )
        );

        Marketplace market = Marketplace(
            address(
                new ERC1967Proxy(
                    address(marketImpl),
                    abi.encodeCall(
                        Marketplace.initialize, (deployer, address(registry), address(kyc), paymentToken, 50, treasury)
                    )
                )
            )
        );

        // Factory needs PROPERTY_ADMIN_ROLE to register token addresses
        registry.grantRole(PROPERTY_ADMIN_ROLE, address(factory));

        // ── 3. Grant all privileged roles to the TimelockController ──────────

        // KYCRegistry: grant DEFAULT_ADMIN, ADMIN_ROLE, VERIFIER_ROLE
        kyc.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        kyc.grantRole(ADMIN_ROLE, timelockAddress);
        kyc.grantRole(VERIFIER_ROLE, timelockAddress);

        // PriceOracle: grant DEFAULT_ADMIN, UPDATER_ROLE
        oracle.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        oracle.grantRole(UPDATER_ROLE, timelockAddress);

        // PropertyRegistry: grant DEFAULT_ADMIN, PROPERTY_ADMIN_ROLE
        registry.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        registry.grantRole(PROPERTY_ADMIN_ROLE, timelockAddress);

        // PropertyFactory: grant DEFAULT_ADMIN, FACTORY_ROLE
        factory.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        factory.grantRole(FACTORY_ROLE, timelockAddress);

        // Marketplace: grant DEFAULT_ADMIN, ADMIN_ROLE
        market.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        market.grantRole(ADMIN_ROLE, timelockAddress);

        // RentDistributor: grant DEFAULT_ADMIN, ADMIN_ROLE
        rentDist.grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
        rentDist.grantRole(ADMIN_ROLE, timelockAddress);

        // ── 4. Renounce deployer's admin roles ───────────────────────────────

        market.renounceRole(ADMIN_ROLE, deployer);
        market.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        rentDist.renounceRole(ADMIN_ROLE, deployer);
        rentDist.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        factory.renounceRole(FACTORY_ROLE, deployer);
        factory.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        registry.renounceRole(PROPERTY_ADMIN_ROLE, deployer);
        registry.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        oracle.renounceRole(UPDATER_ROLE, deployer);
        oracle.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        kyc.renounceRole(VERIFIER_ROLE, deployer);
        kyc.renounceRole(ADMIN_ROLE, deployer);
        kyc.renounceRole(DEFAULT_ADMIN_ROLE, deployer);

        vm.stopBroadcast();

        // ── 5. Populate return struct ────────────────────────────────────────
        d = Deployment({
            kycRegistry: address(kyc),
            priceOracle: address(oracle),
            propertyRegistry: address(registry),
            propertyFactory: address(factory),
            rentDistributor: address(rentDist),
            marketplace: address(market),
            kycRegistryImpl: address(kycImpl),
            priceOracleImpl: address(oracleImpl),
            propertyRegistryImpl: address(registryImpl),
            propertyFactoryImpl: address(factoryImpl),
            rentDistributorImpl: address(rentImpl),
            marketplaceImpl: address(marketImpl)
        });

        // ── 6. Log all deployed addresses ────────────────────────────────────
        console2.log("=== Core Deployment (Proxies) ===");
        console2.log("KYCRegistry      (proxy):", d.kycRegistry);
        console2.log("KYCRegistry      (impl) :", d.kycRegistryImpl);
        console2.log("PriceOracle      (proxy):", d.priceOracle);
        console2.log("PriceOracle      (impl) :", d.priceOracleImpl);
        console2.log("PropertyRegistry (proxy):", d.propertyRegistry);
        console2.log("PropertyRegistry (impl) :", d.propertyRegistryImpl);
        console2.log("PropertyFactory  (proxy):", d.propertyFactory);
        console2.log("PropertyFactory  (impl) :", d.propertyFactoryImpl);
        console2.log("RentDistributor  (proxy):", d.rentDistributor);
        console2.log("RentDistributor  (impl) :", d.rentDistributorImpl);
        console2.log("Marketplace      (proxy):", d.marketplace);
        console2.log("Marketplace      (impl) :", d.marketplaceImpl);
        console2.log("");
        console2.log("=== Governance ===");
        console2.log("TimelockController:", timelockAddress);
        console2.log("Multisig (proposer):", multisig);
        console2.log("Fee treasury       :", treasury);
        console2.log("Payment token      :", paymentToken);
        console2.log("");
        console2.log("Deployer roles renounced. Timelock is sole admin.");
    }
}
