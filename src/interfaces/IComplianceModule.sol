// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IComplianceModule
/// @notice Per-property-token compliance rules engine.
///         PropertyToken calls canTransfer() before allowing a transfer and
///         transferred() after the ERC-20 state update to maintain holder counts.
interface IComplianceModule {
    /// @notice Compliance rules attached to a specific token address
    struct ComplianceRules {
        /// @dev 0 = unlimited
        uint256 maxHolders;
        /// @dev 0 = unlimited
        uint256 maxTokensPerHolder;
        /// @dev Empty array = all countries allowed
        uint16[] allowedCountries;
        /// @dev Empty array = no countries blocked
        uint16[] blockedCountries;
    }

    /// @notice Check whether a transfer is compliant with the token's rules
    /// @param tokenAddr  Property token contract address
    /// @param from       Sender (address(0) for mints — always returns true)
    /// @param to         Recipient (address(0) for burns — always returns true)
    /// @param amount     Token amount being transferred
    /// @return ok        True if the transfer may proceed
    /// @return reason    Human-readable reason string when ok == false
    function canTransfer(
        address tokenAddr,
        address from,
        address to,
        uint256 amount
    ) external view returns (bool ok, string memory reason);

    /// @notice Inform the compliance module that a transfer has been executed.
    ///         Must be called by the token contract (msg.sender == tokenAddr) after
    ///         the ERC-20 state update so holder counts stay accurate.
    function transferred(address tokenAddr, address from, address to, uint256 amount) external;

    /// @notice Attach compliance rules to a token. Callable by COMPLIANCE_ADMIN_ROLE.
    function addTokenCompliance(address tokenAddr, ComplianceRules calldata rules) external;

    /// @notice Replace the compliance rules for an already-registered token.
    function updateTokenCompliance(address tokenAddr, ComplianceRules calldata rules) external;

    /// @notice Returns the current number of distinct token holders
    function holderCount(address tokenAddr) external view returns (uint256);

    /// @notice Returns true iff the wallet currently holds > 0 tokens of tokenAddr
    function isHolder(address tokenAddr, address wallet) external view returns (bool);

    /// @notice Returns the compliance rules for a token
    function getComplianceRules(address tokenAddr) external view returns (ComplianceRules memory);
}
