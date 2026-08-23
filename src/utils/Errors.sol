// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── PropertyRegistry ───────────────────────────────────────────────────────
error PropertyRegistry__NotAdmin();
error PropertyRegistry__PropertyNotFound(uint256 propertyId);
error PropertyRegistry__PropertyAlreadyExists(uint256 propertyId);
error PropertyRegistry__InvalidMetadataURI();
error PropertyRegistry__InvalidSupply();
error PropertyRegistry__NotPropertyOwner(uint256 propertyId);
error PropertyRegistry__InvalidStatus(uint256 propertyId);

// ─── PropertyToken ──────────────────────────────────────────────────────────
error PropertyToken__NotMinter();
error PropertyToken__NotRegistry();
error PropertyToken__ExceedsMaxSupply(uint256 propertyId, uint256 requested, uint256 available);
error PropertyToken__ZeroAddress();
error PropertyToken__ZeroAmount();
error PropertyToken__TransferNotAllowed();
error PropertyToken__TransferLocked(address investor, uint256 lockupExpiry);

// ─── KYCRegistry ────────────────────────────────────────────────────────────
error KYCRegistry__NotAdmin();
error KYCRegistry__AlreadyVerified(address account);
error KYCRegistry__NotVerified(address account);
error KYCRegistry__AccountFrozen(address account);
error KYCRegistry__KYCExpired(address account);
error KYCRegistry__BatchLengthMismatch();

// ─── Marketplace ────────────────────────────────────────────────────────────
error Marketplace__NotLister();
error Marketplace__ListingNotFound(uint256 listingId);
error Marketplace__ListingNotActive(uint256 listingId);
error Marketplace__InsufficientPayment(uint256 required, uint256 provided);
error Marketplace__NotKYCVerified(address account);
error Marketplace__ZeroAmount();
error Marketplace__ZeroPrice();
error Marketplace__ListingExpired(uint256 listingId);
error Marketplace__FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
error Marketplace__ZeroFeeCollector();
error Marketplace__InsufficientListingAmount(uint256 listingId, uint256 requested, uint256 available);

// ─── PropertyFactory ────────────────────────────────────────────────────────
error PropertyFactory__PropertyAlreadyDeployed(uint256 propertyId);
error PropertyFactory__PropertyNotDeployed(uint256 propertyId);

// ─── RentDistributor ────────────────────────────────────────────────────────
error RentDistributor__NotPropertyOwner(uint256 propertyId);
error RentDistributor__NoPeriodFound(uint256 propertyId, uint256 periodId);
error RentDistributor__AlreadyClaimed(uint256 propertyId, uint256 periodId, address claimant);
error RentDistributor__ZeroRent();
error RentDistributor__InvalidProof();
error RentDistributor__ReclaimTooEarly(uint256 propertyId, uint256 periodId, uint256 deadline);
error RentDistributor__ExceedsTotalRent(uint256 propertyId, uint256 periodId);
error RentDistributor__ArrayLengthMismatch();
error RentDistributor__InvalidSnapshotBlock(uint256 snapshotBlock);
error RentDistributor__ExceedsEntitlement(
    uint256 propertyId, uint256 periodId, address claimant, uint256 claimed, uint256 maxEntitlement
);
error RentDistributor__NothingToReclaim(uint256 propertyId, uint256 periodId);
error RentDistributor__ZeroMerkleRoot();
error RentDistributor__NoTokenForProperty(uint256 propertyId);
error RentDistributor__EmptySnapshot(uint256 snapshotBlock);
error RentDistributor__PeriodReclaimed(uint256 propertyId, uint256 periodId);

// ─── PriceOracle ────────────────────────────────────────────────────────────
error PriceOracle__StalePrice(uint256 propertyId, uint256 lastUpdated);
error PriceOracle__NotUpdater();
error PriceOracle__ZeroPrice();

// ─── PropertyOffering ───────────────────────────────────────────────────────
error PropertyOffering__HardCapReached();
error PropertyOffering__OfferingNotActive();
error PropertyOffering__SoftCapNotReached();
error PropertyOffering__AlreadyFinalized();
error PropertyOffering__NotCancelled();
error PropertyOffering__NotFinalized();
error PropertyOffering__AlreadyCancelled();
error PropertyOffering__NothingToClaim(address investor);
error PropertyOffering__TokensAlreadyClaimed(address investor);
error PropertyOffering__OfferingNotEnded();
error PropertyOffering__SoftCapAlreadyReached();
error PropertyOffering__ZeroAddress();
error PropertyOffering__ZeroAmount();
error PropertyOffering__InvalidPrice();
error PropertyOffering__InvalidCaps(uint256 softCap, uint256 hardCap);
error PropertyOffering__InvalidTimeWindow(uint256 startTime, uint256 endTime);
error PropertyOffering__HardCapExceedsMaxSupply(uint256 hardCap, uint256 maxSupply);

// ─── IdentityRegistry ────────────────────────────────────────────────────────
error IdentityRegistry__IdentityAlreadyExists(address wallet);
error IdentityRegistry__IdentityNotFound(address wallet);
error IdentityRegistry__ZeroAddress();

// ─── TrustedIssuersRegistry ──────────────────────────────────────────────────
error TrustedIssuersRegistry__IssuerAlreadyTrusted(address issuer);
error TrustedIssuersRegistry__IssuerNotFound(address issuer);
error TrustedIssuersRegistry__ZeroAddress();
error TrustedIssuersRegistry__EmptyClaimTopics();

// ─── ClaimTopicsRegistry ─────────────────────────────────────────────────────
error ClaimTopicsRegistry__TopicAlreadyExists(uint256 topic);
error ClaimTopicsRegistry__TopicNotFound(uint256 topic);

// ─── ComplianceModule ────────────────────────────────────────────────────────
error ComplianceModule__TokenNotRegistered(address tokenAddr);
error ComplianceModule__TokenAlreadyRegistered(address tokenAddr);
error ComplianceModule__TransferDenied(string reason);
