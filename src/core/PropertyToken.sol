// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IPropertyToken} from "../interfaces/IPropertyToken.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {IComplianceModule} from "../interfaces/IComplianceModule.sol";
import "../utils/Events.sol";
import {
    PropertyToken__ExceedsMaxSupply,
    PropertyToken__ZeroAddress,
    PropertyToken__ZeroAmount,
    PropertyToken__TransferLocked,
    ComplianceModule__TransferDenied
} from "../utils/Errors.sol";
import {KYCRegistry__NotVerified} from "../utils/Errors.sol";

/// @title PropertyToken
/// @notice Per-property ERC-20 token with ERC20Votes checkpoints for trustless rent distribution.
///         Transfers are restricted to KYC-verified addresses only (except mint/burn/forcedTransfer).
contract PropertyToken is IPropertyToken, ERC20, ERC20Permit, ERC20Votes, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IKYCRegistry public immutable kycRegistry;
    IComplianceModule public immutable complianceModule;

    uint256 private immutable _propertyId;
    uint256 private immutable _tokenMaxSupply;
    bool private _bypassKyc; // transient flag for forcedTransfer

    /// @notice Lockup expiry timestamp per investor; 0 = no lockup.
    mapping(address => uint256) private _lockupExpiry;

    constructor(
        string memory name,
        string memory symbol,
        uint256 propertyId_,
        uint256 maxSupply_,
        address admin,
        address kycRegistryAddr,
        address complianceModuleAddr
    ) ERC20(name, symbol) ERC20Permit(name) {
        if (kycRegistryAddr == address(0)) revert PropertyToken__ZeroAddress();
        kycRegistry = IKYCRegistry(kycRegistryAddr);
        // complianceModuleAddr == address(0) means no compliance enforcement (graceful degradation)
        complianceModule = IComplianceModule(complianceModuleAddr);
        _propertyId = propertyId_;
        _tokenMaxSupply = maxSupply_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ─── IPropertyToken ──────────────────────────────────────────────────────

    function propertyId() external view override returns (uint256) {
        return _propertyId;
    }

    function maxSupply() external view override returns (uint256) {
        return _tokenMaxSupply;
    }

    /// @notice Mint `amount` tokens to `to` (up to maxSupply). Caller must have MINTER_ROLE.
    function mint(address to, uint256 amount) external override onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert PropertyToken__ZeroAddress();
        if (amount == 0) revert PropertyToken__ZeroAmount();
        uint256 available = _tokenMaxSupply - totalSupply();
        if (amount > available) revert PropertyToken__ExceedsMaxSupply(_propertyId, amount, available);
        _mint(to, amount);
        emit PropertyTokensMinted(_propertyId, to, amount);
    }

    /// @notice Burn `amount` tokens from `from`. Caller must have MINTER_ROLE.
    function burn(address from, uint256 amount) external override onlyRole(MINTER_ROLE) {
        if (amount == 0) revert PropertyToken__ZeroAmount();
        _burn(from, amount);
        emit PropertyTokensBurned(_propertyId, from, amount);
    }

    /// @notice Transfer tokens bypassing KYC checks (regulatory recovery). Caller must have MINTER_ROLE.
    function forcedTransfer(address from, address to, uint256 amount) external override onlyRole(MINTER_ROLE) {
        if (from == address(0) || to == address(0)) revert PropertyToken__ZeroAddress();
        if (amount == 0) revert PropertyToken__ZeroAmount();
        _bypassKyc = true;
        _transfer(from, to, amount);
        _bypassKyc = false;
        emit ForcedTransfer(from, to, amount, _propertyId);
    }

    /// @inheritdoc IPropertyToken
    function canTransfer(address from, address to, uint256 amount) external view override returns (bool ok, string memory reason) {
        if (paused()) return (false, "paused");
        if (balanceOf(from) < amount) return (false, "insufficient balance");
        if (!kycRegistry.isVerified(from)) return (false, "sender not KYC verified");
        if (!kycRegistry.isVerified(to)) return (false, "recipient not KYC verified");
        return (true, "");
    }

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Set lockup expiry for an investor. Callable by addresses with MINTER_ROLE.
    function setLockupExpiry(address investor, uint256 expiry) external override onlyRole(MINTER_ROLE) {
        _lockupExpiry[investor] = expiry;
    }

    /// @notice Returns the lockup expiry timestamp for an investor.
    function lockupExpiry(address investor) external view override returns (uint256) {
        return _lockupExpiry[investor];
    }

    // ─── Transfer guard ──────────────────────────────────────────────────────

    /// @dev KYC, lockup, and compliance checks on normal transfers; skipped for mint (from==0),
    ///      burn (to==0), and forcedTransfer. ComplianceModule.transferred() is always called
    ///      after the state update (if set) so holder counts remain accurate for mints/burns too.
    function _update(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        // Normal transfer (not mint, not burn, not forcedTransfer): run all guards
        if (from != address(0) && to != address(0) && !_bypassKyc) {
            _requireNotPaused();
            if (!kycRegistry.isVerified(from)) revert KYCRegistry__NotVerified(from);
            if (!kycRegistry.isVerified(to)) revert KYCRegistry__NotVerified(to);
            uint256 expiry = _lockupExpiry[from];
            if (expiry > 0 && block.timestamp < expiry) revert PropertyToken__TransferLocked(from, expiry);
            if (address(complianceModule) != address(0)) {
                (bool ok, string memory reason) = complianceModule.canTransfer(address(this), from, to, amount);
                if (!ok) revert ComplianceModule__TransferDenied(reason);
            }
        }
        super._update(from, to, amount);
        // Notify compliance module after state change so it can maintain accurate holder counts.
        // Called for all operations (mint, burn, transfer) when module is set.
        if (address(complianceModule) != address(0)) {
            complianceModule.transferred(address(this), from, to, amount);
        }
    }

    // ─── ERC20Votes nonces ───────────────────────────────────────────────────

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
