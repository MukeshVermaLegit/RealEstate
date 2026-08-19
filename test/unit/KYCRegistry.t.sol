// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {Types} from "../../src/utils/Types.sol";
import {
    KYCRegistry__AlreadyVerified,
    KYCRegistry__NotVerified,
    KYCRegistry__AccountFrozen,
    KYCRegistry__KYCExpired,
    KYCRegistry__BatchLengthMismatch
} from "../../src/utils/Errors.sol";
import {
    AccountVerified,
    AccountRevoked,
    AccountFrozen,
    AccountUnfrozen
} from "../../src/utils/Events.sol";

contract KYCRegistryTest is Test {
    KYCRegistry internal kyc;

    address internal admin    = makeAddr("admin");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal verifier = makeAddr("verifier");

    // Standard verify params
    uint16  internal constant CC  = 840; // USA
    uint8   internal constant IT  = 2;   // accredited
    uint48  internal constant NO_EXPIRY = 0;

    function setUp() public {
        vm.startPrank(admin);
        KYCRegistry impl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(
            address(impl),
            abi.encodeCall(KYCRegistry.initialize, (admin))
        )));
        kyc.grantRole(kyc.VERIFIER_ROLE(), verifier);
        vm.stopPrank();
    }

    // ─── Upgrade test ────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        _verify(alice);
        assertTrue(kyc.isVerified(alice));

        // Deploy a new implementation (V2 = same bytecode for this test)
        vm.prank(admin);
        KYCRegistry newImpl = new KYCRegistry();

        // Upgrade via the proxy
        vm.prank(admin);
        kyc.upgradeToAndCall(address(newImpl), "");

        // State persisted
        assertTrue(kyc.isVerified(alice));
    }

    function test_revert_upgrade_notAdmin() public {
        vm.prank(alice);
        KYCRegistry newImpl = new KYCRegistry();
        vm.prank(bob);
        vm.expectRevert();
        kyc.upgradeToAndCall(address(newImpl), "");
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    function _verify(address account) internal {
        vm.prank(verifier);
        kyc.verify(account, CC, IT, NO_EXPIRY);
    }

    // ─── isVerified — default ────────────────────────────────────────────────

    function test_isVerified_returnsFalseByDefault() public view {
        assertFalse(kyc.isVerified(alice));
    }

    // ─── verify ──────────────────────────────────────────────────────────────

    function test_verify_setsVerified() public {
        _verify(alice);
        assertTrue(kyc.isVerified(alice));
    }

    function test_verify_storesAllFields() public {
        uint48 expiry = uint48(block.timestamp + 365 days);
        vm.prank(verifier);
        kyc.verify(alice, 276, 3, expiry); // Germany, qualified

        Types.InvestorRecord memory r = kyc.getInvestorRecord(alice);
        assertTrue(r.verified);
        assertEq(r.countryCode,  276);
        assertEq(r.investorType, 3);
        assertEq(r.verifiedAt,   uint48(block.timestamp));
        assertEq(r.expiresAt,    expiry);
        assertFalse(r.frozen);
    }

    function test_verify_emitsEvent() public {
        uint48 expiry = uint48(block.timestamp + 90 days);
        vm.prank(verifier);
        vm.expectEmit(true, true, false, true, address(kyc));
        emit AccountVerified(alice, verifier, CC, IT, expiry, block.timestamp);
        kyc.verify(alice, CC, IT, expiry);
    }

    function test_verify_adminCanAlsoVerify() public {
        vm.prank(admin);
        kyc.verify(alice, CC, IT, NO_EXPIRY);
        assertTrue(kyc.isVerified(alice));
    }

    function test_revert_verify_alreadyVerified() public {
        _verify(alice);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AlreadyVerified.selector, alice));
        kyc.verify(alice, CC, IT, NO_EXPIRY);
    }

    function test_revert_verify_frozenAccount() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);
        // Must revoke first, then cannot verify a frozen account
        vm.prank(verifier);
        kyc.revoke(alice);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AccountFrozen.selector, alice));
        kyc.verify(alice, CC, IT, NO_EXPIRY);
    }

    function test_revert_verify_nonVerifier() public {
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                role
            )
        );
        kyc.verify(alice, CC, IT, NO_EXPIRY);
    }

    // ─── revoke ──────────────────────────────────────────────────────────────

    function test_revoke_clearsVerified() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.revoke(alice);
        assertFalse(kyc.isVerified(alice));
    }

    function test_revoke_preservesOtherFields() public {
        uint48 expiry = uint48(block.timestamp + 30 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, expiry);

        vm.prank(verifier);
        kyc.revoke(alice);

        Types.InvestorRecord memory r = kyc.getInvestorRecord(alice);
        assertFalse(r.verified);
        assertEq(r.countryCode,  CC);   // preserved
        assertEq(r.investorType, IT);   // preserved
        assertEq(r.expiresAt,    expiry); // preserved
    }

    function test_revoke_emitsEvent() public {
        _verify(alice);
        vm.prank(verifier);
        vm.expectEmit(true, true, false, true, address(kyc));
        emit AccountRevoked(alice, verifier, block.timestamp);
        kyc.revoke(alice);
    }

    function test_revert_revoke_notVerified() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__NotVerified.selector, alice));
        kyc.revoke(alice);
    }

    function test_revert_revoke_nonVerifier() public {
        _verify(alice);
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                role
            )
        );
        kyc.revoke(alice);
    }

    // ─── freeze / unfreeze ───────────────────────────────────────────────────

    function test_freeze_makesIsVerifiedFalse() public {
        _verify(alice);
        assertTrue(kyc.isVerified(alice));

        vm.prank(verifier);
        kyc.freeze(alice);

        assertFalse(kyc.isVerified(alice));
    }

    function test_freeze_setsFrozenFlag() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);
        assertTrue(kyc.getInvestorRecord(alice).frozen);
    }

    function test_freeze_emitsEvent() public {
        _verify(alice);
        vm.prank(verifier);
        vm.expectEmit(true, false, false, false, address(kyc));
        emit AccountFrozen(alice);
        kyc.freeze(alice);
    }

    function test_revert_freeze_alreadyFrozen() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AccountFrozen.selector, alice));
        kyc.freeze(alice);
    }

    function test_unfreeze_restoresIsVerified() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);
        assertFalse(kyc.isVerified(alice));

        vm.prank(verifier);
        kyc.unfreeze(alice);
        assertTrue(kyc.isVerified(alice));
    }

    function test_unfreeze_clearsFrozenFlag() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);
        vm.prank(verifier);
        kyc.unfreeze(alice);
        assertFalse(kyc.getInvestorRecord(alice).frozen);
    }

    function test_unfreeze_emitsEvent() public {
        _verify(alice);
        vm.prank(verifier);
        kyc.freeze(alice);

        vm.prank(verifier);
        vm.expectEmit(true, false, false, false, address(kyc));
        emit AccountUnfrozen(alice);
        kyc.unfreeze(alice);
    }

    function test_unfreeze_idempotentOnUnfrozenAccount() public {
        _verify(alice);
        // Calling unfreeze on a non-frozen account should not revert
        vm.prank(verifier);
        kyc.unfreeze(alice);
        assertTrue(kyc.isVerified(alice));
    }

    function test_revert_freeze_nonVerifier() public {
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                role
            )
        );
        kyc.freeze(alice);
    }

    // ─── expiry ──────────────────────────────────────────────────────────────

    function test_isVerified_falseWhenExpired() public {
        uint48 expiry = uint48(block.timestamp + 1 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, expiry);
        assertTrue(kyc.isVerified(alice));

        vm.warp(block.timestamp + 1 days + 1);
        assertFalse(kyc.isVerified(alice));
    }

    function test_isVerified_trueAtExpiryBoundary() public {
        uint48 expiry = uint48(block.timestamp + 1 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, expiry);

        vm.warp(expiry);
        assertTrue(kyc.isVerified(alice)); // at exact expiry timestamp: still valid
    }

    function test_isVerified_trueWhenNoExpiry() public {
        _verify(alice); // expiresAt == 0
        vm.warp(block.timestamp + 3650 days);
        assertTrue(kyc.isVerified(alice));
    }

    // ─── updateExpiry ────────────────────────────────────────────────────────

    function test_updateExpiry_extendsExpiry() public {
        uint48 initial = uint48(block.timestamp + 30 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, initial);

        uint48 extended = uint48(block.timestamp + 365 days);
        vm.prank(verifier);
        kyc.updateExpiry(alice, extended);

        assertEq(kyc.getInvestorRecord(alice).expiresAt, extended);
        assertTrue(kyc.isVerified(alice));
    }

    function test_updateExpiry_setToNeverExpires() public {
        uint48 initial = uint48(block.timestamp + 30 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, initial);

        vm.prank(verifier);
        kyc.updateExpiry(alice, 0);
        assertEq(kyc.getInvestorRecord(alice).expiresAt, 0);
    }

    function test_revert_updateExpiry_notVerified() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__NotVerified.selector, alice));
        kyc.updateExpiry(alice, uint48(block.timestamp + 1 days));
    }

    function test_revert_updateExpiry_alreadyExpired() public {
        uint48 expiry = uint48(block.timestamp + 1 days);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, expiry);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__KYCExpired.selector, alice));
        kyc.updateExpiry(alice, uint48(block.timestamp + 30 days));
    }

    function test_revert_updateExpiry_nonVerifierRole() public {
        _verify(alice);
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                role
            )
        );
        kyc.updateExpiry(alice, 0);
    }

    // ─── batchVerify ─────────────────────────────────────────────────────────

    function test_batchVerify_verifiesAllAccounts() public {
        address[] memory accounts = new address[](3);
        uint16[]  memory ccs      = new uint16[](3);
        uint8[]   memory its      = new uint8[](3);
        uint48[]  memory expiries = new uint48[](3);

        accounts[0] = alice; ccs[0] = 840; its[0] = 1; expiries[0] = 0;
        accounts[1] = bob;   ccs[1] = 276; its[1] = 2; expiries[1] = 0;
        accounts[2] = makeAddr("carol"); ccs[2] = 156; its[2] = 3; expiries[2] = 0;

        vm.prank(verifier);
        kyc.batchVerify(accounts, ccs, its, expiries);

        assertTrue(kyc.isVerified(alice));
        assertTrue(kyc.isVerified(bob));
        assertTrue(kyc.isVerified(accounts[2]));

        assertEq(kyc.getInvestorRecord(alice).countryCode, 840);
        assertEq(kyc.getInvestorRecord(bob).countryCode,   276);
        assertEq(kyc.getInvestorRecord(accounts[2]).countryCode, 156);
    }

    function test_batchVerify_emitsEventForEach() public {
        address[] memory accounts = new address[](2);
        uint16[]  memory ccs      = new uint16[](2);
        uint8[]   memory its      = new uint8[](2);
        uint48[]  memory expiries = new uint48[](2);

        accounts[0] = alice; ccs[0] = CC; its[0] = IT; expiries[0] = NO_EXPIRY;
        accounts[1] = bob;   ccs[1] = CC; its[1] = IT; expiries[1] = NO_EXPIRY;

        vm.prank(verifier);
        vm.expectEmit(true, true, false, true, address(kyc));
        emit AccountVerified(alice, verifier, CC, IT, NO_EXPIRY, block.timestamp);
        vm.expectEmit(true, true, false, true, address(kyc));
        emit AccountVerified(bob, verifier, CC, IT, NO_EXPIRY, block.timestamp);
        kyc.batchVerify(accounts, ccs, its, expiries);
    }

    function test_revert_batchVerify_lengthMismatch() public {
        address[] memory accounts  = new address[](2);
        uint16[]  memory ccs       = new uint16[](1); // wrong length
        uint8[]   memory its       = new uint8[](2);
        uint48[]  memory expiries  = new uint48[](2);
        accounts[0] = alice; accounts[1] = bob;

        vm.prank(verifier);
        vm.expectRevert(KYCRegistry__BatchLengthMismatch.selector);
        kyc.batchVerify(accounts, ccs, its, expiries);
    }

    function test_revert_batchVerify_alreadyVerifiedMidBatch() public {
        _verify(alice);

        address[] memory accounts = new address[](2);
        uint16[]  memory ccs      = new uint16[](2);
        uint8[]   memory its      = new uint8[](2);
        uint48[]  memory expiries = new uint48[](2);
        accounts[0] = bob;   ccs[0] = CC; its[0] = IT; expiries[0] = 0;
        accounts[1] = alice; ccs[1] = CC; its[1] = IT; expiries[1] = 0; // already verified

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__AlreadyVerified.selector, alice));
        kyc.batchVerify(accounts, ccs, its, expiries);
    }

    function test_revert_batchVerify_nonVerifier() public {
        address[] memory accounts = new address[](1);
        uint16[]  memory ccs      = new uint16[](1);
        uint8[]   memory its      = new uint8[](1);
        uint48[]  memory expiries = new uint48[](1);
        accounts[0] = alice; ccs[0] = CC; its[0] = IT; expiries[0] = 0;

        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                role
            )
        );
        kyc.batchVerify(accounts, ccs, its, expiries);
    }

    // ─── getInvestorRecord ───────────────────────────────────────────────────

    function test_getInvestorRecord_defaultIsZeroStruct() public view {
        Types.InvestorRecord memory r = kyc.getInvestorRecord(alice);
        assertFalse(r.verified);
        assertFalse(r.frozen);
        assertEq(r.countryCode,  0);
        assertEq(r.investorType, 0);
        assertEq(r.verifiedAt,   0);
        assertEq(r.expiresAt,    0);
    }

    // ─── Role management ─────────────────────────────────────────────────────

    function test_adminCanGrantVerifierRole() public {
        address carol = makeAddr("carol");
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(admin);
        kyc.grantRole(role, carol);

        vm.prank(carol);
        kyc.verify(alice, CC, IT, NO_EXPIRY);
        assertTrue(kyc.isVerified(alice));
    }

    function test_adminCanRevokeVerifierRole() public {
        bytes32 role = kyc.VERIFIER_ROLE();
        vm.prank(admin);
        kyc.revokeRole(role, verifier);

        vm.prank(verifier);
        vm.expectRevert();
        kyc.verify(alice, CC, IT, NO_EXPIRY);
    }

    // ─── Combined scenarios ──────────────────────────────────────────────────

    function test_scenario_verifyFreezeUnfreezeRevoke() public {
        // 1. verify
        _verify(alice);
        assertTrue(kyc.isVerified(alice));

        // 2. freeze → isVerified false
        vm.prank(verifier);
        kyc.freeze(alice);
        assertFalse(kyc.isVerified(alice));

        // 3. unfreeze → isVerified true again
        vm.prank(verifier);
        kyc.unfreeze(alice);
        assertTrue(kyc.isVerified(alice));

        // 4. revoke → isVerified false, record preserved
        vm.prank(verifier);
        kyc.revoke(alice);
        assertFalse(kyc.isVerified(alice));
        assertEq(kyc.getInvestorRecord(alice).countryCode, CC); // data preserved
    }

    function test_scenario_revokeAndReverify() public {
        _verify(alice);

        vm.prank(verifier);
        kyc.revoke(alice);
        assertFalse(kyc.isVerified(alice));

        // re-verify with new params
        vm.prank(verifier);
        kyc.verify(alice, 276, 3, 0);
        assertTrue(kyc.isVerified(alice));
        assertEq(kyc.getInvestorRecord(alice).countryCode,  276);
        assertEq(kyc.getInvestorRecord(alice).investorType, 3);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_verifyAndRevoke(address account) public {
        vm.assume(account != address(0));
        vm.startPrank(verifier);
        kyc.verify(account, CC, IT, NO_EXPIRY);
        assertTrue(kyc.isVerified(account));
        kyc.revoke(account);
        assertFalse(kyc.isVerified(account));
        vm.stopPrank();
    }

    function testFuzz_expiryLogic(uint48 future) public {
        vm.assume(future > uint48(block.timestamp) && future < type(uint48).max - 1);
        vm.prank(verifier);
        kyc.verify(alice, CC, IT, future);
        assertTrue(kyc.isVerified(alice));

        // One second after expiry — must be false
        vm.warp(uint256(future) + 1);
        assertFalse(kyc.isVerified(alice));
    }
}
