// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "../utils/Types.sol";

/// @title IKYCRegistry
/// @notice On-chain KYC/AML whitelist for investors
interface IKYCRegistry {
    /// @notice Grant KYC approval to a single account
    /// @param account      Investor address
    /// @param countryCode  ISO 3166-1 numeric country code
    /// @param investorType 1=retail, 2=accredited, 3=qualified
    /// @param expiresAt    Unix timestamp when KYC expires; 0 = never expires
    function verify(
        address account,
        uint16  countryCode,
        uint8   investorType,
        uint48  expiresAt
    ) external;

    /// @notice Batch-verify multiple accounts in one call
    /// @dev Arrays must all be the same length
    function batchVerify(
        address[] calldata accounts,
        uint16[]  calldata countryCodes,
        uint8[]   calldata investorTypes,
        uint48[]  calldata expiresAts
    ) external;

    /// @notice Revoke KYC approval — sets verified=false, preserves other record data
    function revoke(address account) external;

    /// @notice Place a sanctions / OFAC freeze on an account
    function freeze(address account) external;

    /// @notice Lift a freeze from an account
    function unfreeze(address account) external;

    /// @notice Update the expiry timestamp of an existing KYC record
    /// @param account    Investor address
    /// @param newExpiry  New unix expiry timestamp; 0 = never expires
    function updateExpiry(address account, uint48 newExpiry) external;

    /// @notice Returns true iff the account is verified, not frozen, and not expired
    function isVerified(address account) external view returns (bool);

    /// @notice Returns the full compliance record for an account
    function getInvestorRecord(address account) external view returns (Types.InvestorRecord memory);
}
