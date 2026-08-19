// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPropertyOffering
/// @notice Interface for a primary-sale offering contract that handles token issuance,
///         escrow, soft/hard cap enforcement, lockup, and refunds.
interface IPropertyOffering {
    /// @notice Invest in the offering by committing `tokenAmount` fractional tokens.
    /// @dev    Transfers the equivalent paymentToken amount from the caller to escrow.
    ///         Requires: KYC verified, offering period active, hardCap not exceeded.
    /// @param tokenAmount Number of property tokens to purchase (in token wei, 18 decimals).
    function invest(uint256 tokenAmount) external;

    /// @notice Finalize the offering once the softCap has been reached.
    ///         Mints tokens to each investor, sets lockups, transfers funds to property
    ///         owner, and calls registry.closeOffering().
    function finalizeOffering() external;

    /// @notice Cancel the offering (callable by admin when softCap is not reached by endTime).
    ///         Investors may call refund() after cancellation.
    function cancelOffering() external;

    /// @notice Refund the caller's escrowed paymentToken after the offering is cancelled.
    function refund() external;

    /// @notice Returns the lockup expiry timestamp for an investor (0 if not finalized/set).
    function getLockupExpiry(address investor) external view returns (uint256);

    /// @notice Returns the token amount committed by an investor.
    function getInvestment(address investor) external view returns (uint256);

    /// @notice Total token amount committed across all investors.
    function totalTokensCommitted() external view returns (uint256);

    /// @notice Whether the offering has been finalized.
    function finalized() external view returns (bool);

    /// @notice Whether the offering has been cancelled.
    function cancelled() external view returns (bool);
}
