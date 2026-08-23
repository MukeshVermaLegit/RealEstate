// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PropertyRegistry} from "../../src/core/PropertyRegistry.sol";
import {Types} from "../../src/utils/Types.sol";
import {
    PropertyRegistry__PropertyNotFound,
    PropertyRegistry__InvalidMetadataURI,
    PropertyRegistry__InvalidSupply,
    PropertyRegistry__NotPropertyOwner,
    PropertyRegistry__InvalidStatus
} from "../../src/utils/Errors.sol";
import {
    PropertyRegistered,
    PropertyMetadataUpdated,
    PropertyStatusUpdated,
    PropertyLegalDetailsUpdated,
    PropertySubmissionRejected,
    PropertyOfferingTermsUpdated
} from "../../src/utils/Events.sol";

contract PropertyRegistryTest is Test {
    PropertyRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");

    string internal constant URI = "ipfs://QmTest";
    uint256 internal constant SUPPLY = 1_000 ether;
    uint256 internal constant PRICE = 100e18;

    function setUp() public {
        PropertyRegistry impl = new PropertyRegistry();
        registry = PropertyRegistry(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(PropertyRegistry.initialize, (admin))))
        );
    }

    // ─── Upgrade test ────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        PropertyRegistry newImpl = new PropertyRegistry();
        vm.prank(admin);
        registry.upgradeToAndCall(address(newImpl), "");

        // State persisted
        assertEq(registry.getProperty(id).metadataURI, URI);
    }

    function test_revert_upgrade_notAdmin() public {
        vm.prank(alice);
        PropertyRegistry newImpl = new PropertyRegistry();
        vm.prank(alice);
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");
    }

    // ─── registerProperty ────────────────────────────────────────────────────

    function test_registerProperty_returnsIncrementalId() public {
        vm.startPrank(admin);
        uint256 id1 = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        uint256 id2 = registry.registerProperty("ipfs://QmB", 500 ether, 50e18, address(0), bytes32(0), 0);
        vm.stopPrank();
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalProperties(), 2);
    }

    function test_registerProperty_storesCorrectData() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.propertyId, id);
        assertEq(prop.owner, admin);
        assertEq(prop.metadataURI, URI);
        assertEq(prop.totalSupply, SUPPLY);
        assertEq(prop.pricePerToken, PRICE);
        assertEq(prop.createdAt, block.timestamp);
        assertEq(uint8(prop.status), uint8(Types.PropertyStatus.Draft));
        assertEq(prop.offeringContract, address(0));
        assertEq(prop.spvAddress, address(0));
        assertEq(prop.legalHash, bytes32(0));
        assertEq(prop.jurisdiction, 0);
    }

    function test_registerProperty_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(registry));
        emit PropertyRegistered(1, admin, URI, SUPPLY);
        registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
    }

    function test_revert_register_emptyURI() public {
        vm.prank(admin);
        vm.expectRevert(PropertyRegistry__InvalidMetadataURI.selector);
        registry.registerProperty("", SUPPLY, PRICE, address(0), bytes32(0), 0);
    }

    function test_revert_register_zeroSupply() public {
        vm.prank(admin);
        vm.expectRevert(PropertyRegistry__InvalidSupply.selector);
        registry.registerProperty(URI, 0, PRICE, address(0), bytes32(0), 0);
    }

    /// Registration is permissionless: any wallet can create a Draft listing and owns it.
    /// Admin approval is what gates a listing becoming investable, not registration itself.
    function test_registerProperty_byAnyWallet() public {
        vm.prank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.owner, alice);
        assertEq(uint8(prop.status), uint8(Types.PropertyStatus.Draft));
        assertFalse(registry.hasRole(registry.PROPERTY_ADMIN_ROLE(), alice));
    }

    function test_registerProperty_draftIsInert() public {
        vm.prank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        // A self-registered Draft carries no token and no offering contract, so it cannot
        // take investor money before an admin has approved and opened it.
        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.tokenAddress, address(0));
        assertEq(prop.offeringContract, address(0));

        // And its owner cannot walk it past review on their own.
        vm.prank(alice);
        registry.submitForReview(id);
        vm.prank(alice);
        vm.expectRevert();
        registry.approveProperty(id);
    }

    // ─── updateMetadata ──────────────────────────────────────────────────────

    function test_updateMetadata_byAdmin() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.updateMetadata(id, "ipfs://QmNew");
        vm.stopPrank();
        assertEq(registry.getProperty(id).metadataURI, "ipfs://QmNew");
    }

    function test_updateMetadata_byPropertyOwner() public {
        vm.prank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        // alice owns the property and it is still a Draft, so she can revise it freely
        vm.prank(alice);
        registry.updateMetadata(id, "ipfs://QmUpdated");
        assertEq(registry.getProperty(id).metadataURI, "ipfs://QmUpdated");
    }

    /// Once a listing leaves Draft it is what admins vet and investors buy against, so the
    /// owner loses edit rights — otherwise a seller could swap the legal pack after a sale.
    function test_revert_updateMetadata_ownerAfterSubmit() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);

        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.updateMetadata(id, "ipfs://QmSwapped");
        vm.stopPrank();

        assertEq(registry.getProperty(id).metadataURI, URI);
    }

    function test_revert_updateLegalDetails_ownerAfterSubmit() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);

        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.updateLegalDetails(id, makeAddr("otherSpv"), keccak256("swapped"), 250);
        vm.stopPrank();
    }

    /// Admins keep edit rights at every status — they are the ones fixing a bad record.
    function test_updateMetadata_byAdmin_afterSubmit() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.stopPrank();

        vm.prank(admin);
        registry.updateMetadata(id, "ipfs://QmCorrected");
        assertEq(registry.getProperty(id).metadataURI, "ipfs://QmCorrected");
    }

    function test_updateMetadata_ownerAfterRejectionBackToDraft() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.stopPrank();

        vm.prank(admin);
        registry.rejectSubmission(id, "SPV address missing");

        // Back in Draft, edit rights return to the owner
        vm.prank(alice);
        registry.updateMetadata(id, "ipfs://QmFixed");
        assertEq(registry.getProperty(id).metadataURI, "ipfs://QmFixed");
    }

    function test_updateMetadata_emitsEvent() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyMetadataUpdated(id, "ipfs://QmNew");
        registry.updateMetadata(id, "ipfs://QmNew");
    }

    function test_revert_updateMetadata_emptyURI() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        vm.expectRevert(PropertyRegistry__InvalidMetadataURI.selector);
        registry.updateMetadata(id, "");
    }

    function test_revert_updateMetadata_nonOwnerNonAdmin() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__NotPropertyOwner.selector, id));
        registry.updateMetadata(id, "ipfs://QmHack");
    }

    // ─── updateOfferingTerms ─────────────────────────────────────────────────

    function test_updateOfferingTerms_byOwnerWhileDraft() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.updateOfferingTerms(id, 2_000 ether, 250e18);
        vm.stopPrank();

        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.totalSupply, 2_000 ether);
        assertEq(prop.pricePerToken, 250e18);
    }

    function test_updateOfferingTerms_emitsEvent() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyOfferingTermsUpdated(id, 2_000 ether, 250e18);
        registry.updateOfferingTerms(id, 2_000 ether, 250e18);
        vm.stopPrank();
    }

    /// Terms are what investors buy against, so they freeze the moment review starts.
    function test_revert_updateOfferingTerms_afterSubmit() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);

        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.updateOfferingTerms(id, 1 ether, 1e18);
        vm.stopPrank();

        assertEq(registry.getProperty(id).totalSupply, SUPPLY);
    }

    function test_revert_updateOfferingTerms_zeroSupply() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.expectRevert(PropertyRegistry__InvalidSupply.selector);
        registry.updateOfferingTerms(id, 0, PRICE);
        vm.stopPrank();
    }

    function test_revert_updateOfferingTerms_nonOwner() public {
        vm.prank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(makeAddr("mallory"));
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__NotPropertyOwner.selector, id));
        registry.updateOfferingTerms(id, 1 ether, 1e18);
    }

    // ─── Lifecycle: submitForReview ──────────────────────────────────────────

    function test_submitForReview_byOwner() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin); // admin is the property owner
        registry.submitForReview(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.UnderReview));
    }

    function test_submitForReview_emitsEvent() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyStatusUpdated(id, uint8(Types.PropertyStatus.Draft), uint8(Types.PropertyStatus.UnderReview));
        registry.submitForReview(id);
    }

    function test_revert_submitForReview_nonOwner() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__NotPropertyOwner.selector, id));
        registry.submitForReview(id);
    }

    function test_revert_submitForReview_wrongStatus() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id); // now UnderReview
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.submitForReview(id); // cannot re-submit
        vm.stopPrank();
    }

    // ─── Lifecycle: approveProperty ──────────────────────────────────────────

    // ─── Lifecycle: rejectSubmission ─────────────────────────────────────────

    function test_rejectSubmission_returnsToDraft() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.stopPrank();

        vm.prank(admin);
        registry.rejectSubmission(id, "Deed scan is illegible");
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Draft));
    }

    function test_rejectSubmission_emitsReason() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.stopPrank();

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertySubmissionRejected(id, "Deed scan is illegible");
        registry.rejectSubmission(id, "Deed scan is illegible");
    }

    function test_rejectSubmission_canResubmit() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.stopPrank();

        vm.prank(admin);
        registry.rejectSubmission(id, "Add the SPV address");

        vm.startPrank(alice);
        registry.updateLegalDetails(id, makeAddr("spv"), keccak256("pack"), 840);
        registry.submitForReview(id);
        vm.stopPrank();
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.UnderReview));

        vm.prank(admin);
        registry.approveProperty(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Approved));
    }

    function test_revert_rejectSubmission_wrongStatus() public {
        vm.prank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        // Still a Draft — nothing has been submitted
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.rejectSubmission(id, "too early");
    }

    function test_revert_rejectSubmission_nonAdmin() public {
        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, registry.PROPERTY_ADMIN_ROLE()
            )
        );
        registry.rejectSubmission(id, "self-approval attempt");
        vm.stopPrank();
    }

    // ─── Lifecycle: approveProperty ──────────────────────────────────────────

    function test_approveProperty() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.approveProperty(id);
        vm.stopPrank();
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Approved));
    }

    function test_revert_approveProperty_wrongStatus() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0); // Draft, not UnderReview

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.approveProperty(id);
    }

    // ─── Lifecycle: openOffering ─────────────────────────────────────────────

    function test_openOffering_storesContract() public {
        address fakeOffering = makeAddr("offering");
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.approveProperty(id);
        registry.openOffering(id, fakeOffering);
        vm.stopPrank();

        Types.Property memory prop = registry.getProperty(id);
        assertEq(uint8(prop.status), uint8(Types.PropertyStatus.OfferingOpen));
        assertEq(prop.offeringContract, fakeOffering);
    }

    function test_revert_openOffering_wrongStatus() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0); // Draft

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.openOffering(id, makeAddr("offering"));
    }

    // ─── Lifecycle: closeOffering ────────────────────────────────────────────

    function test_closeOffering_byAdmin() public {
        address fakeOffering = makeAddr("offering");
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.approveProperty(id);
        registry.openOffering(id, fakeOffering);
        registry.closeOffering(id);
        vm.stopPrank();
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.OfferingClosed));
    }

    function test_closeOffering_byOfferingContract() public {
        address fakeOffering = makeAddr("offering");
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.approveProperty(id);
        registry.openOffering(id, fakeOffering);
        vm.stopPrank();

        vm.prank(fakeOffering);
        registry.closeOffering(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.OfferingClosed));
    }

    // ─── Lifecycle: openTrading ───────────────────────────────────────────────

    function test_openTrading() public {
        address fakeOffering = makeAddr("offering");
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.approveProperty(id);
        registry.openOffering(id, fakeOffering);
        registry.closeOffering(id);
        registry.openTrading(id);
        vm.stopPrank();
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Trading));
    }

    function test_revert_openTrading_wrongStatus() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.openTrading(id);
    }

    // ─── Lifecycle: pauseProperty ─────────────────────────────────────────────

    function test_pauseProperty_fromUnderReview() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        registry.pauseProperty(id);
        vm.stopPrank();
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Paused));
    }

    function test_pauseProperty_emitsEvent() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.submitForReview(id);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyStatusUpdated(id, uint8(Types.PropertyStatus.UnderReview), uint8(Types.PropertyStatus.Paused));
        registry.pauseProperty(id);
        vm.stopPrank();
    }

    function test_revert_pauseProperty_fromDraft() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0); // Draft

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.pauseProperty(id);
    }

    function test_revert_pauseProperty_nonAdmin() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(alice);
        vm.expectRevert();
        registry.pauseProperty(id);
    }

    // ─── Lifecycle: delistProperty ────────────────────────────────────────────

    function test_delistProperty() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        registry.delistProperty(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Delisted));
    }

    function test_delistProperty_emitsEvent() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyStatusUpdated(id, uint8(Types.PropertyStatus.Draft), uint8(Types.PropertyStatus.Delisted));
        registry.delistProperty(id);
    }

    function test_revert_delistProperty_alreadyDelisted() public {
        vm.startPrank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        registry.delistProperty(id);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__InvalidStatus.selector, id));
        registry.delistProperty(id);
        vm.stopPrank();
    }

    function test_revert_delistProperty_nonAdmin() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(alice);
        vm.expectRevert();
        registry.delistProperty(id);
    }

    // ─── Full lifecycle happy path ────────────────────────────────────────────

    function test_fullLifecycle() public {
        address fakeOffering = makeAddr("offering");
        vm.startPrank(admin);

        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Draft));

        registry.submitForReview(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.UnderReview));

        registry.approveProperty(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Approved));

        registry.openOffering(id, fakeOffering);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.OfferingOpen));
        assertEq(registry.getProperty(id).offeringContract, fakeOffering);

        registry.closeOffering(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.OfferingClosed));

        registry.openTrading(id);
        assertEq(uint8(registry.getProperty(id).status), uint8(Types.PropertyStatus.Trading));

        vm.stopPrank();
    }

    /// End-to-end for the self-serve path: an ordinary wallet lists, an admin reviews.
    function test_selfServeLifecycle() public {
        address fakeOffering = makeAddr("offering");

        vm.startPrank(alice);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, makeAddr("spv"), keccak256("pack"), 840);
        registry.updateMetadata(id, "ipfs://QmRevised");
        registry.submitForReview(id);
        vm.stopPrank();

        vm.startPrank(admin);
        registry.approveProperty(id);
        registry.openOffering(id, fakeOffering);
        registry.closeOffering(id);
        registry.openTrading(id);
        vm.stopPrank();

        Types.Property memory prop = registry.getProperty(id);
        assertEq(uint8(prop.status), uint8(Types.PropertyStatus.Trading));
        assertEq(prop.owner, alice, "owner survives the whole lifecycle");
        assertEq(prop.metadataURI, "ipfs://QmRevised");
    }

    // ─── getProperty ─────────────────────────────────────────────────────────

    function test_revert_getProperty_notFound() public {
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__PropertyNotFound.selector, 999));
        registry.getProperty(999);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_registerProperty(uint256 supply, uint256 price) public {
        vm.assume(supply > 0 && supply <= 1_000_000 ether);
        vm.assume(price > 0);
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, supply, price, address(0), bytes32(0), 0);
        assertEq(registry.getProperty(id).totalSupply, supply);
        assertEq(registry.getProperty(id).pricePerToken, price);
    }

    // ─── updateLegalDetails ─────────────────────────────────────────────────────

    function test_registerProperty_withLegalDetails() public {
        address spv = makeAddr("spv");
        bytes32 legalHash = keccak256("operating-agreement-v1");
        uint16 juris = 840; // USA

        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, spv, legalHash, juris);

        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.spvAddress, spv);
        assertEq(prop.legalHash, legalHash);
        assertEq(prop.jurisdiction, juris);
    }

    function test_updateLegalDetails_byAdmin() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        address newSpv = makeAddr("spv");
        bytes32 newHash = keccak256("deed-v2");
        uint16 newJur = 276; // Germany

        vm.prank(admin);
        registry.updateLegalDetails(id, newSpv, newHash, newJur);

        Types.Property memory prop = registry.getProperty(id);
        assertEq(prop.spvAddress, newSpv);
        assertEq(prop.legalHash, newHash);
        assertEq(prop.jurisdiction, newJur);
    }

    function test_updateLegalDetails_emitsEvent() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        address newSpv = makeAddr("spv");
        bytes32 newHash = keccak256("deed-v2");
        uint16 newJur = 276;

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(registry));
        emit PropertyLegalDetailsUpdated(id, newSpv, newHash, newJur);
        registry.updateLegalDetails(id, newSpv, newHash, newJur);
    }

    function test_revert_updateLegalDetails_nonOwnerNonAdmin() public {
        vm.prank(admin);
        uint256 id = registry.registerProperty(URI, SUPPLY, PRICE, address(0), bytes32(0), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyRegistry__NotPropertyOwner.selector, id));
        registry.updateLegalDetails(id, makeAddr("spv"), bytes32(0), 0);
    }
}
