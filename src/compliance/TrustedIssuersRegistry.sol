// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITrustedIssuersRegistry} from "../interfaces/ITrustedIssuersRegistry.sol";
import "../utils/Events.sol";
import {
    TrustedIssuersRegistry__IssuerAlreadyTrusted,
    TrustedIssuersRegistry__IssuerNotFound,
    TrustedIssuersRegistry__ZeroAddress,
    TrustedIssuersRegistry__EmptyClaimTopics
} from "../utils/Errors.sol";

/// @title TrustedIssuersRegistry
/// @notice Tracks which off-chain KYC / attestation issuers are trusted and
///         the specific claim topics each issuer is authorised to certify
///         (e.g. 1=KYC, 2=AML, 3=AccreditedInvestor).
///
///         REGISTRY_OWNER_ROLE manages the issuer set.
contract TrustedIssuersRegistry is ITrustedIssuersRegistry, AccessControl {
    bytes32 public constant REGISTRY_OWNER_ROLE = keccak256("REGISTRY_OWNER_ROLE");

    mapping(address => uint256[]) private _issuerTopics;
    mapping(address => bool) private _trusted;

    constructor(address admin) {
        if (admin == address(0)) revert TrustedIssuersRegistry__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRY_OWNER_ROLE, admin);
    }

    // ─── Write functions ─────────────────────────────────────────────────────

    /// @inheritdoc ITrustedIssuersRegistry
    function addTrustedIssuer(address issuer, uint256[] calldata claimTopics) external onlyRole(REGISTRY_OWNER_ROLE) {
        if (issuer == address(0)) revert TrustedIssuersRegistry__ZeroAddress();
        if (_trusted[issuer]) revert TrustedIssuersRegistry__IssuerAlreadyTrusted(issuer);
        if (claimTopics.length == 0) revert TrustedIssuersRegistry__EmptyClaimTopics();

        _trusted[issuer] = true;
        _issuerTopics[issuer] = claimTopics;
        emit TrustedIssuerAdded(issuer, claimTopics);
    }

    /// @inheritdoc ITrustedIssuersRegistry
    function removeTrustedIssuer(address issuer) external onlyRole(REGISTRY_OWNER_ROLE) {
        if (!_trusted[issuer]) revert TrustedIssuersRegistry__IssuerNotFound(issuer);
        _trusted[issuer] = false;
        delete _issuerTopics[issuer];
        emit TrustedIssuerRemoved(issuer);
    }

    /// @inheritdoc ITrustedIssuersRegistry
    function updateIssuerTopics(address issuer, uint256[] calldata claimTopics) external onlyRole(REGISTRY_OWNER_ROLE) {
        if (!_trusted[issuer]) revert TrustedIssuersRegistry__IssuerNotFound(issuer);
        if (claimTopics.length == 0) revert TrustedIssuersRegistry__EmptyClaimTopics();
        _issuerTopics[issuer] = claimTopics;
        emit TrustedIssuerTopicsUpdated(issuer, claimTopics);
    }

    // ─── Read functions ──────────────────────────────────────────────────────

    /// @inheritdoc ITrustedIssuersRegistry
    function isTrustedIssuer(address issuer) external view returns (bool) {
        return _trusted[issuer];
    }

    /// @inheritdoc ITrustedIssuersRegistry
    function hasClaimTopic(address issuer, uint256 topic) external view returns (bool) {
        if (!_trusted[issuer]) return false;
        uint256[] storage topics = _issuerTopics[issuer];
        uint256 len = topics.length;
        for (uint256 i = 0; i < len; ++i) {
            if (topics[i] == topic) return true;
        }
        return false;
    }

    /// @inheritdoc ITrustedIssuersRegistry
    function getIssuerTopics(address issuer) external view returns (uint256[] memory) {
        return _issuerTopics[issuer];
    }
}
