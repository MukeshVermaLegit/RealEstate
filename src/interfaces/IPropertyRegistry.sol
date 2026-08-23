// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "../utils/Types.sol";

/// @title IPropertyRegistry
/// @notice Interface for the on-chain property registry with structured issuance lifecycle
interface IPropertyRegistry {
    /// @notice Register a new real-estate property (created in Draft status).
    /// @dev    Permissionless — the caller becomes the property owner. A Draft cannot take
    ///         investor funds; PROPERTY_ADMIN_ROLE gates every transition beyond UnderReview.
    /// @param metadataURI   IPFS URI containing property documents, images, legal details
    /// @param totalSupply   Number of fractional tokens to be minted for this property
    /// @param pricePerToken Initial price per token in USD (18 decimals)
    /// @param spvAddress    On-chain address of the Special Purpose Vehicle entity (address(0) if not yet incorporated)
    /// @param legalHash     keccak256 of the off-chain legal document package (LLC operating agreement, deed, etc.)
    /// @param jurisdiction  ISO 3166-1 numeric country code of the property's legal jurisdiction (0 if unknown)
    /// @return propertyId   The unique ID assigned to this property
    function registerProperty(
        string calldata metadataURI,
        uint256 totalSupply,
        uint256 pricePerToken,
        address spvAddress,
        bytes32 legalHash,
        uint16 jurisdiction
    ) external returns (uint256 propertyId);

    /// @notice Update the IPFS metadata URI for an existing property.
    /// @dev    Property owner while still in Draft, or PROPERTY_ADMIN_ROLE at any status.
    function updateMetadata(uint256 propertyId, string calldata newURI) external;

    /// @notice Update the on-chain legal details for a property.
    /// @dev    Property owner while still in Draft, or PROPERTY_ADMIN_ROLE at any status.
    /// @param spvAddress   New SPV entity address (use address(0) to clear)
    /// @param legalHash    New keccak256 hash of the legal document package
    /// @param jurisdiction New ISO 3166-1 numeric jurisdiction code
    function updateLegalDetails(uint256 propertyId, address spvAddress, bytes32 legalHash, uint16 jurisdiction) external;

    /// @notice Revise the supply and price of a listing that has not been submitted yet.
    /// @dev    Property owner while still in Draft, or PROPERTY_ADMIN_ROLE at any status.
    ///         Terms are what investors buy against, so they are frozen once review starts.
    function updateOfferingTerms(uint256 propertyId, uint256 totalSupply, uint256 pricePerToken) external;

    // ─── Lifecycle transitions ────────────────────────────────────────────────

    /// @notice Property owner submits for admin review. Draft → UnderReview.
    function submitForReview(uint256 propertyId) external;

    /// @notice Admin approves a property. UnderReview → Approved.
    function approveProperty(uint256 propertyId) external;

    /// @notice Admin sends a submitted listing back to its owner for changes. UnderReview → Draft.
    /// @param reason Feedback shown to the owner; emitted in PropertySubmissionRejected.
    function rejectSubmission(uint256 propertyId, string calldata reason) external;

    /// @notice Admin opens the primary-sale offering. Approved → OfferingOpen.
    ///         Stores the offering contract address in the property record.
    function openOffering(uint256 propertyId, address offeringContract) external;

    /// @notice Close the primary-sale offering. OfferingOpen → OfferingClosed.
    ///         Callable by PROPERTY_ADMIN or the stored offeringContract address.
    function closeOffering(uint256 propertyId) external;

    /// @notice Admin opens secondary-market trading. OfferingClosed → Trading.
    function openTrading(uint256 propertyId) external;

    /// @notice Admin pauses a property (emergency stop). Any active status → Paused.
    function pauseProperty(uint256 propertyId) external;

    /// @notice Admin delists a property permanently. Any status → Delisted.
    function delistProperty(uint256 propertyId) external;

    // ─── Views / setters ─────────────────────────────────────────────────────

    /// @notice Returns full property data
    function getProperty(uint256 propertyId) external view returns (Types.Property memory);

    /// @notice Returns total number of registered properties
    function totalProperties() external view returns (uint256);

    /// @notice Set the ERC-20 token contract address for a property (called by PropertyFactory).
    function setTokenAddress(uint256 propertyId, address tokenAddr) external;

    /// @notice Return the ERC-20 token contract address for a property.
    function getPropertyToken(uint256 propertyId) external view returns (address);
}
