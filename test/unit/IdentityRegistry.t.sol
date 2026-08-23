// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IdentityRegistry} from "../../src/compliance/IdentityRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {Types} from "../../src/utils/Types.sol";
import {
    IdentityRegistry__IdentityAlreadyExists,
    IdentityRegistry__IdentityNotFound,
    IdentityRegistry__ZeroAddress
} from "../../src/utils/Errors.sol";
import {IdentityRegistered, IdentityDeleted, IdentityCountryUpdated} from "../../src/utils/Events.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry internal idReg;
    KYCRegistry internal kyc;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint16 internal constant CC_USA = 840;
    uint16 internal constant CC_DEU = 276;
    bytes32 internal constant HASH_A = keccak256("alice-identity");
    bytes32 internal constant HASH_B = keccak256("bob-identity");

    function setUp() public {
        vm.startPrank(admin);

        KYCRegistry kycImpl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(address(kycImpl), abi.encodeCall(KYCRegistry.initialize, (admin)))));

        idReg = new IdentityRegistry(admin, address(kyc));
        idReg.grantRole(idReg.IDENTITY_AGENT_ROLE(), agent);

        vm.stopPrank();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsKycRegistry() public view {
        assertEq(idReg.kycRegistry(), address(kyc));
    }

    function test_constructor_revert_zeroAdmin() public {
        vm.expectRevert(IdentityRegistry__ZeroAddress.selector);
        new IdentityRegistry(address(0), address(kyc));
    }

    function test_constructor_revert_zeroKyc() public {
        vm.expectRevert(IdentityRegistry__ZeroAddress.selector);
        new IdentityRegistry(admin, address(0));
    }

    // ─── registerIdentity ────────────────────────────────────────────────────

    function test_registerIdentity_storesRecord() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        Types.Identity memory id = idReg.identity(alice);
        assertEq(id.wallet, alice);
        assertEq(id.countryCode, CC_USA);
        assertEq(id.identityHash, HASH_A);
    }

    function test_registerIdentity_countryCode_view() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_DEU, HASH_A);
        assertEq(idReg.countryCode(alice), CC_DEU);
    }

    function test_registerIdentity_emitsEvent() public {
        vm.prank(agent);
        vm.expectEmit(true, false, false, true, address(idReg));
        emit IdentityRegistered(alice, CC_USA, HASH_A);
        idReg.registerIdentity(alice, CC_USA, HASH_A);
    }

    function test_registerIdentity_revert_alreadyExists() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry__IdentityAlreadyExists.selector, alice));
        idReg.registerIdentity(alice, CC_USA, HASH_A);
    }

    function test_registerIdentity_revert_zeroWallet() public {
        vm.prank(agent);
        vm.expectRevert(IdentityRegistry__ZeroAddress.selector);
        idReg.registerIdentity(address(0), CC_USA, HASH_A);
    }

    function test_registerIdentity_revert_noRole() public {
        bytes32 role = idReg.IDENTITY_AGENT_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        idReg.registerIdentity(bob, CC_USA, HASH_B);
    }

    // ─── deleteIdentity ──────────────────────────────────────────────────────

    function test_deleteIdentity_clearsRecord() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        vm.prank(agent);
        idReg.deleteIdentity(alice);

        Types.Identity memory id = idReg.identity(alice);
        assertEq(id.wallet, address(0));
        assertEq(id.countryCode, 0);
        assertEq(id.identityHash, bytes32(0));
    }

    function test_deleteIdentity_emitsEvent() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        vm.prank(agent);
        vm.expectEmit(true, false, false, false, address(idReg));
        emit IdentityDeleted(alice);
        idReg.deleteIdentity(alice);
    }

    function test_deleteIdentity_allowsReRegistration() public {
        vm.startPrank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);
        idReg.deleteIdentity(alice);
        idReg.registerIdentity(alice, CC_DEU, HASH_B);
        vm.stopPrank();

        assertEq(idReg.countryCode(alice), CC_DEU);
    }

    function test_deleteIdentity_revert_notFound() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry__IdentityNotFound.selector, alice));
        idReg.deleteIdentity(alice);
    }

    // ─── updateCountry ───────────────────────────────────────────────────────

    function test_updateCountry_changesCode() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        vm.prank(agent);
        idReg.updateCountry(alice, CC_DEU);

        assertEq(idReg.countryCode(alice), CC_DEU);
    }

    function test_updateCountry_emitsEvent() public {
        vm.prank(agent);
        idReg.registerIdentity(alice, CC_USA, HASH_A);

        vm.prank(agent);
        vm.expectEmit(true, false, false, true, address(idReg));
        emit IdentityCountryUpdated(alice, CC_USA, CC_DEU);
        idReg.updateCountry(alice, CC_DEU);
    }

    function test_updateCountry_revert_notFound() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry__IdentityNotFound.selector, alice));
        idReg.updateCountry(alice, CC_DEU);
    }

    // ─── isVerified — delegates to KYCRegistry ───────────────────────────────

    function test_isVerified_falseByDefault() public view {
        assertFalse(idReg.isVerified(alice));
    }

    function test_isVerified_trueAfterKYC() public {
        vm.prank(admin);
        kyc.verify(alice, CC_USA, 2, 0);
        assertTrue(idReg.isVerified(alice));
    }

    function test_isVerified_falseAfterRevoke() public {
        vm.startPrank(admin);
        kyc.verify(alice, CC_USA, 2, 0);
        kyc.revoke(alice);
        vm.stopPrank();
        assertFalse(idReg.isVerified(alice));
    }

    function test_isVerified_falseAfterFreeze() public {
        vm.startPrank(admin);
        kyc.verify(alice, CC_USA, 2, 0);
        kyc.freeze(alice);
        vm.stopPrank();
        assertFalse(idReg.isVerified(alice));
    }

    function test_isVerified_notRequiresIdentityRecord() public {
        // isVerified() only checks KYC — identity record is not required
        vm.prank(admin);
        kyc.verify(alice, CC_USA, 2, 0);
        // alice has no identity record in IdentityRegistry
        assertTrue(idReg.isVerified(alice));
    }

    // ─── identity() for unregistered wallet ──────────────────────────────────

    function test_identity_returnsZeroStructForUnregistered() public view {
        Types.Identity memory id = idReg.identity(bob);
        assertEq(id.wallet, address(0));
        assertEq(id.countryCode, 0);
        assertEq(id.identityHash, bytes32(0));
    }

    function test_countryCode_returnsZeroForUnregistered() public view {
        assertEq(idReg.countryCode(bob), 0);
    }
}
