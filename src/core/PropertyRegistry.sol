// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IPropertyRegistry} from "../interfaces/IPropertyRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    PropertyRegistry__NotAdmin,
    PropertyRegistry__PropertyNotFound,
    PropertyRegistry__InvalidMetadataURI,
    PropertyRegistry__InvalidSupply,
    PropertyRegistry__NotPropertyOwner,
    PropertyRegistry__InvalidStatus
} from "../utils/Errors.sol";
import {PropertyLegalDetailsUpdated} from "../utils/Events.sol";

/// @title PropertyRegistry
/// @notice Central registry for all tokenized real-estate properties with a structured
///         issuance lifecycle: Draft → UnderReview → Approved → OfferingOpen →
///         OfferingClosed → Trading (with Paused and Delisted as terminal/emergency states).
contract PropertyRegistry is IPropertyRegistry, Initializable, AccessControl, UUPSUpgradeable {
    bytes32 public constant PROPERTY_ADMIN_ROLE = keccak256("PROPERTY_ADMIN_ROLE");

    /// @dev Auto-incrementing property ID counter (starts at 1)
    uint256 private _nextPropertyId;

    /// @dev propertyId => Property data
    mapping(uint256 => Types.Property) private _properties;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROPERTY_ADMIN_ROLE, admin);
        _nextPropertyId = 1;
    }

    // ─── IPropertyRegistry ───────────────────────────────────────────────────

    /// @inheritdoc IPropertyRegistry
    function registerProperty(
        string calldata metadataURI,
        uint256 totalSupply,
        uint256 pricePerToken,
        address spvAddress,
        bytes32 legalHash,
        uint16  jurisdiction
    ) external onlyRole(PROPERTY_ADMIN_ROLE) returns (uint256 propertyId) {
        if (bytes(metadataURI).length == 0) revert PropertyRegistry__InvalidMetadataURI();
        if (totalSupply == 0) revert PropertyRegistry__InvalidSupply();

        propertyId = _nextPropertyId++;

        _properties[propertyId] = Types.Property({
            propertyId:      propertyId,
            owner:           msg.sender,
            metadataURI:     metadataURI,
            totalSupply:     totalSupply,
            pricePerToken:   pricePerToken,
            status:          Types.PropertyStatus.Draft,
            createdAt:       block.timestamp,
            tokenAddress:    address(0),
            offeringContract: address(0),
            spvAddress:      spvAddress,
            legalHash:       legalHash,
            jurisdiction:    jurisdiction
        });

        emit PropertyRegistered(propertyId, msg.sender, metadataURI, totalSupply);
    }

    /// @inheritdoc IPropertyRegistry
    function updateMetadata(
        uint256 propertyId,
        string calldata newURI
    ) external {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.owner != msg.sender && !hasRole(PROPERTY_ADMIN_ROLE, msg.sender)) {
            revert PropertyRegistry__NotPropertyOwner(propertyId);
        }
        if (bytes(newURI).length == 0) revert PropertyRegistry__InvalidMetadataURI();

        prop.metadataURI = newURI;
        emit PropertyMetadataUpdated(propertyId, newURI);
    }

    /// @inheritdoc IPropertyRegistry
    function updateLegalDetails(
        uint256 propertyId,
        address spvAddress,
        bytes32 legalHash,
        uint16  jurisdiction
    ) external {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.owner != msg.sender && !hasRole(PROPERTY_ADMIN_ROLE, msg.sender)) {
            revert PropertyRegistry__NotPropertyOwner(propertyId);
        }
        prop.spvAddress   = spvAddress;
        prop.legalHash    = legalHash;
        prop.jurisdiction = jurisdiction;
        emit PropertyLegalDetailsUpdated(propertyId, spvAddress, legalHash, jurisdiction);
    }

    // ─── Lifecycle transitions ────────────────────────────────────────────────

    /// @inheritdoc IPropertyRegistry
    function submitForReview(uint256 propertyId) external {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.owner != msg.sender) revert PropertyRegistry__NotPropertyOwner(propertyId);
        if (prop.status != Types.PropertyStatus.Draft) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.UnderReview));
        prop.status = Types.PropertyStatus.UnderReview;
    }

    /// @inheritdoc IPropertyRegistry
    function approveProperty(uint256 propertyId) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.status != Types.PropertyStatus.UnderReview) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.Approved));
        prop.status = Types.PropertyStatus.Approved;
    }

    /// @inheritdoc IPropertyRegistry
    function openOffering(uint256 propertyId, address offeringContract) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.status != Types.PropertyStatus.Approved) revert PropertyRegistry__InvalidStatus(propertyId);
        prop.offeringContract = offeringContract;
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.OfferingOpen));
        prop.status = Types.PropertyStatus.OfferingOpen;
    }

    /// @inheritdoc IPropertyRegistry
    function closeOffering(uint256 propertyId) external {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (!hasRole(PROPERTY_ADMIN_ROLE, msg.sender) && msg.sender != prop.offeringContract) {
            revert PropertyRegistry__NotAdmin();
        }
        if (prop.status != Types.PropertyStatus.OfferingOpen) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.OfferingClosed));
        prop.status = Types.PropertyStatus.OfferingClosed;
    }

    /// @inheritdoc IPropertyRegistry
    function openTrading(uint256 propertyId) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.status != Types.PropertyStatus.OfferingClosed) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.Trading));
        prop.status = Types.PropertyStatus.Trading;
    }

    /// @inheritdoc IPropertyRegistry
    function pauseProperty(uint256 propertyId) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        Types.PropertyStatus s = prop.status;
        if (
            s == Types.PropertyStatus.None    ||
            s == Types.PropertyStatus.Draft   ||
            s == Types.PropertyStatus.Paused  ||
            s == Types.PropertyStatus.Delisted
        ) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(s), uint8(Types.PropertyStatus.Paused));
        prop.status = Types.PropertyStatus.Paused;
    }

    /// @inheritdoc IPropertyRegistry
    function delistProperty(uint256 propertyId) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        if (prop.status == Types.PropertyStatus.Delisted) revert PropertyRegistry__InvalidStatus(propertyId);
        emit PropertyStatusUpdated(propertyId, uint8(prop.status), uint8(Types.PropertyStatus.Delisted));
        prop.status = Types.PropertyStatus.Delisted;
    }

    // ─── Views / setters ─────────────────────────────────────────────────────

    /// @inheritdoc IPropertyRegistry
    function getProperty(uint256 propertyId) external view returns (Types.Property memory) {
        return _getExistingProperty(propertyId);
    }

    /// @inheritdoc IPropertyRegistry
    function totalProperties() external view returns (uint256) {
        return _nextPropertyId - 1;
    }

    /// @inheritdoc IPropertyRegistry
    function setTokenAddress(uint256 propertyId, address tokenAddr) external onlyRole(PROPERTY_ADMIN_ROLE) {
        Types.Property storage prop = _getExistingProperty(propertyId);
        prop.tokenAddress = tokenAddr;
    }

    /// @inheritdoc IPropertyRegistry
    function getPropertyToken(uint256 propertyId) external view returns (address) {
        return _getExistingProperty(propertyId).tokenAddress;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _getExistingProperty(
        uint256 propertyId
    ) internal view returns (Types.Property storage prop) {
        prop = _properties[propertyId];
        if (prop.createdAt == 0) revert PropertyRegistry__PropertyNotFound(propertyId);
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(PROPERTY_ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}

