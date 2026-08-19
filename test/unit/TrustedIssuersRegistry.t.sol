// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TrustedIssuersRegistry} from "../../src/compliance/TrustedIssuersRegistry.sol";
import {
    TrustedIssuersRegistry__IssuerAlreadyTrusted,
    TrustedIssuersRegistry__IssuerNotFound,
    TrustedIssuersRegistry__ZeroAddress,
    TrustedIssuersRegistry__EmptyClaimTopics
} from "../../src/utils/Errors.sol";
import {
    TrustedIssuerAdded,
    TrustedIssuerRemoved,
    TrustedIssuerTopicsUpdated
} from "../../src/utils/Events.sol";

contract TrustedIssuersRegistryTest is Test {
    TrustedIssuersRegistry internal reg;

    address internal admin  = makeAddr("admin");
    address internal owner  = makeAddr("owner");
    address internal issuerA = makeAddr("issuerA");
    address internal issuerB = makeAddr("issuerB");

    uint256[] internal topics12;
    uint256[] internal topics3;

    function setUp() public {
        topics12 = new uint256[](2);
        topics12[0] = 1; // KYC
        topics12[1] = 2; // AML

        topics3 = new uint256[](1);
        topics3[0] = 3; // AccreditedInvestor

        vm.startPrank(admin);
        reg = new TrustedIssuersRegistry(admin);
        reg.grantRole(reg.REGISTRY_OWNER_ROLE(), owner);
        vm.stopPrank();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_revert_zeroAdmin() public {
        vm.expectRevert(TrustedIssuersRegistry__ZeroAddress.selector);
        new TrustedIssuersRegistry(address(0));
    }

    // ─── addTrustedIssuer ────────────────────────────────────────────────────

    function test_addTrustedIssuer_marksAsTrusted() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);
        assertTrue(reg.isTrustedIssuer(issuerA));
    }

    function test_addTrustedIssuer_storesTopics() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);
        uint256[] memory stored = reg.getIssuerTopics(issuerA);
        assertEq(stored.length, 2);
        assertEq(stored[0], 1);
        assertEq(stored[1], 2);
    }

    function test_addTrustedIssuer_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(reg));
        emit TrustedIssuerAdded(issuerA, topics12);
        reg.addTrustedIssuer(issuerA, topics12);
    }

    function test_addTrustedIssuer_revert_alreadyTrusted() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TrustedIssuersRegistry__IssuerAlreadyTrusted.selector, issuerA));
        reg.addTrustedIssuer(issuerA, topics12);
    }

    function test_addTrustedIssuer_revert_zeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(TrustedIssuersRegistry__ZeroAddress.selector);
        reg.addTrustedIssuer(address(0), topics12);
    }

    function test_addTrustedIssuer_revert_emptyTopics() public {
        vm.prank(owner);
        vm.expectRevert(TrustedIssuersRegistry__EmptyClaimTopics.selector);
        reg.addTrustedIssuer(issuerA, new uint256[](0));
    }

    function test_addTrustedIssuer_revert_noRole() public {
        bytes32 role = reg.REGISTRY_OWNER_ROLE();
        address eve  = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, eve, role)
        );
        reg.addTrustedIssuer(issuerA, topics12);
    }

    // ─── removeTrustedIssuer ─────────────────────────────────────────────────

    function test_removeTrustedIssuer_clearsMapping() public {
        vm.startPrank(owner);
        reg.addTrustedIssuer(issuerA, topics12);
        reg.removeTrustedIssuer(issuerA);
        vm.stopPrank();

        assertFalse(reg.isTrustedIssuer(issuerA));
        assertEq(reg.getIssuerTopics(issuerA).length, 0);
    }

    function test_removeTrustedIssuer_emitsEvent() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(reg));
        emit TrustedIssuerRemoved(issuerA);
        reg.removeTrustedIssuer(issuerA);
    }

    function test_removeTrustedIssuer_revert_notFound() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TrustedIssuersRegistry__IssuerNotFound.selector, issuerA));
        reg.removeTrustedIssuer(issuerA);
    }

    // ─── updateIssuerTopics ──────────────────────────────────────────────────

    function test_updateIssuerTopics_replacesTopics() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);

        vm.prank(owner);
        reg.updateIssuerTopics(issuerA, topics3);

        uint256[] memory stored = reg.getIssuerTopics(issuerA);
        assertEq(stored.length, 1);
        assertEq(stored[0], 3);
    }

    function test_updateIssuerTopics_emitsEvent() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(reg));
        emit TrustedIssuerTopicsUpdated(issuerA, topics3);
        reg.updateIssuerTopics(issuerA, topics3);
    }

    function test_updateIssuerTopics_revert_notFound() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TrustedIssuersRegistry__IssuerNotFound.selector, issuerA));
        reg.updateIssuerTopics(issuerA, topics3);
    }

    function test_updateIssuerTopics_revert_emptyTopics() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);

        vm.prank(owner);
        vm.expectRevert(TrustedIssuersRegistry__EmptyClaimTopics.selector);
        reg.updateIssuerTopics(issuerA, new uint256[](0));
    }

    // ─── hasClaimTopic ───────────────────────────────────────────────────────

    function test_hasClaimTopic_trueForRegisteredTopic() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);
        assertTrue(reg.hasClaimTopic(issuerA, 1));
        assertTrue(reg.hasClaimTopic(issuerA, 2));
    }

    function test_hasClaimTopic_falseForMissingTopic() public {
        vm.prank(owner);
        reg.addTrustedIssuer(issuerA, topics12);
        assertFalse(reg.hasClaimTopic(issuerA, 3));
    }

    function test_hasClaimTopic_falseForUntrustedIssuer() public view {
        assertFalse(reg.hasClaimTopic(issuerB, 1));
    }
}
