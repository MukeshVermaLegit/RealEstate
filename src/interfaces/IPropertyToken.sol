// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPropertyToken
/// @notice Interface for a per-property ERC-20 token with governance votes and compliance controls.
interface IPropertyToken is IERC20 {
    /// @notice Mint `amount` tokens to `to`. Reverts if maxSupply would be exceeded.
    function mint(address to, uint256 amount) external;

    /// @notice Burn `amount` tokens from `from`.
    function burn(address from, uint256 amount) external;

    /// @notice Transfer tokens bypassing KYC checks (regulatory recovery).
    function forcedTransfer(address from, address to, uint256 amount) external;

    /// @notice Check whether a transfer would succeed under current KYC/pause rules.
    /// @return ok      true if the transfer is allowed
    /// @return reason  human-readable reason string when ok is false
    function canTransfer(address from, address to, uint256 amount) external view returns (bool ok, string memory reason);

    /// @notice The propertyId this token represents.
    function propertyId() external view returns (uint256);

    /// @notice Maximum token supply that may ever be minted.
    function maxSupply() external view returns (uint256);

    /// @notice Pause all token transfers.
    function pause() external;

    /// @notice Resume token transfers.
    function unpause() external;

    /// @notice Set lockup expiry for an investor (called by offering contract, requires MINTER_ROLE).
    function setLockupExpiry(address investor, uint256 expiry) external;

    /// @notice Returns the lockup expiry timestamp for an investor (0 if none).
    function lockupExpiry(address investor) external view returns (uint256);
}
