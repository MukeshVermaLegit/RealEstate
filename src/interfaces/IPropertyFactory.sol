// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPropertyFactory
/// @notice Deploys and tracks per-property ERC-20 token contracts.
interface IPropertyFactory {
    /// @notice Deploy a new PropertyToken for a registered property.
    /// @param propertyId           The property ID from PropertyRegistry.
    /// @param name                 Token name.
    /// @param symbol               Token symbol.
    /// @param maxSupply            Maximum token supply.
    /// @param registryAddr         Address of PropertyRegistry (used by PropertyToken).
    /// @param kycRegistryAddr      Address of KYCRegistry.
    /// @param complianceModuleAddr Address of ComplianceModule; address(0) disables compliance.
    /// @return tokenAddress        The newly deployed PropertyToken contract address.
    function createPropertyToken(
        uint256 propertyId,
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        address registryAddr,
        address kycRegistryAddr,
        address complianceModuleAddr
    ) external returns (address tokenAddress);

    /// @notice Return the token contract address for a given property.
    function getPropertyToken(uint256 propertyId) external view returns (address);
}
