// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PropertyFactory} from "../../src/core/PropertyFactory.sol";
import {PropertyRegistry} from "../../src/core/PropertyRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {PropertyToken} from "../../src/core/PropertyToken.sol";
import {PropertyFactory__PropertyAlreadyDeployed} from "../../src/utils/Errors.sol";
import {PropertyTokenDeployed} from "../../src/utils/Events.sol";

contract PropertyFactoryTest is Test {
    PropertyRegistry internal registry;
    KYCRegistry      internal kyc;
    PropertyFactory  internal factory;

    address internal admin = makeAddr("admin");

    uint256 internal propertyId;
    uint256 internal constant TOTAL_SUPPLY = 1_000 ether;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy via proxies
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

        PropertyFactory factoryImpl = new PropertyFactory();
        factory = PropertyFactory(address(new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(PropertyFactory.initialize, (admin))
        )));

        // Factory needs PROPERTY_ADMIN_ROLE to call registry.setTokenAddress
        registry.grantRole(registry.PROPERTY_ADMIN_ROLE(), address(factory));

        propertyId = registry.registerProperty("ipfs://QmFactory", TOTAL_SUPPLY, 10e18, address(0), bytes32(0), 0);
        vm.stopPrank();
    }

    // ─── Upgrade test ────────────────────────────────────────────────────────

    function test_upgrade_preservesState() public {
        vm.prank(admin);
        address tokenAddr = factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        vm.prank(admin);
        PropertyFactory newImpl = new PropertyFactory();
        vm.prank(admin);
        factory.upgradeToAndCall(address(newImpl), "");

        // State persisted
        assertEq(factory.getPropertyToken(propertyId), tokenAddr);
    }

    function test_revert_upgrade_notAdmin() public {
        address eve = makeAddr("eve");
        vm.prank(eve);
        PropertyFactory newImpl = new PropertyFactory();
        vm.prank(eve);
        vm.expectRevert();
        factory.upgradeToAndCall(address(newImpl), "");
    }

    // ─── createPropertyToken ─────────────────────────────────────────────────

    function test_createPropertyToken_deploysToken() public {
        vm.prank(admin);
        address tokenAddr = factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        assertTrue(tokenAddr != address(0));
        assertEq(factory.getPropertyToken(propertyId), tokenAddr);
    }

    function test_createPropertyToken_setsPropertyInRegistry() public {
        vm.prank(admin);
        address tokenAddr = factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        assertEq(registry.getPropertyToken(propertyId), tokenAddr);
    }

    function test_createPropertyToken_tokenHasCorrectPropertyId() public {
        vm.prank(admin);
        address tokenAddr = factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        assertEq(PropertyToken(tokenAddr).propertyId(), propertyId);
    }

    function test_createPropertyToken_tokenHasCorrectMaxSupply() public {
        vm.prank(admin);
        address tokenAddr = factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        assertEq(PropertyToken(tokenAddr).maxSupply(), TOTAL_SUPPLY);
    }

    function test_createPropertyToken_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false, address(factory));
        emit PropertyTokenDeployed(propertyId, address(0)); // address checked separately
        factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );
    }

    function test_revert_createPropertyToken_alreadyDeployed() public {
        vm.startPrank(admin);
        factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );

        vm.expectRevert(
            abi.encodeWithSelector(PropertyFactory__PropertyAlreadyDeployed.selector, propertyId)
        );
        factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );
        vm.stopPrank();
    }

    function test_revert_createPropertyToken_notFactoryRole() public {
        address eve = makeAddr("eve");
        bytes32 role = factory.FACTORY_ROLE();
        vm.prank(eve);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, eve, role)
        );
        factory.createPropertyToken(
            propertyId, "Factory Token", "FT", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );
    }

    // ─── getPropertyToken ────────────────────────────────────────────────────

    function test_getPropertyToken_returnsZeroForUndeployed() public view {
        assertEq(factory.getPropertyToken(999), address(0));
    }

    function test_createMultipleTokens_differentProperties() public {
        vm.startPrank(admin);
        uint256 propB = registry.registerProperty("ipfs://QmB", TOTAL_SUPPLY, 5e18, address(0), bytes32(0), 0);

        address tokenA = factory.createPropertyToken(
            propertyId, "Token A", "TA", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );
        address tokenB = factory.createPropertyToken(
            propB, "Token B", "TB", TOTAL_SUPPLY, address(registry), address(kyc), address(0)
        );
        vm.stopPrank();

        assertTrue(tokenA != tokenB);
        assertEq(factory.getPropertyToken(propertyId), tokenA);
        assertEq(factory.getPropertyToken(propB), tokenB);
    }
}
