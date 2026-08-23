// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KYCRegistry} from "./KYCRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {KYCRegistry__AccountFrozen} from "../utils/Errors.sol";

/// @title KYCRegistryDemo
/// @notice TESTNET ONLY. A KYCRegistry that lets any wallet verify itself.
///
///         NOT FOR PRODUCTION. Real verification means an operator holding
///         VERIFIER_ROLE attests to an off-chain identity check; `selfVerify()`
///         attests to nothing. It exists so a deployment with no KYC provider
///         integrated can still exercise the invest / claim / trade flows, which
///         are all gated on `isVerified()`.
///
///         Storage layout is identical to KYCRegistry — this adds functions and
///         constants only, no state — so it is a safe UUPS upgrade of an existing
///         KYCRegistry proxy, and upgrading back to KYCRegistry disables
///         self-verification while keeping every record that was written.
contract KYCRegistryDemo is KYCRegistry {
    /// @notice ISO 3166-1 numeric code recorded for self-verified wallets (0 = unspecified).
    uint16 public constant DEMO_COUNTRY_CODE = 0;

    /// @notice Investor type recorded for self-verified wallets (1 = retail).
    uint8 public constant DEMO_INVESTOR_TYPE = 1;

    /// @notice Emitted alongside AccountVerified so demo records are distinguishable on chain.
    event SelfVerified(address indexed account);

    /// @notice Marks the caller verified, with no expiry and no off-chain check.
    /// @dev Idempotent: verifying twice is a no-op rather than a revert, so a
    ///      double-clicked button does not surface an error. A frozen wallet is
    ///      still refused — letting a sanctioned address clear its own freeze
    ///      would defeat the one control that must hold even in a demo.
    function selfVerify() external {
        Types.InvestorRecord storage rec = _investors[msg.sender];
        if (rec.frozen) revert KYCRegistry__AccountFrozen(msg.sender);
        if (rec.verified) return;

        rec.verified     = true;
        rec.countryCode  = DEMO_COUNTRY_CODE;
        rec.investorType = DEMO_INVESTOR_TYPE;
        rec.verifiedAt   = uint48(block.timestamp);
        rec.expiresAt    = 0;

        emit AccountVerified(
            msg.sender, msg.sender, DEMO_COUNTRY_CODE, DEMO_INVESTOR_TYPE, 0, block.timestamp
        );
        emit SelfVerified(msg.sender);
    }

    /// @notice Re-grants DEFAULT_ADMIN_ROLE and VERIFIER_ROLE to `admin`.
    /// @dev Recovery hatch. On a deployment where DEFAULT_ADMIN_ROLE was renounced,
    ///      `grantRole` can never succeed again, which permanently bricks
    ///      verify / revoke / freeze / unfreeze. ADMIN_ROLE still gates upgrades,
    ///      so it is the only authority left that can restore the others.
    function bootstrapRoles(address admin) external onlyRole(ADMIN_ROLE) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }
}
