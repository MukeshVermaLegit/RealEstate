// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {RentDistributor} from "../../src/core/RentDistributor.sol";
import {PropertyRegistry} from "../../src/core/PropertyRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MockVotesToken} from "../helpers/MockVotesToken.sol";
import {
    RentDistributor__NotPropertyOwner,
    RentDistributor__NoPeriodFound,
    RentDistributor__AlreadyClaimed,
    RentDistributor__ZeroRent,
    RentDistributor__InvalidProof,
    RentDistributor__ReclaimTooEarly,
    RentDistributor__ExceedsTotalRent,
    RentDistributor__ArrayLengthMismatch,
    RentDistributor__InvalidSnapshotBlock,
    RentDistributor__ExceedsEntitlement,
    RentDistributor__NothingToReclaim,
    RentDistributor__ZeroMerkleRoot,
    RentDistributor__NoTokenForProperty,
    RentDistributor__EmptySnapshot,
    RentDistributor__PeriodReclaimed
} from "../../src/utils/Errors.sol";
import {RentDeposited, RentClaimed, UnclaimedRentReclaimed} from "../../src/utils/Events.sol";

/// @dev Tests for the Merkle-proof-based RentDistributor.
///
///      Tree layout (4 leaves, balanced):
///
///                       root
///                    /        \
///                h01            h23
///              /     \        /     \
///          leafA    leafB  leafC  leafD
///
///      leaf = keccak256(abi.encodePacked(investor, amount))
///      hXY  = commutativeKeccak256(leafX, leafY)
contract RentDistributorTest is Test {
    PropertyRegistry internal registry;
    KYCRegistry internal kyc;
    MockERC20 internal usdc;
    RentDistributor internal distributor;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    uint256 internal propertyId;

    // Per-period amounts (sum = TOTAL_RENT)
    uint256 internal constant ALICE_AMOUNT = 600e18;
    uint256 internal constant BOB_AMOUNT = 400e18;
    uint256 internal constant CAROL_AMOUNT = 200e18;
    uint256 internal constant DAVE_AMOUNT = 200e18;
    uint256 internal constant TOTAL_RENT = 1_400e18;

    /// @dev Votes token backing the entitlement cap, with balances proportional to the
    ///      Merkle allocations below, plus the past block the cap is evaluated at.
    MockVotesToken internal propToken;
    uint256 internal snapshotBlock;

    // Merkle tree state computed in setUp
    bytes32 internal merkleRoot;
    bytes32[] internal proofAlice;
    bytes32[] internal proofBob;
    bytes32[] internal proofCarol;
    bytes32[] internal proofDave;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// @dev Mirrors OZ Hashes.commutativeKeccak256: sorts then hashes.
    function _h(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _leaf(address investor, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(investor, amount));
    }

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        // ── Deploy infrastructure ────────────────────────────────────────────
        vm.startPrank(admin);

        PropertyRegistry registryImpl = new PropertyRegistry();
        registry = PropertyRegistry(
            address(new ERC1967Proxy(address(registryImpl), abi.encodeCall(PropertyRegistry.initialize, (admin))))
        );

        KYCRegistry kycImpl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(address(kycImpl), abi.encodeCall(KYCRegistry.initialize, (admin)))));

        usdc = new MockERC20("Mock USDC", "USDC");

        RentDistributor distributorImpl = new RentDistributor();
        distributor = RentDistributor(
            address(
                new ERC1967Proxy(
                    address(distributorImpl),
                    abi.encodeCall(RentDistributor.initialize, (admin, address(registry), address(usdc)))
                )
            )
        );

        propertyId = registry.registerProperty("ipfs://QmRent", 1_000 ether, 10e18, address(0), bytes32(0), 0);

        usdc.mint(admin, 100_000e18);
        usdc.approve(address(distributor), type(uint256).max);

        vm.stopPrank();

        // ── Build Merkle tree ────────────────────────────────────────────────
        bytes32 lA = _leaf(alice, ALICE_AMOUNT);
        bytes32 lB = _leaf(bob, BOB_AMOUNT);
        bytes32 lC = _leaf(carol, CAROL_AMOUNT);
        bytes32 lD = _leaf(dave, DAVE_AMOUNT);

        bytes32 h01 = _h(lA, lB);
        bytes32 h23 = _h(lC, lD);
        merkleRoot = _h(h01, h23);

        proofAlice = new bytes32[](2);
        proofAlice[0] = lB;
        proofAlice[1] = h23;

        proofBob = new bytes32[](2);
        proofBob[0] = lA;
        proofBob[1] = h23;

        proofCarol = new bytes32[](2);
        proofCarol[0] = lD;
        proofCarol[1] = h01;

        proofDave = new bytes32[](2);
        proofDave[0] = lC;
        proofDave[1] = h01;

        // ── Votes token for the entitlement cap ──────────────────────────────
        // depositRent now REQUIRES a non-zero snapshot resolving to a non-empty
        // checkpoint, so every period needs a registered token behind it.
        // Balances mirror the Merkle allocations exactly (600/400/200/200 of 1400),
        // so each investor's cap equals their allocation on a TOTAL_RENT deposit.
        vm.startPrank(admin);
        propToken = new MockVotesToken("PropToken", "PT");
        propToken.mint(alice, 600 ether);
        propToken.mint(bob, 400 ether);
        propToken.mint(carol, 200 ether);
        propToken.mint(dave, 200 ether);
        registry.setTokenAddress(propertyId, address(propToken));
        vm.stopPrank();

        vm.prank(alice);
        propToken.delegate(alice);
        vm.prank(bob);
        propToken.delegate(bob);
        vm.prank(carol);
        propToken.delegate(carol);
        vm.prank(dave);
        propToken.delegate(dave);

        vm.roll(block.number + 1);
        snapshotBlock = block.number - 1;
    }

    // ─── depositRent ─────────────────────────────────────────────────────────

    function test_depositRent_returnsPeriodId() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        assertEq(periodId, 1);
    }

    function test_depositRent_incrementsPeriodId() public {
        vm.startPrank(admin);
        uint256 p1 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        uint256 p2 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        vm.stopPrank();
        assertEq(p1, 1);
        assertEq(p2, 2);
    }

    function test_depositRent_transfersUSDCToDistributor() public {
        uint256 adminBefore = usdc.balanceOf(admin);
        vm.prank(admin);
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        assertEq(usdc.balanceOf(admin), adminBefore - TOTAL_RENT);
        assertEq(usdc.balanceOf(address(distributor)), TOTAL_RENT);
    }

    function test_depositRent_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(distributor));
        emit RentDeposited(propertyId, 1, TOTAL_RENT, merkleRoot);
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
    }

    function test_revert_depositRent_zeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(RentDistributor__ZeroRent.selector);
        distributor.depositRent(propertyId, 0, merkleRoot, snapshotBlock);
    }

    function test_revert_depositRent_notPropertyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__NotPropertyOwner.selector, propertyId));
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
    }

    // ─── claimRent ───────────────────────────────────────────────────────────

    function test_claimRent_alice_receivesCorrectAmount() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);

        assertEq(usdc.balanceOf(alice), aliceBefore + ALICE_AMOUNT);
    }

    function test_claimRent_bob_receivesCorrectAmount() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.prank(bob);
        distributor.claimRent(propertyId, periodId, BOB_AMOUNT, proofBob);

        assertEq(usdc.balanceOf(bob), BOB_AMOUNT);
    }

    function test_claimRent_emitsEvent() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(distributor));
        emit RentClaimed(propertyId, periodId, alice, ALICE_AMOUNT);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);
    }

    function test_claimRent_allFourInvestors_fullDistribution() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);
        vm.prank(bob);
        distributor.claimRent(propertyId, periodId, BOB_AMOUNT, proofBob);
        vm.prank(carol);
        distributor.claimRent(propertyId, periodId, CAROL_AMOUNT, proofCarol);
        vm.prank(dave);
        distributor.claimRent(propertyId, periodId, DAVE_AMOUNT, proofDave);

        // All funds distributed; none left in distributor
        assertEq(usdc.balanceOf(address(distributor)), 0);
        assertEq(usdc.balanceOf(alice), ALICE_AMOUNT);
        assertEq(usdc.balanceOf(bob), BOB_AMOUNT);
        assertEq(usdc.balanceOf(carol), CAROL_AMOUNT);
        assertEq(usdc.balanceOf(dave), DAVE_AMOUNT);
    }

    function test_revert_claimRent_invalidProof() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        // Give alice bob's proof — should fail
        vm.prank(alice);
        vm.expectRevert(RentDistributor__InvalidProof.selector);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofBob);
    }

    function test_revert_claimRent_wrongAmount() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        // Alice tries to claim more than allocated
        vm.prank(alice);
        vm.expectRevert(RentDistributor__InvalidProof.selector);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT + 1, proofAlice);
    }

    function test_revert_claimRent_doubleClaim() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__AlreadyClaimed.selector, propertyId, periodId, alice));
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);
    }

    function test_revert_claimRent_noPeriod() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__NoPeriodFound.selector, propertyId, 99));
        distributor.claimRent(propertyId, 99, ALICE_AMOUNT, proofAlice);
    }

    // ─── claimMultiple ───────────────────────────────────────────────────────

    function test_claimMultiple_twoPeriodsInOneTx() public {
        vm.startPrank(admin);
        uint256 p1 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        uint256 p2 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        vm.stopPrank();

        uint256[] memory propIds = new uint256[](2);
        uint256[] memory periodIds = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        bytes32[][] memory proofs = new bytes32[][](2);

        propIds[0] = propertyId;
        propIds[1] = propertyId;
        periodIds[0] = p1;
        periodIds[1] = p2;
        amounts[0] = ALICE_AMOUNT;
        amounts[1] = ALICE_AMOUNT;
        proofs[0] = proofAlice;
        proofs[1] = proofAlice;

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        distributor.claimMultiple(propIds, periodIds, amounts, proofs);

        assertEq(usdc.balanceOf(alice), aliceBefore + ALICE_AMOUNT * 2);
    }

    function test_revert_claimMultiple_arrayLengthMismatch() public {
        vm.prank(admin);
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        uint256[] memory propIds = new uint256[](2);
        uint256[] memory periodIds = new uint256[](1); // wrong length
        uint256[] memory amounts = new uint256[](2);
        bytes32[][] memory proofs = new bytes32[][](2);

        vm.prank(alice);
        vm.expectRevert(RentDistributor__ArrayLengthMismatch.selector);
        distributor.claimMultiple(propIds, periodIds, amounts, proofs);
    }

    // ─── reclaimUnclaimed ────────────────────────────────────────────────────

    function test_reclaimUnclaimed_afterDeadline() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        // Only alice claims her share
        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);

        // Warp past 90-day reclaim deadline
        vm.warp(block.timestamp + 91 days);

        uint256 adminBefore = usdc.balanceOf(admin);
        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(distributor));
        emit UnclaimedRentReclaimed(propertyId, periodId, TOTAL_RENT - ALICE_AMOUNT);
        distributor.reclaimUnclaimed(propertyId, periodId);

        // Admin (depositor) receives the unclaimed portion
        assertEq(usdc.balanceOf(admin), adminBefore + TOTAL_RENT - ALICE_AMOUNT);
        assertEq(usdc.balanceOf(address(distributor)), 0);
    }

    function test_revert_reclaimUnclaimed_tooEarly() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        uint256 deadline = block.timestamp + 90 days;
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(RentDistributor__ReclaimTooEarly.selector, propertyId, periodId, deadline)
        );
        distributor.reclaimUnclaimed(propertyId, periodId);
    }

    function test_revert_reclaimUnclaimed_notAdmin() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.warp(block.timestamp + 91 days);
        vm.prank(alice);
        vm.expectRevert();
        distributor.reclaimUnclaimed(propertyId, periodId);
    }

    function test_revert_reclaimUnclaimed_nothingLeftAfterFullDistribution() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        // All investors claim
        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);
        vm.prank(bob);
        distributor.claimRent(propertyId, periodId, BOB_AMOUNT, proofBob);
        vm.prank(carol);
        distributor.claimRent(propertyId, periodId, CAROL_AMOUNT, proofCarol);
        vm.prank(dave);
        distributor.claimRent(propertyId, periodId, DAVE_AMOUNT, proofDave);

        vm.warp(block.timestamp + 91 days);

        // Nothing left to sweep — reverts rather than emitting a misleading zero-value event.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__NothingToReclaim.selector, propertyId, periodId));
        distributor.reclaimUnclaimed(propertyId, periodId);
    }

    function test_revert_reclaimUnclaimed_twice() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.warp(block.timestamp + 91 days);
        vm.prank(admin);
        distributor.reclaimUnclaimed(propertyId, periodId);

        // Second sweep is rejected outright — previously it silently transferred 0.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__PeriodReclaimed.selector, propertyId, periodId));
        distributor.reclaimUnclaimed(propertyId, periodId);
    }

    function test_revert_claimRent_afterReclaim() public {
        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);

        vm.warp(block.timestamp + 91 days);
        vm.prank(admin);
        distributor.reclaimUnclaimed(propertyId, periodId);

        // A late claimant gets an explicit "swept" error, not an opaque over-cap failure.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__PeriodReclaimed.selector, propertyId, periodId));
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofAlice);
    }

    // ─── Upgrade ─────────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        vm.prank(admin);
        uint256 p1 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        assertEq(p1, 1);

        vm.prank(admin);
        RentDistributor newImpl = new RentDistributor();
        vm.prank(admin);
        distributor.upgradeToAndCall(address(newImpl), "");

        // Period state persisted — second deposit gets periodId = 2
        vm.prank(admin);
        uint256 p2 = distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, snapshotBlock);
        assertEq(p2, 2);

        // Alice can still claim from period 1 after upgrade
        vm.prank(alice);
        distributor.claimRent(propertyId, p1, ALICE_AMOUNT, proofAlice);
        assertEq(usdc.balanceOf(alice), ALICE_AMOUNT);
    }

    function test_revert_upgrade_notAdmin() public {
        vm.prank(alice);
        RentDistributor newImpl = new RentDistributor();
        vm.prank(alice);
        vm.expectRevert();
        distributor.upgradeToAndCall(address(newImpl), "");
    }

    // ─── Snapshot enforcement ──────────────────────────────────────────────────────

    /// @dev Deploy a MockVotesToken registered in PropertyRegistry, mint proportional
    ///      balances to investors, self-delegate so getPastVotes returns non-zero,
    ///      then deposit rent with a snapshot block and verify claims are bounded.
    function test_snapshotEnforcement_allowsExactEntitlement() public {
        // ── Setup: deploy a votes token and register it ──
        vm.startPrank(admin);
        MockVotesToken vToken = new MockVotesToken("PropToken", "PT");

        // Mint proportional balances (total = 1000 units)
        // alice=600, bob=400 → entitlements on TOTAL_RENT match ALICE_AMOUNT/BOB_AMOUNT
        vToken.mint(alice, 600 ether);
        vToken.mint(bob, 400 ether);

        // Register token address in registry
        registry.setTokenAddress(propertyId, address(vToken));
        vm.stopPrank();

        // Investors self-delegate so getPastVotes checkpoints are written
        vm.prank(alice);
        vToken.delegate(alice);
        vm.prank(bob);
        vToken.delegate(bob);

        // Advance one block so snapshot is in the past
        vm.roll(block.number + 1);
        uint256 snap = block.number - 1;

        // Build a 2-leaf Merkle tree for alice + bob only
        bytes32 lA2 = _leaf(alice, ALICE_AMOUNT);
        bytes32 lB2 = _leaf(bob, BOB_AMOUNT);
        bytes32 root2 = _h(lA2, lB2);
        bytes32[] memory proofA2 = new bytes32[](1);
        proofA2[0] = lB2;
        bytes32[] memory proofB2 = new bytes32[](1);
        proofB2[0] = lA2;

        // Deposit rent with snapshot
        uint256 rentAmount = ALICE_AMOUNT + BOB_AMOUNT; // 1000e18
        vm.startPrank(admin);
        usdc.approve(address(distributor), type(uint256).max);
        uint256 periodId = distributor.depositRent(propertyId, rentAmount, root2, snap);
        vm.stopPrank();

        // Alice claims her exact proportional share — should succeed
        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofA2);
        assertEq(usdc.balanceOf(alice), ALICE_AMOUNT);

        // Bob claims his exact proportional share — should succeed
        vm.prank(bob);
        distributor.claimRent(propertyId, periodId, BOB_AMOUNT, proofB2);
        assertEq(usdc.balanceOf(bob), BOB_AMOUNT);
    }

    function test_revert_snapshotEnforcement_exceedsEntitlement() public {
        // Setup: deploy votes token, alice holds 100/1000 = 10% of supply
        vm.startPrank(admin);
        MockVotesToken vToken = new MockVotesToken("PropToken", "PT");
        vToken.mint(alice, 100 ether);
        vToken.mint(bob, 900 ether);
        registry.setTokenAddress(propertyId, address(vToken));
        vm.stopPrank();

        vm.prank(alice);
        vToken.delegate(alice);
        vm.prank(bob);
        vToken.delegate(bob);

        vm.roll(block.number + 1);
        uint256 snap = block.number - 1;

        // Build tree where alice is dishonestly allocated 600e18 (60%) instead of 10%
        bytes32 lA = _leaf(alice, ALICE_AMOUNT); // 600e18
        bytes32 lB = _leaf(bob, BOB_AMOUNT); // 400e18
        bytes32 root2 = _h(lA, lB);
        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lB;

        uint256 rentAmount = ALICE_AMOUNT + BOB_AMOUNT;
        vm.startPrank(admin);
        usdc.approve(address(distributor), type(uint256).max);
        uint256 periodId = distributor.depositRent(propertyId, rentAmount, root2, snap);
        vm.stopPrank();

        // alice's on-chain entitlement = 100/1000 * 1000e18 = 100e18
        uint256 maxEntitlement = 100e18;
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentDistributor__ExceedsEntitlement.selector, propertyId, periodId, alice, ALICE_AMOUNT, maxEntitlement
            )
        );
        distributor.claimRent(propertyId, periodId, ALICE_AMOUNT, proofA);
    }

    function test_revert_depositRent_snapshotNotInPast() public {
        // snapshotBlock == block.number should revert (must be strictly in the past)
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__InvalidSnapshotBlock.selector, block.number));
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, block.number);
    }

    /// @dev Previously a depositor could point at a property with no registered token and
    ///      the entitlement cap would silently evaluate to "no limit". Now rejected up front.
    function test_revert_depositRent_noTokenRegistered() public {
        vm.startPrank(admin);
        uint256 bare = registry.registerProperty("ipfs://QmBare", 1_000 ether, 10e18, address(0), bytes32(0), 0);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__NoTokenForProperty.selector, bare));
        distributor.depositRent(bare, TOTAL_RENT, merkleRoot, snapshotBlock);
        vm.stopPrank();
    }

    /// @dev Likewise a snapshot predating the token's first checkpoint used to disable the cap.
    function test_revert_depositRent_emptySnapshot() public {
        vm.startPrank(admin);
        MockVotesToken fresh = new MockVotesToken("Fresh", "FR");
        uint256 pid = registry.registerProperty("ipfs://QmFresh", 1_000 ether, 10e18, address(0), bytes32(0), 0);
        registry.setTokenAddress(pid, address(fresh));
        vm.stopPrank();

        // Snapshot a block before `fresh` had any supply → no checkpoint → rejected.
        vm.roll(block.number + 1);
        uint256 emptySnap = block.number - 1;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__EmptySnapshot.selector, emptySnap));
        distributor.depositRent(pid, TOTAL_RENT, merkleRoot, emptySnap);
    }

    function test_revert_depositRent_zeroSnapshotBlock() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor__InvalidSnapshotBlock.selector, uint256(0)));
        distributor.depositRent(propertyId, TOTAL_RENT, merkleRoot, 0);
    }

    function test_revert_depositRent_zeroMerkleRoot() public {
        vm.prank(admin);
        vm.expectRevert(RentDistributor__ZeroMerkleRoot.selector);
        distributor.depositRent(propertyId, TOTAL_RENT, bytes32(0), snapshotBlock);
    }

    /// @dev The cap rounds UP so an allocator distributing truncation dust one wei at a time
    ///      (largest-remainder) stays inside every holder's cap. With a rent amount that does
    ///      not divide evenly, alice's exact floor share + 1 wei must still be claimable.
    function test_snapshotEnforcement_ceilingAbsorbsAllocatorDust() public {
        uint256 rent = 1_000e18 + 2; // chosen so the pro-rata split does NOT divide evenly

        uint256 numerator = 600 ether * rent;
        uint256 floorShare = numerator / 1400 ether;
        // Guard the premise: with an exact division there would be no dust to absorb
        // and this test would silently stop exercising the ceiling.
        assertTrue(numerator % 1400 ether != 0, "rent must not divide evenly");

        uint256 dusted = floorShare + 1; // allocator hands alice one wei of the remainder

        bytes32 lA = _leaf(alice, dusted);
        bytes32 lB = _leaf(bob, 1);
        bytes32 root2 = _h(lA, lB);
        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lB;

        vm.prank(admin);
        uint256 periodId = distributor.depositRent(propertyId, rent, root2, snapshotBlock);

        vm.prank(alice);
        distributor.claimRent(propertyId, periodId, dusted, proofA);
        assertEq(usdc.balanceOf(alice), dusted);
    }
}

