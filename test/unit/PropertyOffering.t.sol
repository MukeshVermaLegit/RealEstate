// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {PropertyOffering} from "../../src/core/PropertyOffering.sol";
import {PropertyRegistry}  from "../../src/core/PropertyRegistry.sol";
import {PropertyToken}     from "../../src/core/PropertyToken.sol";
import {KYCRegistry}       from "../../src/compliance/KYCRegistry.sol";
import {MockERC20}         from "../helpers/MockERC20.sol";
import {Types}             from "../../src/utils/Types.sol";
import {
    PropertyOffering__HardCapReached,
    PropertyOffering__OfferingNotActive,
    PropertyOffering__SoftCapNotReached,
    PropertyOffering__AlreadyFinalized,
    PropertyOffering__NotCancelled,
    PropertyOffering__NotFinalized,
    PropertyOffering__AlreadyCancelled,
    PropertyOffering__NothingToClaim,
    PropertyOffering__TokensAlreadyClaimed,
    PropertyOffering__OfferingNotEnded,
    PropertyOffering__SoftCapAlreadyReached,
    PropertyOffering__ZeroAmount,
    PropertyOffering__InvalidCaps,
    PropertyOffering__InvalidTimeWindow,
    PropertyOffering__HardCapExceedsMaxSupply,
    PropertyToken__TransferLocked
} from "../../src/utils/Errors.sol";
import {KYCRegistry__NotVerified} from "../../src/utils/Errors.sol";
import {
    InvestmentMade,
    OfferingFinalized,
    OfferingCancelled,
    InvestorRefunded,
    OfferingTokensClaimed
} from "../../src/utils/Events.sol";

