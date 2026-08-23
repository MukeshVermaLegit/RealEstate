// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── PropertyRegistry ───────────────────────────────────────────────────────
event PropertyRegistered(uint256 indexed propertyId, address indexed owner, string metadataURI, uint256 totalSupply);
event PropertyStatusUpdated(uint256 indexed propertyId, uint8 oldStatus, uint8 newStatus);
event PropertyMetadataUpdated(uint256 indexed propertyId, string newURI);
event PropertyLegalDetailsUpdated(
    uint256 indexed propertyId, address spvAddress, bytes32 legalHash, uint16 jurisdiction
);
/// @notice A Draft listing's supply / price per token were revised before submission.
event PropertyOfferingTermsUpdated(uint256 indexed propertyId, uint256 totalSupply, uint256 pricePerToken);
/// @notice An admin sent a submitted listing back to Draft with feedback for the owner.
event PropertySubmissionRejected(uint256 indexed propertyId, string reason);

// ─── PropertyToken ──────────────────────────────────────────────────────────
event PropertyTokensMinted(uint256 indexed propertyId, address indexed to, uint256 amount);
event PropertyTokensBurned(uint256 indexed propertyId, address indexed from, uint256 amount);
event ForcedTransfer(address indexed from, address indexed to, uint256 amount, uint256 indexed propertyId);

// ─── PropertyFactory ────────────────────────────────────────────────────────
event PropertyTokenDeployed(uint256 indexed propertyId, address tokenAddress);

// ─── KYCRegistry ────────────────────────────────────────────────────────────
event AccountVerified(
    address indexed account,
    address indexed verifiedBy,
    uint16 countryCode,
    uint8 investorType,
    uint48 expiresAt,
    uint256 timestamp
);
event AccountRevoked(address indexed account, address indexed revokedBy, uint256 timestamp);
event AccountFrozen(address indexed account);
event AccountUnfrozen(address indexed account);

// ─── Marketplace ────────────────────────────────────────────────────────────
event ListingCreated(
    uint256 indexed listingId,
    uint256 indexed propertyId,
    address indexed seller,
    uint256 amount,
    uint256 pricePerToken,
    uint48 expiresAt
);
event ListingPurchased(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalPaid);
event ListingCancelled(uint256 indexed listingId, address indexed seller);
event FeeUpdated(uint16 newFeeBps);
event FeeCollectorUpdated(address indexed newCollector);
event ProtocolFeeCollected(uint256 indexed listingId, uint256 feeAmount);

// ─── RentDistributor ────────────────────────────────────────────────────────
event RentDeposited(uint256 indexed propertyId, uint256 indexed periodId, uint256 amount, bytes32 merkleRoot);
event RentClaimed(uint256 indexed propertyId, uint256 indexed periodId, address indexed claimant, uint256 amount);
event UnclaimedRentReclaimed(uint256 indexed propertyId, uint256 indexed periodId, uint256 amount);

// ─── PriceOracle ────────────────────────────────────────────────────────────
event PriceUpdated(uint256 indexed propertyId, uint256 newPrice, uint256 timestamp);

// ─── IdentityRegistry ────────────────────────────────────────────────────────
event IdentityRegistered(address indexed wallet, uint16 countryCode, bytes32 identityHash);
event IdentityDeleted(address indexed wallet);
event IdentityCountryUpdated(address indexed wallet, uint16 oldCountry, uint16 newCountry);

// ─── TrustedIssuersRegistry ──────────────────────────────────────────────────
event TrustedIssuerAdded(address indexed issuer, uint256[] claimTopics);
event TrustedIssuerRemoved(address indexed issuer);
event TrustedIssuerTopicsUpdated(address indexed issuer, uint256[] claimTopics);

// ─── ClaimTopicsRegistry ─────────────────────────────────────────────────────
event ClaimTopicAdded(uint256 indexed topic);
event ClaimTopicRemoved(uint256 indexed topic);

// ─── ComplianceModule ────────────────────────────────────────────────────────
event TokenComplianceAdded(address indexed tokenAddr);
event TokenComplianceUpdated(address indexed tokenAddr);
event HolderCountUpdated(address indexed tokenAddr, uint256 newCount);

// ─── PropertyOffering ───────────────────────────────────────────────────────
event InvestmentMade(uint256 indexed propertyId, address indexed investor, uint256 tokenAmount, uint256 paymentAmount);
event OfferingFinalized(uint256 indexed propertyId, address indexed offeringContract, uint256 totalRaised);
event OfferingCancelled(uint256 indexed propertyId, address indexed offeringContract);
event InvestorRefunded(uint256 indexed propertyId, address indexed investor, uint256 refundAmount);
event OfferingTokensClaimed(
    uint256 indexed propertyId, address indexed investor, uint256 tokenAmount, uint256 lockupExpiry
);
