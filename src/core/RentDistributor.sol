// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IRentDistributor} from "../interfaces/IRentDistributor.sol";
import {IPropertyRegistry} from "../interfaces/IPropertyRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    RentDistributor__NotPropertyOwner,
    RentDistributor__NoPeriodFound,
    RentDistributor__AlreadyClaimed,
    RentDistributor__ZeroRent,
    RentDistributor__InvalidProof,
    RentDistributor__ReclaimTooEarly,
    RentDistributor__ExceedsTotalRent,
    RentDistributor__ArrayLengthMismatch,
    RentDistributor__InvalidSnapshotBlock,
    RentDistributor__ExceedsEntitlement
} from "../utils/Errors.sol";

/// @title RentDistributor
/// @notice Property owners deposit rental income with an off-chain-computed Merkle root.
///         Investors claim their pre-allocated share by supplying a Merkle proof.
///
///         Leaf format: keccak256(abi.encodePacked(investorAddress, claimableAmount))
///
///         Security properties:
///         - Proof forgery is computationally infeasible (Merkle tree security).
///         - Double-claim prevented by per-account claimed flag.
///         - Over-distribution prevented by totalClaimed <= totalRent invariant.
///         - Unclaimed funds recoverable by admin after reclaimDeadline.
contract RentDistributor is IRentDistributor, Initializable, AccessControl, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @dev 90-day reclaim window after deposit
    uint256 public constant RECLAIM_DELAY = 90 days;

    IPropertyRegistry public registry;
    IERC20            public paymentToken;

    /// @dev propertyId => periodId => RentPeriod
    mapping(uint256 => mapping(uint256 => Types.RentPeriod)) private _periods;
    /// @dev propertyId => next period ID
    mapping(uint256 => uint256) private _nextPeriodId;
    /// @dev propertyId => periodId => account => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _hasClaimed;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _registry, address _paymentToken) external initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE,         admin);
        registry     = IPropertyRegistry(_registry);
        paymentToken = IERC20(_paymentToken);
    }

    // ─── IRentDistributor ────────────────────────────────────────────────────

    /// @inheritdoc IRentDistributor
    function depositRent(
        uint256 propertyId,
        uint256 amount,
        bytes32 merkleRoot,
        uint256 snapshotBlock
    ) external nonReentrant returns (uint256 periodId) {
        if (amount == 0) revert RentDistributor__ZeroRent();
        // snapshotBlock == 0 means "no enforcement"; non-zero must be a past block
        if (snapshotBlock > 0 && snapshotBlock >= block.number) {
            revert RentDistributor__InvalidSnapshotBlock(snapshotBlock);
        }

        Types.Property memory prop = registry.getProperty(propertyId);
        if (prop.owner != msg.sender) revert RentDistributor__NotPropertyOwner(propertyId);

        periodId = ++_nextPeriodId[propertyId];

        _periods[propertyId][periodId] = Types.RentPeriod({
            propertyId:      propertyId,
            totalRent:       amount,
            totalClaimed:    0,
            merkleRoot:      merkleRoot,
            depositor:       msg.sender,
            reclaimDeadline: block.timestamp + RECLAIM_DELAY,
            snapshotBlock:   snapshotBlock
        });

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RentDeposited(propertyId, periodId, amount, merkleRoot);
    }

    /// @inheritdoc IRentDistributor
    function claimRent(
        uint256 propertyId,
        uint256 periodId,
        uint256 claimableAmount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        _claim(propertyId, periodId, claimableAmount, merkleProof);
    }

    /// @inheritdoc IRentDistributor
    function claimMultiple(
        uint256[] calldata propertyIds,
        uint256[] calldata periodIds,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        uint256 n = propertyIds.length;
        if (n != periodIds.length || n != amounts.length || n != proofs.length) {
            revert RentDistributor__ArrayLengthMismatch();
        }
        for (uint256 i = 0; i < n; ++i) {
            _claim(propertyIds[i], periodIds[i], amounts[i], proofs[i]);
        }
    }

    /// @inheritdoc IRentDistributor
    function reclaimUnclaimed(uint256 propertyId, uint256 periodId) external nonReentrant onlyRole(ADMIN_ROLE) {
        Types.RentPeriod storage period = _getExistingPeriod(propertyId, periodId);

        if (block.timestamp < period.reclaimDeadline) {
            revert RentDistributor__ReclaimTooEarly(propertyId, periodId, period.reclaimDeadline);
        }

        uint256 unclaimed = period.totalRent - period.totalClaimed;
        // Mark fully claimed to prevent double reclaim
        period.totalClaimed = period.totalRent;

        if (unclaimed > 0) {
            paymentToken.safeTransfer(period.depositor, unclaimed);
        }
        emit UnclaimedRentReclaimed(propertyId, periodId, unclaimed);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _claim(
        uint256 propertyId,
        uint256 periodId,
        uint256 claimableAmount,
        bytes32[] calldata merkleProof
    ) internal {
        Types.RentPeriod storage period = _getExistingPeriod(propertyId, periodId);

        if (_hasClaimed[propertyId][periodId][msg.sender]) {
            revert RentDistributor__AlreadyClaimed(propertyId, periodId, msg.sender);
        }

        // Verify Merkle proof: leaf = keccak256(abi.encodePacked(claimant, amount))
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, claimableAmount));
        if (!MerkleProof.verify(merkleProof, period.merkleRoot, leaf)) {
            revert RentDistributor__InvalidProof();
        }

        // On-chain snapshot entitlement check — prevents off-chain Merkle root from
        // over-allocating relative to what the investor actually held at the snapshot block.
        if (period.snapshotBlock > 0) {
            address tokenAddr = registry.getPropertyToken(propertyId);
            if (tokenAddr != address(0)) {
                uint256 pastTotalSupply = IVotes(tokenAddr).getPastTotalSupply(period.snapshotBlock);
                if (pastTotalSupply > 0) {
                    uint256 pastVotes = IVotes(tokenAddr).getPastVotes(msg.sender, period.snapshotBlock);
                    uint256 maxEntitlement = (pastVotes * period.totalRent) / pastTotalSupply;
                    if (claimableAmount > maxEntitlement) {
                        revert RentDistributor__ExceedsEntitlement(
                            propertyId, periodId, msg.sender, claimableAmount, maxEntitlement
                        );
                    }
                }
            }
        }

        if (period.totalClaimed + claimableAmount > period.totalRent) {
            revert RentDistributor__ExceedsTotalRent(propertyId, periodId);
        }

        _hasClaimed[propertyId][periodId][msg.sender] = true;
        period.totalClaimed += claimableAmount;

        paymentToken.safeTransfer(msg.sender, claimableAmount);
        emit RentClaimed(propertyId, periodId, msg.sender, claimableAmount);
    }

    function _getExistingPeriod(
        uint256 propertyId,
        uint256 periodId
    ) internal view returns (Types.RentPeriod storage period) {
        period = _periods[propertyId][periodId];
        if (period.totalRent == 0) {
            revert RentDistributor__NoPeriodFound(propertyId, periodId);
        }
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}

    // ─── Storage gap ─────────────────────────────────────────────────────────

    uint256[50] private __gap;
}

