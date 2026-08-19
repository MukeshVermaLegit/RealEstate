// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITrustedIssuersRegistry
/// @notice Tracks which off-chain KYC / claim issuers are trusted and which
///         claim topics each issuer is authorised to certify.
interface ITrustedIssuersRegistry {
    /// @notice Register a new trusted issuer with its supported claim topics
    /// @param issuer       Off-chain issuer address (signer key or service wallet)
    /// @param claimTopics  Non-empty list of claim topic IDs this issuer covers
    function addTrustedIssuer(address issuer, uint256[] calldata claimTopics) external;

    /// @notice Remove a previously trusted issuer
    function removeTrustedIssuer(address issuer) external;

    /// @notice Replace the claim topics for an existing trusted issuer
    function updateIssuerTopics(address issuer, uint256[] calldata claimTopics) external;

    /// @notice Returns true iff the address is a registered trusted issuer
    function isTrustedIssuer(address issuer) external view returns (bool);

    /// @notice Returns true iff the issuer is trusted AND covers the given topic
    function hasClaimTopic(address issuer, uint256 topic) external view returns (bool);

    /// @notice Returns all claim topics registered for an issuer
    function getIssuerTopics(address issuer) external view returns (uint256[] memory);
}
