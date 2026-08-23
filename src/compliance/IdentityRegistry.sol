// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    IdentityRegistry__IdentityAlreadyExists,
    IdentityRegistry__IdentityNotFound,
    IdentityRegistry__ZeroAddress
} from "../utils/Errors.sol";

/// @title IdentityRegistry
/// @notice ERC-3643 (T-REX) inspired identity registry.
///
///         Each investor wallet is mapped to an Identity struct holding:
///           - wallet address
///           - ISO 3166-1 numeric country code
///           - off-chain identity hash (e.g. keccak256 of DID / KYC document hash)
///
///         Verification status is NOT duplicated here — isVerified() delegates
///         to the existing KYCRegistry for backwards compatibility.
///
///         IDENTITY_AGENT_ROLE can register, update, and delete identities.
contract IdentityRegistry is IIdentityRegistry, AccessControl {
    bytes32 public constant IDENTITY_AGENT_ROLE = keccak256("IDENTITY_AGENT_ROLE");

    IKYCRegistry private immutable _kycRegistry;

    mapping(address => Types.Identity) private _identities;
    mapping(address => bool) private _registered;

    constructor(address admin, address kycRegistryAddr) {
        if (admin == address(0) || kycRegistryAddr == address(0)) revert IdentityRegistry__ZeroAddress();
        _kycRegistry = IKYCRegistry(kycRegistryAddr);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(IDENTITY_AGENT_ROLE, admin);
    }

    // ─── Write functions ─────────────────────────────────────────────────────

    /// @inheritdoc IIdentityRegistry
    function registerIdentity(address wallet, uint16 countryCode_, bytes32 identityHash)
        external
        onlyRole(IDENTITY_AGENT_ROLE)
    {
        if (wallet == address(0)) revert IdentityRegistry__ZeroAddress();
        if (_registered[wallet]) revert IdentityRegistry__IdentityAlreadyExists(wallet);

        _identities[wallet] = Types.Identity({wallet: wallet, countryCode: countryCode_, identityHash: identityHash});
        _registered[wallet] = true;

        emit IdentityRegistered(wallet, countryCode_, identityHash);
    }

    /// @inheritdoc IIdentityRegistry
    function deleteIdentity(address wallet) external onlyRole(IDENTITY_AGENT_ROLE) {
        if (!_registered[wallet]) revert IdentityRegistry__IdentityNotFound(wallet);
        delete _identities[wallet];
        _registered[wallet] = false;
        emit IdentityDeleted(wallet);
    }

    /// @inheritdoc IIdentityRegistry
    function updateCountry(address wallet, uint16 newCountry) external onlyRole(IDENTITY_AGENT_ROLE) {
        if (!_registered[wallet]) revert IdentityRegistry__IdentityNotFound(wallet);
        uint16 oldCountry = _identities[wallet].countryCode;
        _identities[wallet].countryCode = newCountry;
        emit IdentityCountryUpdated(wallet, oldCountry, newCountry);
    }

    // ─── Read functions ──────────────────────────────────────────────────────

    /// @inheritdoc IIdentityRegistry
    /// @dev Delegates entirely to KYCRegistry so a single revocation/freeze there
    ///      is immediately reflected here — no state duplication.
    function isVerified(address wallet) external view returns (bool) {
        return _kycRegistry.isVerified(wallet);
    }

    /// @inheritdoc IIdentityRegistry
    function identity(address wallet) external view returns (Types.Identity memory) {
        return _identities[wallet];
    }

    /// @inheritdoc IIdentityRegistry
    function countryCode(address wallet) external view returns (uint16) {
        return _identities[wallet].countryCode;
    }

    /// @notice Returns the address of the underlying KYCRegistry
    function kycRegistry() external view returns (address) {
        return address(_kycRegistry);
    }
}
