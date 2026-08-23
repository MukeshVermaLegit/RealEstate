// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IPropertyFactory} from "../interfaces/IPropertyFactory.sol";
import {IPropertyRegistry} from "../interfaces/IPropertyRegistry.sol";
import {PropertyToken} from "./PropertyToken.sol";
import {PropertyTokenDeployed} from "../utils/Events.sol";
import {PropertyFactory__PropertyAlreadyDeployed} from "../utils/Errors.sol";

/// @title PropertyFactory
/// @notice Deploys per-property ERC-20 token contracts and records them in PropertyRegistry.
contract PropertyFactory is IPropertyFactory, Initializable, AccessControl, UUPSUpgradeable {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");

    /// @dev propertyId => PropertyToken address
    mapping(uint256 => address) private _tokens;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACTORY_ROLE, admin);
    }

    /// @inheritdoc IPropertyFactory
    function createPropertyToken(
        uint256 propertyId,
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        address registryAddr,
        address kycRegistryAddr,
        address complianceModuleAddr
    ) external override onlyRole(FACTORY_ROLE) returns (address tokenAddress) {
        if (_tokens[propertyId] != address(0)) {
            revert PropertyFactory__PropertyAlreadyDeployed(propertyId);
        }

        PropertyToken token = new PropertyToken(
            name,
            symbol,
            propertyId,
            maxSupply,
            msg.sender, // deployer (FACTORY_ROLE holder) becomes admin of the token
            kycRegistryAddr,
            complianceModuleAddr
        );
        tokenAddress = address(token);
        _tokens[propertyId] = tokenAddress;

        // Record in registry so other contracts can look it up
        IPropertyRegistry(registryAddr).setTokenAddress(propertyId, tokenAddress);

        emit PropertyTokenDeployed(propertyId, tokenAddress);
    }

    /// @inheritdoc IPropertyFactory
    function getPropertyToken(uint256 propertyId) external view override returns (address) {
        return _tokens[propertyId];
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}
