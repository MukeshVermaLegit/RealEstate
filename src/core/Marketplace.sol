// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IMarketplace} from "../interfaces/IMarketplace.sol";
import {IPropertyRegistry} from "../interfaces/IPropertyRegistry.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    Marketplace__ListingNotFound,
    Marketplace__ListingNotActive,
    Marketplace__NotKYCVerified,
    Marketplace__ZeroAmount,
    Marketplace__ZeroPrice,
    Marketplace__NotLister,
    Marketplace__ListingExpired,
    Marketplace__FeeTooHigh,
    Marketplace__ZeroFeeCollector
} from "../utils/Errors.sol";

/// @title Marketplace
/// @notice Secondary market allowing KYC-verified investors to buy and sell
///         fractional property tokens for a designated ERC-20 payment token (e.g. USDC).
///         Token addresses are resolved per-listing via PropertyRegistry.
contract Marketplace is IMarketplace, Initializable, ReentrancyGuard, Pausable, AccessControl, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint16  public constant MAX_FEE_BPS = 1000; // 10%
    uint16  public feeBps;
    address public feeCollector;

    IPropertyRegistry public registry;
    IKYCRegistry      public kycRegistry;
    IERC20            public paymentToken;  // e.g. USDC

    uint256 private _nextListingId;

    /// @dev listingId => Listing
    mapping(uint256 => Types.Listing) private _listings;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _registry,
        address _kycRegistry,
        address _paymentToken,
        uint16  _feeBps,
        address _feeCollector
    ) external initializer {
        if (_feeBps > MAX_FEE_BPS) revert Marketplace__FeeTooHigh(_feeBps, MAX_FEE_BPS);
        if (_feeBps > 0 && _feeCollector == address(0)) revert Marketplace__ZeroFeeCollector();
        registry     = IPropertyRegistry(_registry);
        kycRegistry  = IKYCRegistry(_kycRegistry);
        paymentToken = IERC20(_paymentToken);
        feeBps       = _feeBps;
        feeCollector = _feeCollector;
        _nextListingId = 1;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ─── IMarketplace ────────────────────────────────────────────────────────

    /// @inheritdoc IMarketplace
    function createListing(
        uint256 propertyId,
        uint256 tokenAmount,
        uint256 pricePerToken,
        uint48  expiresAt
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        if (tokenAmount == 0) revert Marketplace__ZeroAmount();
        if (pricePerToken == 0) revert Marketplace__ZeroPrice();
        if (!kycRegistry.isVerified(msg.sender)) revert Marketplace__NotKYCVerified(msg.sender);

        address tokenAddress = registry.getPropertyToken(propertyId);

        listingId = _nextListingId++;

        _listings[listingId] = Types.Listing({
            listingId: listingId,
            propertyId: propertyId,
            seller: msg.sender,
            tokenAmount: tokenAmount,
            pricePerToken: pricePerToken,
            status: Types.ListingStatus.Active,
            createdAt: block.timestamp,
            tokenAddress: tokenAddress,
            expiresAt: expiresAt
        });

        // Pull tokens from seller into escrow (this contract)
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenAmount);

        emit ListingCreated(listingId, propertyId, msg.sender, tokenAmount, pricePerToken, expiresAt);
    }

    /// @inheritdoc IMarketplace
    function buyListing(
        uint256 listingId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert Marketplace__ZeroAmount();
        if (!kycRegistry.isVerified(msg.sender)) revert Marketplace__NotKYCVerified(msg.sender);

        Types.Listing storage listing = _getActiveListing(listingId);

        // Check expiry
        if (listing.expiresAt != 0 && block.timestamp > listing.expiresAt) {
            revert Marketplace__ListingExpired(listingId);
        }

        uint256 totalCost = amount * listing.pricePerToken;

        // Reduce listing token amount
        listing.tokenAmount -= amount;
        if (listing.tokenAmount == 0) {
            listing.status = Types.ListingStatus.Sold;
        }

        // Calculate and distribute protocol fee
        uint256 fee = 0;
        if (feeBps > 0 && feeCollector != address(0)) {
            fee = (totalCost * feeBps) / 10_000;
            paymentToken.safeTransferFrom(msg.sender, feeCollector, fee);
            emit ProtocolFeeCollected(listingId, fee);
        }

        // Collect remaining payment from buyer → seller
        paymentToken.safeTransferFrom(msg.sender, listing.seller, totalCost - fee);

        // Transfer tokens from escrow to buyer
        IERC20(listing.tokenAddress).safeTransfer(msg.sender, amount);

        emit ListingPurchased(listingId, msg.sender, amount, totalCost);
    }

    /// @inheritdoc IMarketplace
    function cancelListing(uint256 listingId) external nonReentrant {
        Types.Listing storage listing = _getActiveListing(listingId);
        if (listing.seller != msg.sender) revert Marketplace__NotLister();

        listing.status = Types.ListingStatus.Cancelled;

        // Return tokens to seller
        IERC20(listing.tokenAddress).safeTransfer(msg.sender, listing.tokenAmount);

        emit ListingCancelled(listingId, msg.sender);
    }

    /// @inheritdoc IMarketplace
    function getListing(uint256 listingId) external view returns (Types.Listing memory) {
        if (_listings[listingId].createdAt == 0) revert Marketplace__ListingNotFound(listingId);
        return _listings[listingId];
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setFee(uint16 newFeeBps) external onlyRole(ADMIN_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert Marketplace__FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setFeeCollector(address newCollector) external onlyRole(ADMIN_ROLE) {
        if (newCollector == address(0)) revert Marketplace__ZeroFeeCollector();
        feeCollector = newCollector;
        emit FeeCollectorUpdated(newCollector);
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _getActiveListing(
        uint256 listingId
    ) internal view returns (Types.Listing storage listing) {
        listing = _listings[listingId];
        if (listing.createdAt == 0) revert Marketplace__ListingNotFound(listingId);
        if (listing.status != Types.ListingStatus.Active) revert Marketplace__ListingNotActive(listingId);
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}

