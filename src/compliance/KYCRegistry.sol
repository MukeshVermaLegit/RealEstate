// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    KYCRegistry__AlreadyVerified,
    KYCRegistry__NotVerified,
    KYCRegistry__AccountFrozen,
    KYCRegistry__KYCExpired,
    KYCRegistry__BatchLengthMismatch
} from "../utils/Errors.sol";

/// @title KYCRegistry
/// @notice Production-grade compliance registry for investor KYC / AML.
///
///         Each investor address carries an InvestorRecord tracking:
///           - verification status, country, investor type, timestamps
///           - sanctions / OFAC freeze flag
///
///         isVerified() returns true only when all of the following hold:
///           1. record.verified == true
///           2. record.frozen == false
///           3. expiresAt == 0 OR block.timestamp <= expiresAt
///
///         Contracts that gate access (PropertyToken, Marketplace) call
///         isVerified() — its signature is unchanged from v1.
contract KYCRegistry is IKYCRegistry, Initializable, AccessControl, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @dev address => full compliance record.
    ///      `internal` rather than `private` so a subclass (e.g. the demo registry used on
    ///      testnets) can write records without changing this contract's storage layout.
    mapping(address => Types.InvestorRecord) internal _investors;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ─── IKYCRegistry ────────────────────────────────────────────────────────

    /// @inheritdoc IKYCRegistry
    function verify(address account, uint16 countryCode, uint8 investorType, uint48 expiresAt)
        external
        onlyRole(VERIFIER_ROLE)
    {
        Types.InvestorRecord storage rec = _investors[account];
        if (rec.frozen) revert KYCRegistry__AccountFrozen(account);
        if (rec.verified) revert KYCRegistry__AlreadyVerified(account);

        rec.verified = true;
        rec.countryCode = countryCode;
        rec.investorType = investorType;
        rec.verifiedAt = uint48(block.timestamp);
        rec.expiresAt = expiresAt;

        emit AccountVerified(account, msg.sender, countryCode, investorType, expiresAt, block.timestamp);
    }

    /// @inheritdoc IKYCRegistry
    function batchVerify(
        address[] calldata accounts,
        uint16[] calldata countryCodes,
        uint8[] calldata investorTypes,
        uint48[] calldata expiresAts
    ) external onlyRole(VERIFIER_ROLE) {
        uint256 len = accounts.length;
        if (countryCodes.length != len || investorTypes.length != len || expiresAts.length != len) {
            revert KYCRegistry__BatchLengthMismatch();
        }

        for (uint256 i = 0; i < len; ++i) {
            address account = accounts[i];
            Types.InvestorRecord storage rec = _investors[account];
            if (rec.frozen) revert KYCRegistry__AccountFrozen(account);
            if (rec.verified) revert KYCRegistry__AlreadyVerified(account);

            rec.verified = true;
            rec.countryCode = countryCodes[i];
            rec.investorType = investorTypes[i];
            rec.verifiedAt = uint48(block.timestamp);
            rec.expiresAt = expiresAts[i];

            emit AccountVerified(account, msg.sender, countryCodes[i], investorTypes[i], expiresAts[i], block.timestamp);
        }
    }

    /// @inheritdoc IKYCRegistry
    function revoke(address account) external onlyRole(VERIFIER_ROLE) {
        if (!_investors[account].verified) revert KYCRegistry__NotVerified(account);
        _investors[account].verified = false;
        emit AccountRevoked(account, msg.sender, block.timestamp);
    }

    /// @inheritdoc IKYCRegistry
    function freeze(address account) external onlyRole(VERIFIER_ROLE) {
        if (_investors[account].frozen) revert KYCRegistry__AccountFrozen(account);
        _investors[account].frozen = true;
        emit AccountFrozen(account);
    }

    /// @inheritdoc IKYCRegistry
    function unfreeze(address account) external onlyRole(VERIFIER_ROLE) {
        _investors[account].frozen = false;
        emit AccountUnfrozen(account);
    }

    /// @inheritdoc IKYCRegistry
    /// @dev Cannot update expiry on an already-expired record; must revoke and re-verify.
    function updateExpiry(address account, uint48 newExpiry) external onlyRole(VERIFIER_ROLE) {
        Types.InvestorRecord storage rec = _investors[account];
        if (!rec.verified) revert KYCRegistry__NotVerified(account);
        if (rec.expiresAt != 0 && block.timestamp > rec.expiresAt) {
            revert KYCRegistry__KYCExpired(account);
        }
        rec.expiresAt = newExpiry;
    }

    /// @inheritdoc IKYCRegistry
    function isVerified(address account) external view returns (bool) {
        Types.InvestorRecord storage rec = _investors[account];
        if (!rec.verified) return false;
        if (rec.frozen) return false;
        if (rec.expiresAt != 0 && block.timestamp > rec.expiresAt) return false;
        return true;
    }

    /// @inheritdoc IKYCRegistry
    function getInvestorRecord(address account) external view returns (Types.InvestorRecord memory) {
        return _investors[account];
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}
