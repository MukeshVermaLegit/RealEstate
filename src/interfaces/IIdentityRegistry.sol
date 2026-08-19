// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "../utils/Types.sol";

/// @title IIdentityRegistry
/// @notice ERC-3643 (T-REX) inspired on-chain identity registry.
///         Maps each investor wallet to an Identity record and delegates
///         verification status to the underlying KYCRegistry.
interface IIdentityRegistry {
    /// @notice Register an identity for a wallet address
    /// @param wallet        Investor wallet
    /// @param countryCode_  ISO 3166-1 numeric country code
    /// @param identityHash  Off-chain identity commitment (e.g. keccak256 of DID / KYC doc hash)
    function registerIdentity(address wallet, uint16 countryCode_, bytes32 identityHash) external;

    /// @notice Remove the identity record for a wallet
    function deleteIdentity(address wallet) external;

    /// @notice Update the country code for an existing identity
    function updateCountry(address wallet, uint16 newCountry) external;

    /// @notice Returns true iff the wallet is KYC-verified (delegates to KYCRegistry)
    function isVerified(address wallet) external view returns (bool);

    /// @notice Returns the full identity record for a wallet
    function identity(address wallet) external view returns (Types.Identity memory);

    /// @notice Returns the country code for a wallet (0 if not registered)
    function countryCode(address wallet) external view returns (uint16);
}