contract PropertyOfferingTest is Test {
    // ─── Contracts ───────────────────────────────────────────────────────────

    KYCRegistry      internal kyc;
    PropertyRegistry internal registry;
    PropertyToken    internal propToken;
    MockERC20        internal payToken;
    PropertyOffering internal offering;

    // ─── Actors ──────────────────────────────────────────────────────────────

    address internal admin    = makeAddr("admin");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal charlie  = makeAddr("charlie"); // not KYC verified

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 internal constant PROPERTY_ID    = 1;
    uint256 internal constant MAX_SUPPLY     = 10_000 ether;  // 10 000 property tokens
    uint256 internal constant PRICE_PER_TOKEN = 100e18;       // 100 pay-tokens per property token
    uint256 internal constant HARD_CAP        = 1_000 ether;  // 1 000 property tokens
    uint256 internal constant SOFT_CAP        = 100 ether;    // 100 property tokens
    uint256 internal constant LOCKUP_DURATION = 30 days;

    uint256 internal startTime;
    uint256 internal endTime;

    string  internal constant URI    = "ipfs://QmTest";
    uint256 internal constant SUPPLY = 10_000 ether;
    uint256 internal constant PRICE  = 1e18;

    // ─── setUp ───────────────────────────────────────────────────────────────

    function setUp() public {
        // 1. KYCRegistry via proxy
        KYCRegistry kycImpl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(
            address(kycImpl),
            abi.encodeCall(KYCRegistry.initialize, (admin))
        )));

        // 2. PropertyRegistry via proxy
        PropertyRegistry registryImpl = new PropertyRegistry();
        registry = PropertyRegistry(address(new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(PropertyRegistry.initialize, (admin))
        )));

        // 3. PropertyToken (admin holds MINTER_ROLE initially)
        vm.prank(admin);
        propToken = new PropertyToken(
            "RWA Property Token",
            "RWA",
            PROPERTY_ID,
            MAX_SUPPLY,
            admin,
            address(kyc),
            address(0)
        );

        // 4. Mock payment token
        payToken = new MockERC20("USD Stablecoin", "USDC");

        // Timestamps
        startTime = block.timestamp + 100;
        endTime   = block.timestamp + 1_000;

        // 5. Deploy PropertyOffering
        vm.prank(admin);
        offering = new PropertyOffering(
            PROPERTY_ID,
            address(propToken),
            address(payToken),
            PRICE_PER_TOKEN,
            HARD_CAP,
            SOFT_CAP,
            startTime,
            endTime,
            LOCKUP_DURATION,
            address(registry),
            address(kyc)
        );

        // 6. Grant offering contract MINTER_ROLE on PropertyToken
        bytes32 minterRole = propToken.MINTER_ROLE();
        vm.prank(admin);
        propToken.grantRole(minterRole, address(offering));

        // 7. Advance registry to OfferingOpen
        vm.startPrank(admin);
        registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0); // id = 1, Draft
        registry.submitForReview(PROPERTY_ID);         // UnderReview
        registry.approveProperty(PROPERTY_ID);         // Approved
        registry.openOffering(PROPERTY_ID, address(offering)); // OfferingOpen
        vm.stopPrank();

        // 8. KYC verify alice and bob; charlie remains unverified
        vm.startPrank(admin);
        kyc.verify(alice,    840, 1, 0);
        kyc.verify(bob,      840, 1, 0);
        kyc.verify(admin,    840, 1, 0);
        vm.stopPrank();

        // 9. Fund alice and bob with payment tokens
        payToken.mint(alice, 500_000 ether);
        payToken.mint(bob,   500_000 ether);

        // 10. Approve offering contract to pull payment tokens
        vm.prank(alice);
        payToken.approve(address(offering), type(uint256).max);
        vm.prank(bob);
        payToken.approve(address(offering), type(uint256).max);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    /// @dev Warp inside offering window, invest `tokenAmount` as `investor`.
    function _investAs(address investor, uint256 tokenAmount) internal {
        vm.warp(startTime + 1);
        vm.prank(investor);
        offering.invest(tokenAmount);
    }

    /// @dev Reach soft-cap with alice then finalize.
    function _finalizeWithAlice() internal {
        _investAs(alice, SOFT_CAP); // invest exactly softCap
        vm.prank(admin);
        offering.finalizeOffering();
    }

    // ─── invest() ────────────────────────────────────────────────────────────

    function test_invest_recordsInvestment() public {
        _investAs(alice, 10 ether);
        assertEq(offering.getInvestment(alice), 10 ether);
        assertEq(offering.totalTokensCommitted(), 10 ether);
    }

    function test_invest_transfersPaymentToEscrow() public {
        uint256 balanceBefore = payToken.balanceOf(address(offering));
        _investAs(alice, 10 ether);
        uint256 paymentAmount = 10 ether * PRICE_PER_TOKEN / 1e18;
        assertEq(payToken.balanceOf(address(offering)), balanceBefore + paymentAmount);
    }

    function test_invest_emitsEvent() public {
        vm.warp(startTime + 1);
        uint256 tokenAmount   = 10 ether;
        uint256 paymentAmount = tokenAmount * PRICE_PER_TOKEN / 1e18;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(offering));
        emit InvestmentMade(PROPERTY_ID, alice, tokenAmount, paymentAmount);
        offering.invest(tokenAmount);
    }

    function test_invest_multipleInvestors() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        offering.invest(50 ether);
        vm.prank(bob);
        offering.invest(50 ether);
        assertEq(offering.totalTokensCommitted(), 100 ether);
    }

    function test_invest_sameInvestorTwice_accumulates() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        offering.invest(50 ether);
        vm.prank(alice);
        offering.invest(50 ether);
        assertEq(offering.getInvestment(alice), 100 ether);
    }

    function test_revert_invest_notKYC() public {
        vm.warp(startTime + 1);
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(KYCRegistry__NotVerified.selector, charlie));
        offering.invest(10 ether);
    }

    function test_revert_invest_beforeStart() public {
        // block.timestamp < startTime
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__OfferingNotActive.selector);
        offering.invest(10 ether);
    }

    function test_revert_invest_afterEnd() public {
        vm.warp(endTime + 1);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__OfferingNotActive.selector);
        offering.invest(10 ether);
    }

    function test_revert_invest_hardCapExceeded() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__HardCapReached.selector);
        offering.invest(HARD_CAP + 1);
    }

    function test_invest_exactHardCap_succeeds() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        offering.invest(HARD_CAP);
        assertEq(offering.totalTokensCommitted(), HARD_CAP);
    }

    function test_revert_invest_afterHardCapFilled() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        offering.invest(HARD_CAP); // fill it
        vm.prank(bob);
        vm.expectRevert(PropertyOffering__HardCapReached.selector);
        offering.invest(1 ether); // even 1 wei over
    }

    function test_revert_invest_whenFinalized() public {
        _finalizeWithAlice();
        vm.warp(startTime + 1);
        vm.prank(bob);
        vm.expectRevert(PropertyOffering__OfferingNotActive.selector);
        offering.invest(10 ether);
    }

    function test_revert_invest_whenCancelled() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        offering.invest(10 ether); // below softCap
        vm.prank(admin);
        offering.cancelOffering();
        vm.prank(bob);
        vm.expectRevert(PropertyOffering__OfferingNotActive.selector);
        offering.invest(10 ether);
    }

    // ─── finalizeOffering() ──────────────────────────────────────────────────

    /// @dev finalizeOffering() is O(1) now — it no longer mints. Investors pull their
    ///      allocation, so a large investor list can never make finalization run out of gas.
    function test_finalizeOffering_doesNotMint() public {
        _investAs(alice, 100 ether);
        _investAs(bob,   50 ether);
        vm.prank(admin);
        offering.finalizeOffering();

        assertEq(propToken.balanceOf(alice), 0);
        assertEq(propToken.balanceOf(bob),   0);
    }

    function test_claimTokens_mintsAllocation() public {
        _investAs(alice, 100 ether);
        _investAs(bob,   50 ether);
        vm.prank(admin);
        offering.finalizeOffering();

        vm.prank(alice); offering.claimTokens();
        vm.prank(bob);   offering.claimTokens();

        assertEq(propToken.balanceOf(alice), 100 ether);
        assertEq(propToken.balanceOf(bob),    50 ether);
        assertTrue(offering.hasClaimedTokens(alice));
        assertTrue(offering.hasClaimedTokens(bob));
    }

    function test_claimTokens_emitsEvent() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.finalizeOffering();

        uint256 expiry = offering.lockupExpiry();
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(offering));
        emit OfferingTokensClaimed(PROPERTY_ID, alice, SOFT_CAP, expiry);
        offering.claimTokens();
    }

    function test_claimTokensFor_batchPushesToInvestors() public {
        _investAs(alice, 100 ether);
        _investAs(bob,    50 ether);
        vm.prank(admin);
        offering.finalizeOffering();

        address[] memory batch = new address[](2);
        batch[0] = alice;
        batch[1] = bob;
        offering.claimTokensFor(batch);

        assertEq(propToken.balanceOf(alice), 100 ether);
        assertEq(propToken.balanceOf(bob),    50 ether);
    }

    function test_revert_claimTokens_twice() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.finalizeOffering();

        vm.prank(alice);
        offering.claimTokens();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__TokensAlreadyClaimed.selector, alice)
        );
        offering.claimTokens();
    }

    function test_revert_claimTokens_beforeFinalize() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__NotFinalized.selector);
        offering.claimTokens();
    }

    function test_revert_claimTokens_nonInvestor() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.finalizeOffering();

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__NothingToClaim.selector, bob)
        );
        offering.claimTokens();
    }

    function test_investorEnumeration() public {
        _investAs(alice, 100 ether);
        _investAs(bob,    50 ether);
        _investAs(alice,  10 ether); // repeat investor is not double-counted

        assertEq(offering.investorCount(), 2);
        assertEq(offering.investorAt(0), alice);
        assertEq(offering.investorAt(1), bob);
    }

    function test_finalizeOffering_transfersFundsToOwner() public {
        uint256 tokenAmount   = SOFT_CAP;
        uint256 paymentAmount = tokenAmount * PRICE_PER_TOKEN / 1e18;

        uint256 ownerBefore = payToken.balanceOf(admin); // admin is property owner
        _investAs(alice, tokenAmount);
        vm.prank(admin);
        offering.finalizeOffering();

        assertEq(payToken.balanceOf(admin), ownerBefore + paymentAmount);
    }

    function test_finalizeOffering_setsFinalized() public {
        _finalizeWithAlice();
        assertTrue(offering.finalized());
    }

    function test_finalizeOffering_closesRegistry() public {
        _finalizeWithAlice();
        assertEq(
            uint8(registry.getProperty(PROPERTY_ID).status),
            uint8(Types.PropertyStatus.OfferingClosed)
        );
    }

    function test_finalizeOffering_setsLockup() public {
        _investAs(alice, SOFT_CAP);
        uint256 expectedExpiry = block.timestamp + LOCKUP_DURATION;
        vm.prank(admin);
        offering.finalizeOffering();

        assertEq(offering.getLockupExpiry(alice), expectedExpiry);
        assertEq(offering.lockupExpiry(),         expectedExpiry);

        // The token-level lockup is applied when the investor claims.
        vm.prank(alice);
        offering.claimTokens();
        assertEq(propToken.lockupExpiry(alice), expectedExpiry);
    }

    function test_finalizeOffering_emitsEvent() public {
        uint256 tokenAmount   = SOFT_CAP;
        uint256 paymentAmount = tokenAmount * PRICE_PER_TOKEN / 1e18;
        _investAs(alice, tokenAmount);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(offering));
        emit OfferingFinalized(PROPERTY_ID, address(offering), paymentAmount);
        offering.finalizeOffering();
    }

    function test_revert_finalize_softCapNotReached() public {
        _investAs(alice, SOFT_CAP - 1 ether); // just below soft cap
        vm.prank(admin);
        vm.expectRevert(PropertyOffering__SoftCapNotReached.selector);
        offering.finalizeOffering();
    }

    function test_revert_finalize_alreadyFinalized() public {
        _finalizeWithAlice();
        vm.prank(admin);
        vm.expectRevert(PropertyOffering__AlreadyFinalized.selector);
        offering.finalizeOffering();
    }

    function test_revert_finalize_whenCancelled() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.cancelOffering();
        vm.prank(admin);
        vm.expectRevert(PropertyOffering__AlreadyCancelled.selector);
        offering.finalizeOffering();
    }

    function test_revert_finalize_nonAdmin() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(alice);
        vm.expectRevert();
        offering.finalizeOffering();
    }

    // ─── cancelOffering() ────────────────────────────────────────────────────

    function test_cancelOffering_setsCancelled() public {
        vm.prank(admin);
        offering.cancelOffering();
        assertTrue(offering.cancelled());
    }

    function test_cancelOffering_closesRegistry() public {
        vm.prank(admin);
        offering.cancelOffering();
        assertEq(
            uint8(registry.getProperty(PROPERTY_ID).status),
            uint8(Types.PropertyStatus.OfferingClosed)
        );
    }

    function test_cancelOffering_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, false, address(offering));
        emit OfferingCancelled(PROPERTY_ID, address(offering));
        offering.cancelOffering();
    }

    function test_revert_cancel_alreadyFinalized() public {
        _finalizeWithAlice();
        vm.prank(admin);
        vm.expectRevert(PropertyOffering__AlreadyFinalized.selector);
        offering.cancelOffering();
    }

    function test_revert_cancel_nonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        offering.cancelOffering();
    }

    // ─── refund() ────────────────────────────────────────────────────────────

    function test_refund_returnsPayment() public {
        uint256 tokenAmount   = 50 ether;
        uint256 paymentAmount = tokenAmount * PRICE_PER_TOKEN / 1e18;
        _investAs(alice, tokenAmount);

        vm.prank(admin);
        offering.cancelOffering();

        uint256 balanceBefore = payToken.balanceOf(alice);
        vm.prank(alice);
        offering.refund();
        assertEq(payToken.balanceOf(alice), balanceBefore + paymentAmount);
    }

    function test_refund_clearsInvestment() public {
        _investAs(alice, 50 ether);
        vm.prank(admin);
        offering.cancelOffering();
        vm.prank(alice);
        offering.refund();
        assertEq(offering.getInvestment(alice), 0);
    }

    function test_refund_emitsEvent() public {
        uint256 tokenAmount   = 50 ether;
        uint256 paymentAmount = tokenAmount * PRICE_PER_TOKEN / 1e18;
        _investAs(alice, tokenAmount);
        vm.prank(admin);
        offering.cancelOffering();

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(offering));
        emit InvestorRefunded(PROPERTY_ID, alice, paymentAmount);
        offering.refund();
    }

    /// @dev Previously a silent no-op, which gave a non-investor a successful tx and no
    ///      way to tell a real refund from nothing happening.
    function test_revert_refund_whenNothingEscrowed() public {
        vm.prank(admin);
        offering.cancelOffering();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__NothingToClaim.selector, bob)
        );
        offering.refund();
    }

    function test_refund_cannotRefundTwice() public {
        _investAs(alice, 50 ether);
        vm.prank(admin);
        offering.cancelOffering();
        vm.prank(alice);
        offering.refund(); // first refund
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__NothingToClaim.selector, alice)
        );
        offering.refund(); // second refund is rejected outright
    }

    function test_revert_refund_notCancelled() public {
        _investAs(alice, 50 ether);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__NotCancelled.selector);
        offering.refund();
    }

    // ─── Lockup enforcement ──────────────────────────────────────────────────

    function test_lockup_preventsTransferDuringLockup() public {
        _investAs(alice, SOFT_CAP);
        uint256 expectedExpiry = block.timestamp + LOCKUP_DURATION;
        vm.prank(admin);
        offering.finalizeOffering();
        vm.prank(alice);
        offering.claimTokens();

        // alice tries to transfer to bob while locked
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyToken__TransferLocked.selector, alice, expectedExpiry)
        );
        propToken.transfer(bob, 1 ether);
    }

    function test_lockup_allowsTransferAfterExpiry() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.finalizeOffering();
        vm.prank(alice);
        offering.claimTokens();

        // Warp past lockup
        vm.warp(block.timestamp + LOCKUP_DURATION + 1);

        // Transfer should succeed (both KYC verified)
        vm.prank(alice);
        propToken.transfer(bob, 1 ether);
        assertEq(propToken.balanceOf(bob), 1 ether);
    }

    function test_lockup_doesNotAffectTokensFromOtherSources() public {
        // Mint tokens directly to bob via admin (no lockup set)
        vm.prank(admin);
        propToken.mint(bob, 10 ether);

        // bob has no lockup — transfer should succeed immediately
        vm.prank(bob);
        propToken.transfer(alice, 5 ether);
        assertEq(propToken.balanceOf(alice), 5 ether);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_invest_withinBounds(uint256 tokenAmount) public {
        vm.assume(tokenAmount > 0 && tokenAmount <= SOFT_CAP);
        _investAs(alice, tokenAmount);
        assertEq(offering.getInvestment(alice), tokenAmount);
    }

    function testFuzz_invest_hardCapEnforced(uint256 tokenAmount) public {
        vm.assume(tokenAmount > HARD_CAP);
        vm.warp(startTime + 1);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__HardCapReached.selector);
        offering.invest(tokenAmount);
    }

    // ─── Permissionless expiry (escrow is not hostage to admin liveness) ─────

    /// @dev Escrow used to leave this contract only via an ADMIN_ROLE call. If the admin
    ///      never finalized and never cancelled, investor funds sat here forever with no
    ///      recourse. Anyone may now open refunds once the window closes under-subscribed.
    function test_expireOffering_anyoneCanOpenRefunds() public {
        _investAs(alice, SOFT_CAP - 1 ether); // under the soft cap
        vm.warp(endTime + 1);

        vm.prank(charlie); // no role, never invested
        offering.expireOffering();

        assertTrue(offering.cancelled());

        uint256 before = payToken.balanceOf(alice);
        vm.prank(alice);
        offering.refund();
        assertGt(payToken.balanceOf(alice), before);
        assertEq(payToken.balanceOf(address(offering)), 0);
    }

    function test_expireOffering_emitsCancelled() public {
        _investAs(alice, 1 ether);
        vm.warp(endTime + 1);

        vm.expectEmit(true, true, false, false, address(offering));
        emit OfferingCancelled(PROPERTY_ID, address(offering));
        offering.expireOffering();
    }

    function test_revert_expireOffering_beforeEnd() public {
        _investAs(alice, 1 ether);
        vm.expectRevert(PropertyOffering__OfferingNotEnded.selector);
        offering.expireOffering();
    }

    function test_revert_expireOffering_whenSoftCapReached() public {
        _investAs(alice, SOFT_CAP);
        vm.warp(endTime + 1);
        vm.expectRevert(PropertyOffering__SoftCapAlreadyReached.selector);
        offering.expireOffering();
    }

    function test_revert_expireOffering_afterFinalize() public {
        _investAs(alice, SOFT_CAP);
        vm.prank(admin);
        offering.finalizeOffering();

        vm.warp(endTime + 1);
        vm.expectRevert(PropertyOffering__AlreadyFinalized.selector);
        offering.expireOffering();
    }

    /// @dev Both failure routes tolerate a reverting registry. The property has been paused
    ///      here, so closeOffering() would revert on a status check — refunds must not care.
    function test_expireOffering_survivesRevertingRegistry() public {
        _investAs(alice, 1 ether);

        vm.prank(admin);
        registry.pauseProperty(PROPERTY_ID); // registry can no longer accept closeOffering

        vm.warp(endTime + 1);
        offering.expireOffering();
        assertTrue(offering.cancelled());

        vm.prank(alice);
        offering.refund();
        assertEq(payToken.balanceOf(address(offering)), 0);
    }

    // ─── Escrow accounting ───────────────────────────────────────────────────

    /// @dev finalizeOffering() reads a running total instead of summing a loop, so the
    ///      invariant "escrow is drained exactly" must still hold.
    function test_finalize_drainsEscrowExactly() public {
        _investAs(alice, 60 ether);
        _investAs(bob,   40 ether);

        uint256 escrow = payToken.balanceOf(address(offering));
        assertEq(escrow, offering.totalPaymentsReceived());

        address owner = registry.getProperty(PROPERTY_ID).owner;
        uint256 ownerBefore = payToken.balanceOf(owner);

        vm.prank(admin);
        offering.finalizeOffering();

        assertEq(payToken.balanceOf(owner), ownerBefore + escrow);
        assertEq(payToken.balanceOf(address(offering)), 0);
    }

    /// @dev Payment rounds UP, so a commitment too small to cost a whole payment unit is
    ///      charged 1 rather than 0. Previously it truncated to free tokens.
    function test_invest_dustCommitmentIsNotFree() public {
        uint256 dust = 1; // one wei of a property token
        vm.warp(startTime + 1);

        uint256 before = payToken.balanceOf(alice);
        vm.prank(alice);
        offering.invest(dust);

        uint256 paid = before - payToken.balanceOf(alice);
        assertGt(paid, 0, "dust commitment must still cost something");
        assertEq(offering.getInvestment(alice), dust);
    }

    function test_revert_invest_zeroAmount() public {
        vm.warp(startTime + 1);
        vm.prank(alice);
        vm.expectRevert(PropertyOffering__ZeroAmount.selector);
        offering.invest(0);
    }

    // ─── Constructor validation ──────────────────────────────────────────────

    /// @dev A hard cap above the token's ceiling meant claim-time mints would revert
    ///      forever, so the offering could take money and never issue against it.
    function test_revert_constructor_hardCapAboveTokenMaxSupply() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                PropertyOffering__HardCapExceedsMaxSupply.selector, MAX_SUPPLY + 1, MAX_SUPPLY
            )
        );
        new PropertyOffering(
            PROPERTY_ID, address(propToken), address(payToken), PRICE_PER_TOKEN,
            MAX_SUPPLY + 1, SOFT_CAP, startTime, endTime, LOCKUP_DURATION,
            address(registry), address(kyc)
        );
    }

    function test_revert_constructor_softCapAboveHardCap() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__InvalidCaps.selector, HARD_CAP + 1, HARD_CAP)
        );
        new PropertyOffering(
            PROPERTY_ID, address(propToken), address(payToken), PRICE_PER_TOKEN,
            HARD_CAP, HARD_CAP + 1, startTime, endTime, LOCKUP_DURATION,
            address(registry), address(kyc)
        );
    }

    function test_revert_constructor_invalidTimeWindow() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(PropertyOffering__InvalidTimeWindow.selector, endTime, startTime)
        );
        new PropertyOffering(
            PROPERTY_ID, address(propToken), address(payToken), PRICE_PER_TOKEN,
            HARD_CAP, SOFT_CAP, endTime, startTime, LOCKUP_DURATION,
            address(registry), address(kyc)
        );
    }

    // ─── Finalization is O(1) ────────────────────────────────────────────────

    /// @dev The old finalizeOffering() minted inside a loop over every investor at roughly
    ///      130k gas each, so past a few hundred investors it exceeded the block gas limit
    ///      and the offering could never be finalized. Finalization is now constant-cost
    ///      and issuance is pulled per investor.
    function test_finalize_isConstantCostWithManyInvestors() public {
        uint256 n = 300;
        vm.warp(startTime + 1);

        for (uint256 i = 0; i < n; ++i) {
            address investor = address(uint160(0xC0FFEE0000 + i));
            vm.prank(admin);
            kyc.verify(investor, 840, 2, 0);
            payToken.mint(investor, 1_000e18);
            vm.prank(investor);
            payToken.approve(address(offering), type(uint256).max);
            vm.prank(investor);
            offering.invest(1 ether);
        }
        assertEq(offering.investorCount(), n);

        uint256 gasBefore = gasleft();
        vm.prank(admin);
        offering.finalizeOffering();
        uint256 gasUsed = gasBefore - gasleft();

        // Comfortably inside a block; the old loop alone would have needed ~39M for 300.
        assertLt(gasUsed, 200_000, "finalization must not scale with investor count");

        // And every investor can still get their tokens.
        address first = offering.investorAt(0);
        vm.prank(first);
        offering.claimTokens();
        assertEq(propToken.balanceOf(first), 1 ether);
    }
}
