// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPropertyOffering} from "../interfaces/IPropertyOffering.sol";
import {IPropertyRegistry} from "../interfaces/IPropertyRegistry.sol";
import {IPropertyToken} from "../interfaces/IPropertyToken.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {Types} from "../utils/Types.sol";
import "../utils/Events.sol";
import {
    PropertyOffering__HardCapReached,
    PropertyOffering__OfferingNotActive,
    PropertyOffering__SoftCapNotReached,
    PropertyOffering__AlreadyFinalized,
    PropertyOffering__NotCancelled
} from "../utils/Errors.sol";
import {KYCRegistry__NotVerified} from "../utils/Errors.sol";

/// @title PropertyOffering
/// @notice Primary-sale contract for a single tokenized real-estate property.
///         Investors deposit paymentToken during the offering window; upon finalization
///         property tokens are minted with a lockup, and funds flow to the property owner.
///         If the soft cap is not reached by endTime the admin can cancel and investors refund.
contract PropertyOffering is IPropertyOffering, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ─── Immutable offering parameters ───────────────────────────────────────

    uint256 public immutable propertyId;
    address public immutable tokenAddress;
    IERC20  public immutable paymentToken;
    /// @notice Payment token units required per full property token (18-decimal token wei).
    ///         e.g. 100e18 means 100 payment-token units per 1e18 property-token wei.
    uint256 public immutable pricePerToken;
    /// @notice Maximum total property-token wei that may be committed.
    uint256 public immutable hardCap;
    /// @notice Minimum total property-token wei required for a successful offering.
    uint256 public immutable softCap;
    uint256 public immutable startTime;
    uint256 public immutable endTime;
    /// @notice Seconds after finalization before investors may transfer tokens.
    uint256 public immutable lockupDuration;

    IPropertyRegistry public immutable registry;
    IKYCRegistry      public immutable kycRegistry;

    // ─── Mutable state ───────────────────────────────────────────────────────

    uint256 public totalTokensCommitted;
    bool    public finalized;
    bool    public cancelled;

    /// @dev investor => property-token wei committed
    mapping(address => uint256) private _investments;
    /// @dev investor => paymentToken amount held in escrow
    mapping(address => uint256) private _paymentsReceived;
    /// @dev investor => lockup expiry timestamp (set on finalization)
    mapping(address => uint256) private _lockupExpiry;
    /// @dev ordered list of investors (for finalization loop)
    address[] private _investors;
    /// @dev deduplication guard for _investors list
    mapping(address => bool) private _hasInvested;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        uint256 propertyId_,
        address tokenAddress_,
        address paymentToken_,
        uint256 pricePerToken_,
        uint256 hardCap_,
        uint256 softCap_,
        uint256 startTime_,
        uint256 endTime_,
        uint256 lockupDuration_,
        address registryAddress_,
        address kycRegistryAddress_
    ) {
        propertyId     = propertyId_;
        tokenAddress   = tokenAddress_;
        paymentToken   = IERC20(paymentToken_);
        pricePerToken  = pricePerToken_;
        hardCap        = hardCap_;
        softCap        = softCap_;
        startTime      = startTime_;
        endTime        = endTime_;
        lockupDuration = lockupDuration_;
        registry       = IPropertyRegistry(registryAddress_);
        kycRegistry    = IKYCRegistry(kycRegistryAddress_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ─── IPropertyOffering ───────────────────────────────────────────────────

    /// @inheritdoc IPropertyOffering
    function invest(uint256 tokenAmount) external nonReentrant {
        if (!kycRegistry.isVerified(msg.sender)) revert KYCRegistry__NotVerified(msg.sender);
        if (block.timestamp < startTime || block.timestamp > endTime) {
            revert PropertyOffering__OfferingNotActive();
        }
        if (finalized || cancelled) revert PropertyOffering__OfferingNotActive();
        if (totalTokensCommitted + tokenAmount > hardCap) revert PropertyOffering__HardCapReached();

        // paymentAmount = tokenAmount * pricePerToken / 1e18
        uint256 paymentAmount = tokenAmount * pricePerToken / 1e18;

        paymentToken.safeTransferFrom(msg.sender, address(this), paymentAmount);

        if (!_hasInvested[msg.sender]) {
            _investors.push(msg.sender);
            _hasInvested[msg.sender] = true;
        }

        _investments[msg.sender]     += tokenAmount;
        _paymentsReceived[msg.sender] += paymentAmount;
        totalTokensCommitted          += tokenAmount;

        emit InvestmentMade(propertyId, msg.sender, tokenAmount, paymentAmount);
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Caller must hold ADMIN_ROLE. Requires softCap reached.
    ///      Mints property tokens to each investor with a lockup, transfers all escrowed
    ///      funds to the property owner, then closes the offering in the registry.
    function finalizeOffering() external onlyRole(ADMIN_ROLE) nonReentrant {
        if (finalized)  revert PropertyOffering__AlreadyFinalized();
        if (cancelled)  revert PropertyOffering__OfferingNotActive();
        if (totalTokensCommitted < softCap) revert PropertyOffering__SoftCapNotReached();

        finalized = true;

        IPropertyToken token  = IPropertyToken(tokenAddress);
        uint256 expiry        = block.timestamp + lockupDuration;
        uint256 totalPayment  = 0;
        uint256 len           = _investors.length;

        for (uint256 i = 0; i < len; i++) {
            address investor = _investors[i];
            uint256 amount   = _investments[investor];
            if (amount > 0) {
                token.mint(investor, amount);
                token.setLockupExpiry(investor, expiry);
                _lockupExpiry[investor] = expiry;
                totalPayment += _paymentsReceived[investor];
            }
        }

        // Transfer all escrowed funds to the property owner
        Types.Property memory prop = registry.getProperty(propertyId);
        if (totalPayment > 0) {
            paymentToken.safeTransfer(prop.owner, totalPayment);
        }

        // Transition registry: OfferingOpen → OfferingClosed
        registry.closeOffering(propertyId);

        emit OfferingFinalized(propertyId, address(this), totalPayment);
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Caller must hold ADMIN_ROLE. Marks the offering as cancelled so investors
    ///      can claim refunds. Also closes the offering in the registry.
    function cancelOffering() external onlyRole(ADMIN_ROLE) {
        if (finalized) revert PropertyOffering__AlreadyFinalized();

        cancelled = true;

        // Transition registry: OfferingOpen → OfferingClosed
        registry.closeOffering(propertyId);

        emit OfferingCancelled(propertyId, address(this));
    }

    /// @inheritdoc IPropertyOffering
    function refund() external nonReentrant {
        if (!cancelled) revert PropertyOffering__NotCancelled();

        uint256 paymentAmount = _paymentsReceived[msg.sender];
        if (paymentAmount == 0) return;

        _paymentsReceived[msg.sender] = 0;
        _investments[msg.sender]      = 0;

        paymentToken.safeTransfer(msg.sender, paymentAmount);

        emit InvestorRefunded(propertyId, msg.sender, paymentAmount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @inheritdoc IPropertyOffering
    function getLockupExpiry(address investor) external view returns (uint256) {
        return _lockupExpiry[investor];
    }

    /// @inheritdoc IPropertyOffering
    function getInvestment(address investor) external view returns (uint256) {
        return _investments[investor];
    }
}
