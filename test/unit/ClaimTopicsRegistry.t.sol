// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ClaimTopicsRegistry} from "../../src/compliance/ClaimTopicsRegistry.sol";
import {ClaimTopicsRegistry__TopicAlreadyExists, ClaimTopicsRegistry__TopicNotFound} from "../../src/utils/Errors.sol";
import {ClaimTopicAdded, ClaimTopicRemoved} from "../../src/utils/Events.sol";

contract ClaimTopicsRegistryTest is Test {
    ClaimTopicsRegistry internal ctr;

    address internal admin = makeAddr("admin");
    address internal owner = makeAddr("owner");

    function setUp() public {
        vm.startPrank(admin);
        ctr = new ClaimTopicsRegistry(admin);
        ctr.grantRole(ctr.TOPICS_OWNER_ROLE(), owner);
        vm.stopPrank();
    }

    // ─── addClaimTopic ───────────────────────────────────────────────────────

    function test_addClaimTopic_appearsInList() public {
        vm.prank(owner);
        ctr.addClaimTopic(1);
        uint256[] memory topics = ctr.getClaimTopics();
        assertEq(topics.length, 1);
        assertEq(topics[0], 1);
    }

    function test_addClaimTopic_multiple() public {
        vm.startPrank(owner);
        ctr.addClaimTopic(1);
        ctr.addClaimTopic(2);
        ctr.addClaimTopic(3);
        vm.stopPrank();
        assertEq(ctr.getClaimTopics().length, 3);
    }

    function test_addClaimTopic_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(ctr));
        emit ClaimTopicAdded(1);
        ctr.addClaimTopic(1);
    }

    function test_addClaimTopic_revert_duplicate() public {
        vm.prank(owner);
        ctr.addClaimTopic(1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ClaimTopicsRegistry__TopicAlreadyExists.selector, uint256(1)));
        ctr.addClaimTopic(1);
    }

    function test_addClaimTopic_revert_noRole() public {
        bytes32 role = ctr.TOPICS_OWNER_ROLE();
        address eve = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, eve, role));
        ctr.addClaimTopic(1);
    }

    // ─── removeClaimTopic ────────────────────────────────────────────────────

    function test_removeClaimTopic_removesFromList() public {
        vm.startPrank(owner);
        ctr.addClaimTopic(1);
        ctr.addClaimTopic(2);
        ctr.removeClaimTopic(1);
        vm.stopPrank();

        uint256[] memory topics = ctr.getClaimTopics();
        assertEq(topics.length, 1);
        assertEq(topics[0], 2);
    }

    function test_removeClaimTopic_swapAndPop() public {
        vm.startPrank(owner);
        ctr.addClaimTopic(1);
        ctr.addClaimTopic(2);
        ctr.addClaimTopic(3);
        ctr.removeClaimTopic(1); // removes first element; last is swapped in
        vm.stopPrank();

        uint256[] memory topics = ctr.getClaimTopics();
        assertEq(topics.length, 2);
        // 1 must not appear; 2 and 3 must be present
        bool found1 = false;
        bool found2 = false;
        bool found3 = false;
        for (uint256 i = 0; i < topics.length; ++i) {
            if (topics[i] == 1) found1 = true;
            if (topics[i] == 2) found2 = true;
            if (topics[i] == 3) found3 = true;
        }
        assertFalse(found1);
        assertTrue(found2);
        assertTrue(found3);
    }

    function test_removeClaimTopic_allowsReAdd() public {
        vm.startPrank(owner);
        ctr.addClaimTopic(1);
        ctr.removeClaimTopic(1);
        ctr.addClaimTopic(1);
        vm.stopPrank();
        assertEq(ctr.getClaimTopics().length, 1);
    }

    function test_removeClaimTopic_emitsEvent() public {
        vm.prank(owner);
        ctr.addClaimTopic(1);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(ctr));
        emit ClaimTopicRemoved(1);
        ctr.removeClaimTopic(1);
    }

    function test_removeClaimTopic_revert_notFound() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ClaimTopicsRegistry__TopicNotFound.selector, uint256(99)));
        ctr.removeClaimTopic(99);
    }

    // ─── getClaimTopics ──────────────────────────────────────────────────────

    function test_getClaimTopics_emptyByDefault() public view {
        assertEq(ctr.getClaimTopics().length, 0);
    }
}
