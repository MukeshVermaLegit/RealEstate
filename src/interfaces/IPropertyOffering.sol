// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPropertyOffering
/// @notice Interface for a primary-sale offering contract that handles token issuance,
///         escrow, soft/hard cap enforcement, lockup, and refunds.
///         `pricePerToken` is payment-token units per ONE WHOLE property token (1e18 wei).
interface IPropertyOffering {
    /// @notice Invest in the offering by committing `tokenAmount` fractional tokens.
    /// @dev    Transfers the equivalent paymentToken amount from the caller to escrow.
    ///         Requires: KYC verified, offering period active, hardCap not exceeded.
    /// @param tokenAmount Number of property tokens to purchase (in token wei, 18 decimals).
    function invest(uint256 tokenAmount) external;

    /// @notice Finalize the offering once the softCap has been reached. O(1) — transfers all
    ///         escrow to the property owner and fixes the lockup expiry. Investors then mint
    ///         their own allocation via claimTokens(). ADMIN_ROLE only.
    function finalizeOffering() external;

    /// @notice Mint the caller's committed allocation and apply the lockup. Requires the
    ///         offering to be finalized; callable once per investor.
    function claimTokens() external;

    /// @notice Mint allocations on behalf of investors who have not claimed. Anyone may call;
    ///         gas is bounded by the batch size the caller chooses.
    function claimTokensFor(address[] calldata investors) external;

    /// @notice Cancel the offering (callable by admin at any time before finalization).
    ///         Investors may call refund() after cancellation.
    function cancelOffering() external;

    /// @notice Permissionless failure path — open refunds once endTime has passed with the
    ///         soft cap unmet, so escrow never depends on admin liveness.
    function expireOffering() external;

    /// @notice Refund the caller's escrowed paymentToken after the offering is cancelled.
    function refund() external;

    /// @notice Returns the lockup expiry timestamp for an investor (0 if not finalized/set).
    function getLockupExpiry(address investor) external view returns (uint256);

    /// @notice Returns the token amount committed by an investor.
    function getInvestment(address investor) external view returns (uint256);

    /// @notice Whether an investor has already minted their allocation.
    function hasClaimedTokens(address investor) external view returns (bool);

    /// @notice Number of distinct investors (for off-chain enumeration / batch claiming).
    function investorCount() external view returns (uint256);

    /// @notice Investor address at `index` in commitment order.
    function investorAt(uint256 index) external view returns (address);

    /// @notice Running sum of escrowed paymentToken across all investors.
    function totalPaymentsReceived() external view returns (uint256);

    /// @notice Lockup expiry applied to all investors, fixed at finalization (0 before).
    function lockupExpiry() external view returns (uint256);

    /// @notice Total token amount committed across all investors.
    function totalTokensCommitted() external view returns (uint256);

    /// @notice Whether the offering has been finalized.
    function finalized() external view returns (bool);

    /// @notice Whether the offering has been cancelled.
    function cancelled() external view returns (bool);
}
