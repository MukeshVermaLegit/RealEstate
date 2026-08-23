// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComplianceModule} from "../interfaces/IComplianceModule.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import "../utils/Events.sol";
import {ComplianceModule__TokenNotRegistered, ComplianceModule__TokenAlreadyRegistered} from "../utils/Errors.sol";

/// @title ComplianceModule
/// @notice Per-property-token compliance rule engine.
///
///         Rules stored per tokenAddress:
///           - maxHolders            — cap on distinct token holders (0 = unlimited)
///           - maxTokensPerHolder    — cap on single-wallet balance   (0 = unlimited)
///           - allowedCountries      — if non-empty, only listed ISO country codes may participate
///           - blockedCountries      — wallets in these countries cannot send or receive
///
///         Flow:
///           1. PropertyToken._update() calls canTransfer() before the ERC-20 state change.
///           2. PropertyToken._update() calls transferred() after super._update() so holder
///              counts stay accurate for every mint, burn, and normal transfer.
///
///         COMPLIANCE_ADMIN_ROLE manages token rule sets.
///         Country resolution requires an optional IdentityRegistry address.
contract ComplianceModule is IComplianceModule, AccessControl {
    bytes32 public constant COMPLIANCE_ADMIN_ROLE = keccak256("COMPLIANCE_ADMIN_ROLE");

    IIdentityRegistry private immutable _identityRegistry;

    mapping(address => ComplianceRules) private _rules;
    mapping(address => bool) private _tokenRegistered;
    mapping(address => uint256) private _holderCount;
    /// @dev tokenAddr => wallet => currently holds tokens
    mapping(address => mapping(address => bool)) private _isHolder;

    constructor(address admin, address identityRegistryAddr) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ADMIN_ROLE, admin);
        // identityRegistryAddr may be address(0) — country checks are skipped when unset
        _identityRegistry = IIdentityRegistry(identityRegistryAddr);
    }

    // ─── Admin: rule management ──────────────────────────────────────────────

    /// @inheritdoc IComplianceModule
    function addTokenCompliance(address tokenAddr, ComplianceRules calldata rules)
        external
        onlyRole(COMPLIANCE_ADMIN_ROLE)
    {
        if (_tokenRegistered[tokenAddr]) revert ComplianceModule__TokenAlreadyRegistered(tokenAddr);
        _tokenRegistered[tokenAddr] = true;
        _rules[tokenAddr] = rules;
        emit TokenComplianceAdded(tokenAddr);
    }

    /// @inheritdoc IComplianceModule
    function updateTokenCompliance(address tokenAddr, ComplianceRules calldata rules)
        external
        onlyRole(COMPLIANCE_ADMIN_ROLE)
    {
        if (!_tokenRegistered[tokenAddr]) revert ComplianceModule__TokenNotRegistered(tokenAddr);
        _rules[tokenAddr] = rules;
        emit TokenComplianceUpdated(tokenAddr);
    }

    // ─── Transfer gate (view) ────────────────────────────────────────────────

    /// @inheritdoc IComplianceModule
    /// @dev Called by PropertyToken._update() for normal transfers only (from != 0 && to != 0).
    ///      Returns (true, "") immediately if the token has no registered rules.
    function canTransfer(address tokenAddr, address from, address to, uint256 amount)
        external
        view
        returns (bool ok, string memory reason)
    {
        if (!_tokenRegistered[tokenAddr]) return (true, "");

        ComplianceRules storage rules = _rules[tokenAddr];

        // ── Country checks (requires IdentityRegistry) ──────────────────────
        if (address(_identityRegistry) != address(0)) {
            uint16 toCountry = _identityRegistry.countryCode(to);
            uint16 fromCountry = (from != address(0)) ? _identityRegistry.countryCode(from) : 0;

            uint256 blockedLen = rules.blockedCountries.length;
            if (blockedLen > 0) {
                for (uint256 i = 0; i < blockedLen; ++i) {
                    if (rules.blockedCountries[i] == toCountry) return (false, "recipient country blocked");
                    if (from != address(0) && rules.blockedCountries[i] == fromCountry) {
                        return (false, "sender country blocked");
                    }
                }
            }

            uint256 allowedLen = rules.allowedCountries.length;
            if (allowedLen > 0) {
                bool toAllowed = false;
                for (uint256 i = 0; i < allowedLen; ++i) {
                    if (rules.allowedCountries[i] == toCountry) {
                        toAllowed = true;
                        break;
                    }
                }
                if (!toAllowed) return (false, "recipient country not allowed");

                if (from != address(0)) {
                    bool fromAllowed = false;
                    for (uint256 i = 0; i < allowedLen; ++i) {
                        if (rules.allowedCountries[i] == fromCountry) {
                            fromAllowed = true;
                            break;
                        }
                    }
                    if (!fromAllowed) return (false, "sender country not allowed");
                }
            }
        }

        // ── Per-holder token cap ─────────────────────────────────────────────
        if (rules.maxTokensPerHolder > 0) {
            uint256 toBalance = IERC20(tokenAddr).balanceOf(to);
            if (toBalance + amount > rules.maxTokensPerHolder) {
                return (false, "exceeds per-holder token cap");
            }
        }

        // ── Max holders cap ──────────────────────────────────────────────────
        if (rules.maxHolders > 0) {
            bool toIsNew = !_isHolder[tokenAddr][to];
            // from's balance BEFORE this transfer; if equal to amount they will exit
            bool fromWillExit =
                from != address(0) && _isHolder[tokenAddr][from] && IERC20(tokenAddr).balanceOf(from) == amount;

            uint256 projected = _holderCount[tokenAddr];
            if (toIsNew) projected += 1;
            if (fromWillExit) projected -= 1;

            if (projected > rules.maxHolders) return (false, "max holders exceeded");
        }

        return (true, "");
    }

    // ─── Post-transfer hook ──────────────────────────────────────────────────

    /// @inheritdoc IComplianceModule
    /// @dev Only the token contract itself may call this (msg.sender == tokenAddr).
    ///      Called for every _update including mints and burns so that counts are
    ///      always accurate regardless of how tokens enter / leave circulation.
    function transferred(
        address tokenAddr,
        address from,
        address to,
        uint256 /*amount*/
    )
        external
    {
        // Security: only the token may report its own transfers
        if (msg.sender != tokenAddr) return;
        if (!_tokenRegistered[tokenAddr]) return;

        // Track new recipient
        if (to != address(0) && !_isHolder[tokenAddr][to]) {
            _isHolder[tokenAddr][to] = true;
            _holderCount[tokenAddr] += 1;
            emit HolderCountUpdated(tokenAddr, _holderCount[tokenAddr]);
        }

        // Track sender exit (post-transfer balance is queried after super._update)
        if (from != address(0) && _isHolder[tokenAddr][from]) {
            if (IERC20(tokenAddr).balanceOf(from) == 0) {
                _isHolder[tokenAddr][from] = false;
                _holderCount[tokenAddr] -= 1;
                emit HolderCountUpdated(tokenAddr, _holderCount[tokenAddr]);
            }
        }
    }

    // ─── Read functions ──────────────────────────────────────────────────────

    /// @inheritdoc IComplianceModule
    function holderCount(address tokenAddr) external view returns (uint256) {
        return _holderCount[tokenAddr];
    }

    /// @inheritdoc IComplianceModule
    function isHolder(address tokenAddr, address wallet) external view returns (bool) {
        return _isHolder[tokenAddr][wallet];
    }

    /// @inheritdoc IComplianceModule
    function getComplianceRules(address tokenAddr) external view returns (ComplianceRules memory) {
        return _rules[tokenAddr];
    }

    /// @notice Returns the address of the IdentityRegistry used for country lookups
    function identityRegistry() external view returns (address) {
        return address(_identityRegistry);
    }
}
