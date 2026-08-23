// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IClaimTopicsRegistry} from "../interfaces/IClaimTopicsRegistry.sol";
import "../utils/Events.sol";
import {ClaimTopicsRegistry__TopicAlreadyExists, ClaimTopicsRegistry__TopicNotFound} from "../utils/Errors.sol";

/// @title ClaimTopicsRegistry
/// @notice Stores the global set of required claim topics that investors must
///         hold for a transfer to be compliant.
///
///         Conventional topic IDs (non-normative):
///           1 = KYC
///           2 = AML
///           3 = AccreditedInvestor
///
///         TOPICS_OWNER_ROLE manages the topic set.
contract ClaimTopicsRegistry is IClaimTopicsRegistry, AccessControl {
    bytes32 public constant TOPICS_OWNER_ROLE = keccak256("TOPICS_OWNER_ROLE");

    uint256[] private _topics;
    mapping(uint256 => bool) private _topicExists;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOPICS_OWNER_ROLE, admin);
    }

    // ─── Write functions ─────────────────────────────────────────────────────

    /// @inheritdoc IClaimTopicsRegistry
    function addClaimTopic(uint256 topic) external onlyRole(TOPICS_OWNER_ROLE) {
        if (_topicExists[topic]) revert ClaimTopicsRegistry__TopicAlreadyExists(topic);
        _topicExists[topic] = true;
        _topics.push(topic);
        emit ClaimTopicAdded(topic);
    }

    /// @inheritdoc IClaimTopicsRegistry
    function removeClaimTopic(uint256 topic) external onlyRole(TOPICS_OWNER_ROLE) {
        if (!_topicExists[topic]) revert ClaimTopicsRegistry__TopicNotFound(topic);
        _topicExists[topic] = false;

        // Swap-and-pop for O(n) removal without gaps
        uint256 len = _topics.length;
        for (uint256 i = 0; i < len; ++i) {
            if (_topics[i] == topic) {
                _topics[i] = _topics[len - 1];
                _topics.pop();
                break;
            }
        }
        emit ClaimTopicRemoved(topic);
    }

    // ─── Read functions ──────────────────────────────────────────────────────

    /// @inheritdoc IClaimTopicsRegistry
    function getClaimTopics() external view returns (uint256[] memory) {
        return _topics;
    }
}
