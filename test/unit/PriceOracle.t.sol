// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {PriceOracle__StalePrice, PriceOracle__ZeroPrice} from "../../src/utils/Errors.sol";
import {PriceUpdated} from "../../src/utils/Events.sol";

contract PriceOracleTest is Test {
    PriceOracle internal oracle;

    address internal admin = makeAddr("admin");
    address internal updater = makeAddr("updater");
    address internal alice = makeAddr("alice");

    uint256 internal constant PROPERTY_ID = 1;
    uint256 internal constant PRICE = 500e18; // $500 per token

    function setUp() public {
        vm.startPrank(admin);
        PriceOracle impl = new PriceOracle();
        oracle = PriceOracle(address(new ERC1967Proxy(address(impl), abi.encodeCall(PriceOracle.initialize, (admin)))));
        oracle.grantRole(oracle.UPDATER_ROLE(), updater);
        vm.stopPrank();
    }

    // ─── Upgrade test ────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        vm.prank(admin);
        PriceOracle newImpl = new PriceOracle();
        vm.prank(admin);
        oracle.upgradeToAndCall(address(newImpl), "");

        (uint256 price,) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE);
    }

    function test_revert_upgrade_notAdmin() public {
        vm.prank(alice);
        PriceOracle newImpl = new PriceOracle();
        vm.prank(alice);
        vm.expectRevert();
        oracle.upgradeToAndCall(address(newImpl), "");
    }

    // ─── updatePrice ─────────────────────────────────────────────────────────

    function test_updatePrice_storesPrice() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        (uint256 price, uint256 lastUpdated) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE);
        assertEq(lastUpdated, block.timestamp);
    }

    function test_updatePrice_emitsEvent() public {
        vm.prank(updater);
        vm.expectEmit(true, false, false, true, address(oracle));
        emit PriceUpdated(PROPERTY_ID, PRICE, block.timestamp);
        oracle.updatePrice(PROPERTY_ID, PRICE);
    }

    function test_updatePrice_adminCanAlsoUpdate() public {
        vm.prank(admin);
        oracle.updatePrice(PROPERTY_ID, PRICE);
        (uint256 price,) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE);
    }

    function test_updatePrice_overwritesPreviousPrice() public {
        vm.startPrank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);
        oracle.updatePrice(PROPERTY_ID, PRICE * 2);
        vm.stopPrank();

        (uint256 price,) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE * 2);
    }

    function test_revert_updatePrice_zero() public {
        vm.prank(updater);
        vm.expectRevert(PriceOracle__ZeroPrice.selector);
        oracle.updatePrice(PROPERTY_ID, 0);
    }

    function test_revert_updatePrice_notUpdater() public {
        bytes32 role = oracle.UPDATER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        oracle.updatePrice(PROPERTY_ID, PRICE);
    }

    // ─── getPrice ────────────────────────────────────────────────────────────

    function test_getPrice_freshPrice() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        (uint256 price, uint256 ts) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE);
        assertEq(ts, block.timestamp);
    }

    function test_revert_getPrice_stale() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        // Warp past MAX_STALENESS (7 days)
        vm.warp(block.timestamp + oracle.MAX_STALENESS() + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                PriceOracle__StalePrice.selector, PROPERTY_ID, block.timestamp - oracle.MAX_STALENESS() - 1
            )
        );
        oracle.getPrice(PROPERTY_ID);
    }

    function test_revert_getPrice_neverSet_isStale() public {
        // Price was never set — lastUpdated = 0. Warp past MAX_STALENESS so the check triggers.
        vm.warp(oracle.MAX_STALENESS() + 1);
        vm.expectRevert();
        oracle.getPrice(PROPERTY_ID);
    }

    function test_getPrice_exactlyAtStalenessLimit_notStale() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        // Warp to exactly MAX_STALENESS — should NOT be stale (block.timestamp - lastUpdated == MAX_STALENESS, not >)
        vm.warp(block.timestamp + oracle.MAX_STALENESS());

        (uint256 price,) = oracle.getPrice(PROPERTY_ID);
        assertEq(price, PRICE);
    }

    // ─── getPriceUnsafe ──────────────────────────────────────────────────────

    function test_getPriceUnsafe_returnsEvenIfStale() public {
        vm.prank(updater);
        oracle.updatePrice(PROPERTY_ID, PRICE);

        vm.warp(block.timestamp + oracle.MAX_STALENESS() + 1 days);

        (uint256 price,) = oracle.getPriceUnsafe(PROPERTY_ID);
        assertEq(price, PRICE);
    }

    function test_getPriceUnsafe_returnsZeroIfNeverSet() public view {
        (uint256 price, uint256 ts) = oracle.getPriceUnsafe(PROPERTY_ID);
        assertEq(price, 0);
        assertEq(ts, 0);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_updatePrice(uint256 propertyId, uint256 price) public {
        vm.assume(price > 0);
        vm.prank(updater);
        oracle.updatePrice(propertyId, price);
        (uint256 stored,) = oracle.getPrice(propertyId);
        assertEq(stored, price);
    }
}
