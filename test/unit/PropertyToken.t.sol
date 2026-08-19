// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PropertyToken} from "../../src/core/PropertyToken.sol";
import {PropertyRegistry} from "../../src/core/PropertyRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {
    PropertyToken__ExceedsMaxSupply,
    PropertyToken__ZeroAddress,
    PropertyToken__ZeroAmount,
    KYCRegistry__NotVerified
} from "../../src/utils/Errors.sol";
import {PropertyTokensMinted, PropertyTokensBurned, ForcedTransfer} from "../../src/utils/Events.sol";

contract PropertyTokenTest is Test {
    PropertyRegistry internal registry;
    KYCRegistry      internal kyc;
    PropertyToken    internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    uint256 internal constant PROPERTY_ID  = 1;
    uint256 internal constant MAX_SUPPLY   = 1_000 ether;

    function setUp() public {
        vm.startPrank(admin);

        PropertyRegistry registryImpl = new PropertyRegistry();
        registry = PropertyRegistry(address(new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(PropertyRegistry.initialize, (admin))
        )));

        KYCRegistry kycImpl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(
            address(kycImpl),
            abi.encodeCall(KYCRegistry.initialize, (admin))
        )));

        token    = new PropertyToken(
            "PropToken A",
            "PTA",
            PROPERTY_ID,
            MAX_SUPPLY,
            admin,
            address(kyc),
            address(0)  // no compliance module
        );

        kyc.verify(alice, 840, 2, 0);
        vm.stopPrank();
    }

    // ─── mint ────────────────────────────────────────────────────────────────

    function test_mint_updatesBalanceAndSupply() public {
        vm.prank(admin);
        token.mint(alice, 100 ether);

        assertEq(token.totalSupply(), 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
    }

    function test_mint_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(token));
        emit PropertyTokensMinted(PROPERTY_ID, alice, 100 ether);
        token.mint(alice, 100 ether);
    }

    function test_mint_upToMaxSupply() public {
        vm.prank(admin);
        token.mint(alice, MAX_SUPPLY);
        assertEq(token.totalSupply(), MAX_SUPPLY);
    }

    function test_mint_multipleRecipients() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 600 ether);
        token.mint(bob,   400 ether);
        vm.stopPrank();

        assertEq(token.totalSupply(), MAX_SUPPLY);
        assertEq(token.balanceOf(alice), 600 ether);
        assertEq(token.balanceOf(bob),   400 ether);
    }

    function test_revert_mint_exceedsMaxSupply() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyToken__ExceedsMaxSupply.selector, PROPERTY_ID, MAX_SUPPLY + 1, MAX_SUPPLY)
        );
        token.mint(alice, MAX_SUPPLY + 1);
    }

    function test_revert_mint_zeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(PropertyToken__ZeroAmount.selector);
        token.mint(alice, 0);
    }

    function test_revert_mint_zeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(PropertyToken__ZeroAddress.selector);
        token.mint(address(0), 100 ether);
    }

    function test_revert_mint_nonMinter() public {
        bytes32 role = token.MINTER_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                role
            )
        );
        token.mint(alice, 100 ether);
    }

    // ─── burn ────────────────────────────────────────────────────────────────

    function test_burn_reducesBalanceAndSupply() public {
        vm.startPrank(admin);
        token.mint(alice, 100 ether);
        token.burn(alice, 40 ether);
        vm.stopPrank();

        assertEq(token.totalSupply(), 60 ether);
        assertEq(token.balanceOf(alice), 60 ether);
    }

    function test_burn_emitsEvent() public {
        vm.prank(admin);
        token.mint(alice, 100 ether);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(token));
        emit PropertyTokensBurned(PROPERTY_ID, alice, 40 ether);
        token.burn(alice, 40 ether);
    }

    function test_revert_burn_zeroAmount() public {
        vm.prank(admin);
        token.mint(alice, 100 ether);

        vm.prank(admin);
        vm.expectRevert(PropertyToken__ZeroAmount.selector);
        token.burn(alice, 0);
    }

    // ─── propertyId / maxSupply ──────────────────────────────────────────────

    function test_propertyId_returnsCorrectId() public view {
        assertEq(token.propertyId(), PROPERTY_ID);
    }

    function test_maxSupply_returnsCorrectMax() public view {
        assertEq(token.maxSupply(), MAX_SUPPLY);
    }

    // ─── forcedTransfer ──────────────────────────────────────────────────────

    function test_forcedTransfer_movesFundsWithoutKYC() public {
        // bob is NOT KYC-verified; forcedTransfer should still work
        vm.startPrank(admin);
        token.mint(alice, 100 ether);
        token.forcedTransfer(alice, bob, 30 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 70 ether);
        assertEq(token.balanceOf(bob),   30 ether);
    }

    function test_forcedTransfer_emitsEvent() public {
        vm.startPrank(admin);
        token.mint(alice, 100 ether);
        vm.expectEmit(true, true, false, true, address(token));
        emit ForcedTransfer(alice, bob, 30 ether, PROPERTY_ID);
        token.forcedTransfer(alice, bob, 30 ether);
        vm.stopPrank();
    }

    // ─── canTransfer ─────────────────────────────────────────────────────────

    function test_canTransfer_returnsTrueForVerifiedAccounts() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 100 ether);
        vm.stopPrank();

        (bool ok, string memory reason) = token.canTransfer(alice, bob, 50 ether);
        assertTrue(ok);
        assertEq(bytes(reason).length, 0);
    }

    function test_canTransfer_returnsFalseForUnverifiedRecipient() public {
        vm.prank(admin);
        token.mint(alice, 100 ether);

        (bool ok, string memory reason) = token.canTransfer(alice, bob, 50 ether);
        assertFalse(ok);
        assertGt(bytes(reason).length, 0);
    }

    function test_canTransfer_returnsFalseWhenPaused() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 100 ether);
        token.pause();
        vm.stopPrank();

        (bool ok,) = token.canTransfer(alice, bob, 50 ether);
        assertFalse(ok);
    }

    // ─── KYC transfer guard ──────────────────────────────────────────────────

    function test_transfer_toKYCVerifiedAddress() public {
        vm.prank(admin);
        kyc.verify(bob, 840, 2, 0);

        vm.prank(admin);
        token.mint(alice, 100 ether);

        vm.prank(alice);
        token.transfer(bob, 30 ether);

        assertEq(token.balanceOf(alice), 70 ether);
        assertEq(token.balanceOf(bob),   30 ether);
    }

    function test_revert_transfer_toNonKYCAddress() public {
        vm.prank(admin);
        token.mint(alice, 100 ether);

        // bob is not KYC verified
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__NotVerified.selector, bob));
        token.transfer(bob, 10 ether);
    }

    function test_transfer_blockedAfterKYCRevoked() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 100 ether);
        kyc.revoke(bob);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__NotVerified.selector, bob));
        token.transfer(bob, 10 ether);
    }

    function test_mint_skipKYCCheck_toNonVerifiedAddress() public {
        // Minting to admin (not KYC verified) should work — mint bypasses KYC guard
        vm.prank(admin);
        token.mint(admin, 100 ether);
        assertEq(token.balanceOf(admin), 100 ether);
    }

    // ─── pause / unpause ─────────────────────────────────────────────────────

    function test_pause_blocksTransfers() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 100 ether);
        token.pause();
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 10 ether);
    }

    function test_unpause_resumesTransfers() public {
        vm.startPrank(admin);
        kyc.verify(bob, 840, 2, 0);
        token.mint(alice, 100 ether);
        token.pause();
        token.unpause();
        vm.stopPrank();

        vm.prank(alice);
        token.transfer(bob, 10 ether);
        assertEq(token.balanceOf(bob), 10 ether);
    }
}

