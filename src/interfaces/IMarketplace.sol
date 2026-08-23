// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "../utils/Types.sol";

/// @title IMarketplace
/// @notice Secondary market for trading fractional property tokens
interface IMarketplace {
    /// @notice Create a new sell listing
    /// @param propertyId  The property whose tokens are being sold
    /// @param tokenAmount Number of fractional tokens to list
    /// @param pricePerToken Asking price in payment-token units per ONE WHOLE property
    ///                      token (1e18 token wei). Same unit as PropertyOffering.
    ///                      e.g. USDC at $50.00/token → 50_000_000
    /// @param expiresAt   Unix timestamp after which the listing expires (0 = no expiry)
    /// @return listingId The ID of the new listing
    function createListing(
        uint256 propertyId,
        uint256 tokenAmount,
        uint256 pricePerToken,
        uint48  expiresAt
    ) external returns (uint256 listingId);

    /// @notice Buy tokens from an active listing
    /// @param listingId The listing to purchase from
    /// @param amount    Token wei to buy (≤ listing.tokenAmount). Cost is
    ///                  `amount * pricePerToken / 1e18`, rounded up.
    function buyListing(uint256 listingId, uint256 amount) external;

    /// @notice Cancel an active listing (seller only)
    function cancelListing(uint256 listingId) external;

    /// @notice Returns full listing data
    function getListing(uint256 listingId) external view returns (Types.Listing memory);

    /// @notice Set protocol fee in basis points (max 1000 = 10%). ADMIN_ROLE only.
    function setFee(uint16 newFeeBps) external;

    /// @notice Set the address that receives protocol fees. ADMIN_ROLE only.
    function setFeeCollector(address newCollector) external;
}
