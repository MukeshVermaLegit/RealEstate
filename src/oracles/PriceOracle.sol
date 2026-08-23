// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "../utils/Events.sol";
import {PriceOracle__StalePrice, PriceOracle__ZeroPrice} from "../utils/Errors.sol";

/// @title PriceOracle
/// @notice Simple updatable on-chain price oracle for property valuations.
///         Off-chain services (Chainlink, manual appraisers) push USD prices here.
///         Consumers check `MAX_STALENESS` before using the price.
contract PriceOracle is Initializable, AccessControl, UUPSUpgradeable {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /// @dev Maximum age of a price before it is considered stale (7 days)
    uint256 public constant MAX_STALENESS = 7 days;

    struct PriceFeed {
        uint256 price; // USD value of one fractional token (18 decimals)
        uint256 lastUpdated;
    }

    /// @dev propertyId => PriceFeed
    mapping(uint256 => PriceFeed) private _feeds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPDATER_ROLE, admin);
    }

    /// @notice Push a new price for a property token
    function updatePrice(uint256 propertyId, uint256 price) external onlyRole(UPDATER_ROLE) {
        if (price == 0) revert PriceOracle__ZeroPrice();
        _feeds[propertyId] = PriceFeed({price: price, lastUpdated: block.timestamp});
        emit PriceUpdated(propertyId, price, block.timestamp);
    }

    /// @notice Returns latest price, reverts if stale
    function getPrice(uint256 propertyId) external view returns (uint256 price, uint256 lastUpdated) {
        PriceFeed memory feed = _feeds[propertyId];
        if (block.timestamp - feed.lastUpdated > MAX_STALENESS) {
            revert PriceOracle__StalePrice(propertyId, feed.lastUpdated);
        }
        return (feed.price, feed.lastUpdated);
    }

    /// @notice Returns latest price without staleness check (use with caution)
    function getPriceUnsafe(uint256 propertyId) external view returns (uint256, uint256) {
        PriceFeed memory feed = _feeds[propertyId];
        return (feed.price, feed.lastUpdated);
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}
