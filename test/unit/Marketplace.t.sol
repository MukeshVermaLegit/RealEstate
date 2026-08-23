// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Marketplace} from "../../src/core/Marketplace.sol";
import {PropertyToken} from "../../src/core/PropertyToken.sol";
import {PropertyRegistry} from "../../src/core/PropertyRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {Types} from "../../src/utils/Types.sol";
import {
    Marketplace__ListingNotFound,
    Marketplace__ListingNotActive,
    Marketplace__NotKYCVerified,
    Marketplace__ZeroAmount,
    Marketplace__ZeroPrice,
    Marketplace__NotLister,
    Marketplace__ListingExpired,
    Marketplace__FeeTooHigh,
    Marketplace__ZeroFeeCollector,
    Marketplace__InsufficientListingAmount
} from "../../src/utils/Errors.sol";
import {
    ListingCreated,
    ListingPurchased,
    ListingCancelled,
    FeeUpdated,
    FeeCollectorUpdated,
    ProtocolFeeCollected
} from "../../src/utils/Events.sol";

contract MarketplaceTest is Test {
    PropertyRegistry internal registry;
    KYCRegistry      internal kyc;
    PropertyToken    internal token;
    MockERC20        internal usdc;
    Marketplace      internal market;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // seller
    address internal bob   = makeAddr("bob");   // buyer

    uint256 internal propertyId;

    uint256 internal constant TOKEN_SUPPLY  = 1_000 ether;
    uint256 internal constant ALICE_TOKENS  = 600 ether;
    /// @dev Payment-token units per ONE WHOLE property token (1e18 wei) — the unit
    ///      Marketplace and PropertyOffering now share. Cost = amount * price / 1e18.
    uint256 internal constant PRICE_PER_TOK = 10 ether;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy registries via proxies
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

        usdc     = new MockERC20("Mock USDC", "USDC");

        propertyId = registry.registerProperty("ipfs://QmProp", TOKEN_SUPPLY, PRICE_PER_TOK, address(0), bytes32(0), 0);

        // Deploy a per-property ERC-20 token and register it in the registry
        token = new PropertyToken("Prop Token", "PT", propertyId, TOKEN_SUPPLY, admin, address(kyc), address(0));
        registry.setTokenAddress(propertyId, address(token));

        // Deploy Marketplace via proxy
        Marketplace marketImpl = new Marketplace();
        market = Marketplace(address(new ERC1967Proxy(
            address(marketImpl),
            abi.encodeCall(Marketplace.initialize, (admin, address(registry), address(kyc), address(usdc), 0, address(0)))
        )));

        // KYC both users AND the marketplace contract (it receives tokens in escrow)
        kyc.verify(alice,           840, 2, 0);
        kyc.verify(bob,             840, 2, 0);
        kyc.verify(address(market), 840, 2, 0);

        // Mint tokens to alice
        token.mint(alice, ALICE_TOKENS);

        vm.stopPrank();

        // Give bob USDC to buy with
        usdc.mint(bob, 100_000e18);

        // Alice approves marketplace to move her tokens (ERC-20 approve)
        vm.prank(alice);
        token.approve(address(market), type(uint256).max);

        // Bob approves marketplace to spend his USDC
        vm.prank(bob);
        usdc.approve(address(market), type(uint256).max);
    }

    /// @dev Mirrors Marketplace's cost formula: ceil(amount * pricePerToken / 1e18).
    function _cost(uint256 amount) internal pure returns (uint256) {
        return Math.mulDiv(amount, PRICE_PER_TOK, 1e18, Math.Rounding.Ceil);
    }

    // ─── Upgrade test ────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);
        assertEq(listingId, 1);

        vm.prank(admin);
        Marketplace newImpl = new Marketplace();
        vm.prank(admin);
        market.upgradeToAndCall(address(newImpl), "");

        // State persisted — listing still exists
        Types.Listing memory l = market.getListing(listingId);
        assertEq(l.seller, alice);
    }

    function test_revert_upgrade_notAdmin() public {
        vm.prank(alice);
        Marketplace newImpl = new Marketplace();
        vm.prank(alice);
        vm.expectRevert();
        market.upgradeToAndCall(address(newImpl), "");
    }

    // ─── createListing ───────────────────────────────────────────────────────

    function test_createListing_storesListing() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        Types.Listing memory l = market.getListing(listingId);
        assertEq(l.listingId,     listingId);
        assertEq(l.propertyId,    propertyId);
        assertEq(l.seller,        alice);
        assertEq(l.tokenAmount,   100 ether);
        assertEq(l.pricePerToken, PRICE_PER_TOK);
        assertEq(uint8(l.status), uint8(Types.ListingStatus.Active));
        assertEq(l.tokenAddress,  address(token));
    }

    function test_createListing_transfersTokensToEscrow() public {
        vm.prank(alice);
        market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        assertEq(token.balanceOf(address(market)), 100 ether);
        assertEq(token.balanceOf(alice), ALICE_TOKENS - 100 ether);
    }

    function test_createListing_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(market));
        emit ListingCreated(1, propertyId, alice, 100 ether, PRICE_PER_TOK, 0);
        market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);
    }

    function test_createListing_incrementsListingId() public {
        vm.startPrank(alice);
        uint256 id1 = market.createListing(propertyId, 50 ether, PRICE_PER_TOK, 0);
        uint256 id2 = market.createListing(propertyId, 50 ether, PRICE_PER_TOK, 0);
        vm.stopPrank();
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_revert_createListing_zeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(Marketplace__ZeroAmount.selector);
        market.createListing(propertyId, 0, PRICE_PER_TOK, 0);
    }

    function test_revert_createListing_zeroPrice() public {
        vm.prank(alice);
        vm.expectRevert(Marketplace__ZeroPrice.selector);
        market.createListing(propertyId, 100 ether, 0, 0);
    }

    function test_revert_createListing_notKYC() public {
        address eve = makeAddr("eve"); // not KYC'd
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__NotKYCVerified.selector, eve));
        market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);
    }

    // ─── buyListing ──────────────────────────────────────────────────────────

    function test_buyListing_fullPurchase() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        vm.prank(bob);
        market.buyListing(listingId, 100 ether);

        // Bob holds the tokens
        assertEq(token.balanceOf(bob), 100 ether);
        // Alice got paid
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore + _cost(100 ether));
        // Listing is sold
        assertEq(uint8(market.getListing(listingId).status), uint8(Types.ListingStatus.Sold));
    }

    function test_buyListing_partialPurchase() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(bob);
        market.buyListing(listingId, 40 ether);

        assertEq(token.balanceOf(bob), 40 ether);
        // Listing still active with remaining tokens
        Types.Listing memory l = market.getListing(listingId);
        assertEq(uint8(l.status),    uint8(Types.ListingStatus.Active));
        assertEq(l.tokenAmount, 60 ether);
    }

    function test_buyListing_emitsEvent() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 totalCost = _cost(50 ether);
        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(market));
        emit ListingPurchased(listingId, bob, 50 ether, totalCost);
        market.buyListing(listingId, 50 ether);
    }

    function test_revert_buyListing_notKYC() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        address eve = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__NotKYCVerified.selector, eve));
        market.buyListing(listingId, 10 ether);
    }

    function test_revert_buyListing_zeroAmount() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(bob);
        vm.expectRevert(Marketplace__ZeroAmount.selector);
        market.buyListing(listingId, 0);
    }

    function test_revert_buyListing_notFound() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__ListingNotFound.selector, 999));
        market.buyListing(999, 10 ether);
    }

    function test_revert_buyListing_alreadySold() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(bob);
        market.buyListing(listingId, 100 ether); // fully buy out

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__ListingNotActive.selector, listingId));
        market.buyListing(listingId, 1 ether);
    }

    // ─── cancelListing ───────────────────────────────────────────────────────

    function test_cancelListing_returnsTokensToSeller() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        market.cancelListing(listingId);

        assertEq(token.balanceOf(alice), aliceBefore + 100 ether);
        assertEq(uint8(market.getListing(listingId).status), uint8(Types.ListingStatus.Cancelled));
    }

    function test_cancelListing_emitsEvent() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(market));
        emit ListingCancelled(listingId, alice);
        market.cancelListing(listingId);
    }

    function test_revert_cancelListing_notSeller() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(bob);
        vm.expectRevert(Marketplace__NotLister.selector);
        market.cancelListing(listingId);
    }

    function test_revert_cancelListing_alreadyCancelled() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(alice);
        market.cancelListing(listingId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__ListingNotActive.selector, listingId));
        market.cancelListing(listingId);
    }

    // ─── pause / unpause ─────────────────────────────────────────────────────

    function test_pause_blocksCreateListing() public {
        vm.prank(admin);
        market.pause();

        vm.prank(alice);
        vm.expectRevert();
        market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);
    }

    function test_pause_blocksBuyListing() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(admin);
        market.pause();

        vm.prank(bob);
        vm.expectRevert();
        market.buyListing(listingId, 10 ether);
    }

    function test_unpause_resumesTrading() public {
        vm.prank(admin);
        market.pause();

        vm.prank(admin);
        market.unpause();

        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);
        assertEq(uint8(market.getListing(listingId).status), uint8(Types.ListingStatus.Active));
    }

    // ─── protocol fee ────────────────────────────────────────────────────────

    function test_fee_deductedFromSellerPayment() public {
        address collector = makeAddr("collector");
        vm.startPrank(admin);
        market.setFeeCollector(collector);
        market.setFee(200); // 2%
        vm.stopPrank();

        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceBefore     = usdc.balanceOf(alice);
        uint256 collectorBefore = usdc.balanceOf(collector);

        vm.prank(bob);
        market.buyListing(listingId, 100 ether);

        uint256 totalCost = _cost(100 ether);
        uint256 fee       = (totalCost * 200) / 10_000;

        assertEq(usdc.balanceOf(collector),   collectorBefore + fee);
        assertEq(usdc.balanceOf(alice),       aliceBefore + totalCost - fee);
    }

    function test_fee_emitsProtocolFeeCollected() public {
        address collector = makeAddr("collector");
        vm.startPrank(admin);
        market.setFeeCollector(collector);
        market.setFee(100); // 1%
        vm.stopPrank();

        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 totalCost = _cost(100 ether);
        uint256 fee       = (totalCost * 100) / 10_000;

        vm.prank(bob);
        vm.expectEmit(true, false, false, true, address(market));
        emit ProtocolFeeCollected(listingId, fee);
        market.buyListing(listingId, 100 ether);
    }

    function test_fee_zeroFeeBps_noFeeCharged() public {
        // feeBps == 0 by default — full payment goes to seller
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(bob);
        market.buyListing(listingId, 100 ether);

        assertEq(usdc.balanceOf(alice), aliceBefore + _cost(100 ether));
    }

    function test_setFee_updatesFeeBps() public {
        vm.startPrank(admin);
        market.setFeeCollector(makeAddr("collector"));
        market.setFee(500);
        vm.stopPrank();
        assertEq(market.feeBps(), 500);
    }

    /// @dev A fee with no collector would be silently skipped in buyListing(), so arming
    ///      one is rejected rather than quietly dropping protocol revenue.
    function test_revert_setFee_withoutCollector() public {
        assertEq(market.feeCollector(), address(0));
        vm.prank(admin);
        vm.expectRevert(Marketplace__ZeroFeeCollector.selector);
        market.setFee(500);
    }

    function test_setFee_toZero_allowedWithoutCollector() public {
        vm.prank(admin);
        market.setFee(0);
        assertEq(market.feeBps(), 0);
    }

    function test_setFee_emitsFeeUpdated() public {
        vm.startPrank(admin);
        market.setFeeCollector(makeAddr("collector"));
        vm.expectEmit(false, false, false, true, address(market));
        emit FeeUpdated(300);
        market.setFee(300);
        vm.stopPrank();
    }

    function test_revert_setFee_tooHigh() public {
        vm.expectRevert(
            abi.encodeWithSelector(Marketplace__FeeTooHigh.selector, uint16(1001), market.MAX_FEE_BPS())
        );
        vm.prank(admin);
        market.setFee(1001);
    }

    function test_setFeeCollector_updatesCollector() public {
        address collector = makeAddr("collector");
        vm.prank(admin);
        market.setFeeCollector(collector);
        assertEq(market.feeCollector(), collector);
    }

    function test_setFeeCollector_emitsFeeCollectorUpdated() public {
        address collector = makeAddr("collector");
        vm.prank(admin);
        vm.expectEmit(true, false, false, false, address(market));
        emit FeeCollectorUpdated(collector);
        market.setFeeCollector(collector);
    }

    function test_revert_setFeeCollector_zeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(Marketplace__ZeroFeeCollector.selector);
        market.setFeeCollector(address(0));
    }

    // ─── listing expiry ──────────────────────────────────────────────────────

    function test_buyListing_beforeExpiry_succeeds() public {
        uint48 expiry = uint48(block.timestamp + 1 days);
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, expiry);

        vm.prank(bob);
        market.buyListing(listingId, 10 ether);
        assertEq(token.balanceOf(bob), 10 ether);
    }

    function test_revert_buyListing_afterExpiry() public {
        uint48 expiry = uint48(block.timestamp + 1 hours);
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, expiry);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace__ListingExpired.selector, listingId));
        market.buyListing(listingId, 10 ether);
    }

    function test_buyListing_zeroExpiry_neverExpires() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.warp(block.timestamp + 365 days);

        vm.prank(bob);
        market.buyListing(listingId, 10 ether);
        assertEq(token.balanceOf(bob), 10 ether);
    }

    function test_createListing_storesExpiresAt() public {
        uint48 expiry = uint48(block.timestamp + 7 days);
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, expiry);
        assertEq(market.getListing(listingId).expiresAt, expiry);
    }

    // ─── Price unit ──────────────────────────────────────────────────────────

    /// @dev The bug this scaling fixes: cost was `amount * pricePerToken` with `amount` in
    ///      18-decimal wei, so a realistic per-token price had to be expressed as a
    ///      fraction below 1 and truncated to zero — and zero is rejected as ZeroPrice.
    ///      A $50 USDC-denominated token is now a plain, expressible number.
    function test_realisticPrice_isExpressibleAndCharged() public {
        uint256 priceUsdc = 50e6; // $50.00 at USDC's 6 decimals

        // Under the old per-wei unit this price would have had to be 50e6/1e18 → 0.
        assertEq(priceUsdc / 1e18, uint256(0), "old unit could not express this price");

        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 10 ether, priceUsdc, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(bob);
        market.buyListing(listingId, 2 ether); // buy 2 whole tokens

        // 2 tokens x $50 = $100.00
        assertEq(usdc.balanceOf(alice), aliceBefore + 100e6);
        assertEq(token.balanceOf(bob), 2 ether);
    }

    /// @dev Cost rounds up, so a dust purchase can never be free.
    function test_dustPurchase_isNotFree() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(bob);
        market.buyListing(listingId, 1); // one wei of a token

        uint256 paid = usdc.balanceOf(alice) - aliceBefore;
        assertGt(paid, 0, "dust must still cost something");
        assertEq(paid, _cost(1));
    }

    function test_partialBuy_costMatchesProportion() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(bob);
        market.buyListing(listingId, 30 ether);

        assertEq(usdc.balanceOf(alice), aliceBefore + _cost(30 ether));
        assertEq(market.getListing(listingId).tokenAmount, 70 ether);
        assertEq(uint8(market.getListing(listingId).status), uint8(Types.ListingStatus.Active));
    }

    /// @dev Buying more than the listing holds used to fail on an arithmetic underflow panic.
    function test_revert_buyListing_moreThanListed() public {
        vm.prank(alice);
        uint256 listingId = market.createListing(propertyId, 100 ether, PRICE_PER_TOK, 0);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                Marketplace__InsufficientListingAmount.selector, listingId, 101 ether, 100 ether
            )
        );
        market.buyListing(listingId, 101 ether);
    }
}
