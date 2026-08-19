// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface ITimelockController {
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external;
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external;
    function getMinDelay() external view returns (uint256);
    function isOperationReady(bytes32 id) external view returns (bool);
    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external pure returns (bytes32);
}

interface IAccessControl {
    function grantRole(bytes32 role, address account) external;
    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IKYCRegistry {
    function verify(
        address account,
        uint16  countryCode,
        uint8   investorType,
        uint48  expiresAt
    ) external;
    function isVerified(address account) external view returns (bool);
}

/// @notice Grants VERIFIER_ROLE + UPDATER_ROLE to the deployer via Timelock,
///         then immediately KYC-verifies the deployer wallet.
///         Run with --broadcast. The script sleeps until the timelock delay passes.
contract BootstrapAccess is Script {
    bytes32 constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 constant UPDATER_ROLE  = keccak256("UPDATER_ROLE");

    bytes32 constant SALT_VERIFIER = keccak256("bootstrap-verifier-role-v1");
    bytes32 constant SALT_UPDATER  = keccak256("bootstrap-updater-role-v1");

    function run() external {
        address timelock    = vm.envAddress("TIMELOCK_ADDRESS");
        address kycRegistry = vm.envAddress("KYC_REGISTRY");
        address priceOracle = vm.envAddress("PRICE_ORACLE");
        address deployer    = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 delay       = ITimelockController(timelock).getMinDelay();

        bytes memory grantVerifier = abi.encodeCall(
            IAccessControl.grantRole,
            (VERIFIER_ROLE, deployer)
        );
        bytes memory grantUpdater = abi.encodeCall(
            IAccessControl.grantRole,
            (UPDATER_ROLE, deployer)
        );

        console.log("=== Bootstrap Access ===");
        console.log("Timelock delay:", delay, "seconds");
        console.log("Deployer:      ", deployer);

        vm.startBroadcast();

        // ── Step 1: Schedule both role grants ───────────────────────────────
        console.log("\n[1] Scheduling grantRole(VERIFIER_ROLE, deployer) on KYCRegistry...");
        ITimelockController(timelock).schedule(
            kycRegistry, 0, grantVerifier, bytes32(0), SALT_VERIFIER, delay
        );

        console.log("[2] Scheduling grantRole(UPDATER_ROLE, deployer) on PriceOracle...");
        ITimelockController(timelock).schedule(
            priceOracle, 0, grantUpdater, bytes32(0), SALT_UPDATER, delay
        );

        vm.stopBroadcast();

        // ── Step 2: Wait for timelock ────────────────────────────────────────
        uint256 waitTime = delay + 5;
        console.log("\n[3] Waiting", waitTime, "seconds for timelock...");
        vm.sleep(waitTime * 1000); // forge sleep takes milliseconds

        // ── Step 3: Execute both operations ─────────────────────────────────
        vm.startBroadcast();

        console.log("[4] Executing: grant VERIFIER_ROLE to deployer...");
        ITimelockController(timelock).execute(
            kycRegistry, 0, grantVerifier, bytes32(0), SALT_VERIFIER
        );

        console.log("[5] Executing: grant UPDATER_ROLE to deployer...");
        ITimelockController(timelock).execute(
            priceOracle, 0, grantUpdater, bytes32(0), SALT_UPDATER
        );

        // ── Step 4: KYC-verify the deployer ─────────────────────────────────
        console.log("[6] Verifying deployer KYC...");
        IKYCRegistry(kycRegistry).verify(
            deployer,
            840,          // countryCode: USA
            1,            // investorType: 1 = accredited
            uint48(block.timestamp + 365 days * 10) // expires in 10 years
        );

        vm.stopBroadcast();

        console.log("\n=== Done ===");
        console.log("Deployer now has VERIFIER_ROLE on KYCRegistry");
        console.log("Deployer now has UPDATER_ROLE on PriceOracle");
        console.log("Deployer is KYC-verified");
        console.log("\nTo KYC any other wallet:");
        console.log("  cast send", kycRegistry,
            "'verify(address,uint16,uint8,uint48)' <wallet> 840 1 9999999999",
            "--rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY");
        console.log("\nTo set a property token price:");
        console.log("  cast send", priceOracle,
            "'updatePrice(uint256,uint256)' <propertyId> <priceInWei>",
            "--rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY");
    }
}
