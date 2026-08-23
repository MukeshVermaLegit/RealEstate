// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {KYCRegistryDemo} from "../../src/compliance/KYCRegistryDemo.sol";
import {Types} from "../../src/utils/Types.sol";
import {KYCRegistry__AccountFrozen} from "../../src/utils/Errors.sol";

contract KYCRegistryDemoTest is Test {
    KYCRegistryDemo internal kyc;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;

    function setUp() public {
        // Deploy the production registry behind a proxy, then upgrade it to the
        // demo implementation — exactly the path taken on the live testnet.
        KYCRegistry prodImpl = new KYCRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(address(prodImpl), abi.encodeCall(KYCRegistry.initialize, (admin)));

        KYCRegistryDemo demoImpl = new KYCRegistryDemo();
        vm.prank(admin);
        UUPSUpgradeable(address(proxy)).upgradeToAndCall(address(demoImpl), "");

        kyc = KYCRegistryDemo(address(proxy));
    }

    function test_selfVerify_marksCallerVerified() public {
        assertFalse(kyc.isVerified(alice));

        vm.prank(alice);
        kyc.selfVerify();

        assertTrue(kyc.isVerified(alice));
        Types.InvestorRecord memory rec = kyc.getInvestorRecord(alice);
        assertTrue(rec.verified);
        assertEq(rec.investorType, 1);
        assertEq(rec.expiresAt, 0, "demo records never expire");
    }

    function test_selfVerify_onlyAffectsCaller() public {
        vm.prank(alice);
        kyc.selfVerify();

        assertTrue(kyc.isVerified(alice));
        assertFalse(kyc.isVerified(bob));
    }

    function test_selfVerify_isIdempotent() public {
        vm.startPrank(alice);
        kyc.selfVerify();
        uint48 firstVerifiedAt = kyc.getInvestorRecord(alice).verifiedAt;

        skip(1 days);
        kyc.selfVerify(); // must not revert
        vm.stopPrank();

        assertTrue(kyc.isVerified(alice));
        assertEq(kyc.getInvestorRecord(alice).verifiedAt, firstVerifiedAt, "a second call must not rewrite the record");
    }

    function test_revert_selfVerify_whenFrozen() public {
        // Freezing needs VERIFIER_ROLE, which the initializer gave to admin.
        vm.prank(admin);
        kyc.freeze(alice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AccountFrozen.selector, alice));
        kyc.selfVerify();

        assertFalse(kyc.isVerified(alice));
    }

    function test_selfVerify_cannotUnfreezeViaReverify() public {
        vm.startPrank(admin);
        kyc.verify(alice, 840, 2, 0);
        kyc.freeze(alice);
        vm.stopPrank();

        assertFalse(kyc.isVerified(alice), "frozen accounts are not verified");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AccountFrozen.selector, alice));
        kyc.selfVerify();
    }

    function test_bootstrapRoles_restoresGrantAbility() public {
        // Cached deliberately: an inline `kyc.VERIFIER_ROLE()` inside a call being
        // pranked would consume the prank itself before the call under test runs.
        bytes32 verifierRole = kyc.VERIFIER_ROLE();

        // Reproduce the live deployment: DEFAULT_ADMIN_ROLE renounced, so
        // grantRole is impossible and VERIFIER_ROLE can never be handed out.
        vm.startPrank(admin);
        kyc.renounceRole(DEFAULT_ADMIN_ROLE, admin);
        kyc.renounceRole(verifierRole, admin);
        vm.stopPrank();

        assertFalse(kyc.hasRole(verifierRole, admin));

        vm.prank(admin);
        vm.expectRevert(); // no DEFAULT_ADMIN_ROLE holder left to authorise it
        kyc.grantRole(verifierRole, admin);

        // ADMIN_ROLE survives, and it is enough to rebuild the rest.
        vm.prank(admin);
        kyc.bootstrapRoles(admin);

        assertTrue(kyc.hasRole(DEFAULT_ADMIN_ROLE, admin));
        assertTrue(kyc.hasRole(verifierRole, admin));

        vm.prank(admin);
        kyc.verify(bob, 840, 1, 0);
        assertTrue(kyc.isVerified(bob));
    }

    function test_revert_bootstrapRoles_notAdminRole() public {
        vm.prank(alice);
        vm.expectRevert();
        kyc.bootstrapRoles(alice);
    }

    function test_upgrade_preservesExistingRecords() public {
        vm.prank(admin);
        kyc.verify(alice, 840, 2, 0);
        assertTrue(kyc.isVerified(alice));

        // Upgrading back to the production implementation keeps every record and
        // removes self-verification.
        KYCRegistry prodImpl = new KYCRegistry();
        vm.prank(admin);
        UUPSUpgradeable(address(kyc)).upgradeToAndCall(address(prodImpl), "");

        assertTrue(KYCRegistry(address(kyc)).isVerified(alice), "records survive the downgrade");

        vm.prank(bob);
        vm.expectRevert(); // selfVerify no longer exists in the implementation
        kyc.selfVerify();
    }
}
