// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IClaimTopicsRegistry
/// @notice Stores the set of claim topics that investors must hold for a token
///         to be considered compliant (e.g. 1=KYC, 2=AML, 3=AccreditedInvestor).
interface IClaimTopicsRegistry {
    /// @notice Add a required claim topic
    /// @param topic  Numeric identifier for the claim topic
    function addClaimTopic(uint256 topic) external;

    /// @notice Remove a previously required claim topic
    function removeClaimTopic(uint256 topic) external;

    /// @notice Returns the full list of required claim topics
    function getClaimTopics() external view returns (uint256[] memory);
}
