// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
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
    PropertyOffering__NotCancelled,
    PropertyOffering__NotFinalized,
    PropertyOffering__AlreadyCancelled,
    PropertyOffering__NothingToClaim,
    PropertyOffering__TokensAlreadyClaimed,
    PropertyOffering__OfferingNotEnded,
    PropertyOffering__SoftCapAlreadyReached,
    PropertyOffering__ZeroAddress,
    PropertyOffering__ZeroAmount,
    PropertyOffering__InvalidPrice,
    PropertyOffering__InvalidCaps,
    PropertyOffering__InvalidTimeWindow,
    PropertyOffering__HardCapExceedsMaxSupply
} from "../utils/Errors.sol";
import {KYCRegistry__NotVerified} from "../utils/Errors.sol";

/// @title PropertyOffering
/// @notice Primary-sale contract for a single tokenized real-estate property.
///         Investors deposit paymentToken during the offering window; once the soft cap is
///         reached the admin finalizes, escrow moves to the property owner, and investors
///         PULL their tokens with `claimTokens()`.
///
///         PRICE UNIT — `pricePerToken` is payment-token units per ONE WHOLE property token
///         (1e18 token wei), the same unit Marketplace uses. Payment is rounded UP so an
///         investor can never acquire dust for free.
///         Example: USDC (6 decimals) at $100.00/token → pricePerToken = 100_000_000.
///
///         Escrow can always leave this contract by exactly one of two routes:
///           success → finalizeOffering() pays the property owner in full, investors claim
///           failure → cancelOffering() (admin) or expireOffering() (permissionless, after
///                     endTime with the soft cap unmet), then each investor calls refund()
///         `expireOffering` exists so escrow is never hostage to admin liveness, and both
///         failure routes tolerate a reverting registry so refunds can never be blocked by
///         property-status bookkeeping.
contract PropertyOffering is IPropertyOffering, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @dev Property tokens are 18-decimal; prices are quoted per whole token.
    uint256 private constant PRICE_SCALE = 1e18;

    // ─── Immutable offering parameters ───────────────────────────────────────

    uint256 public immutable propertyId;
    address public immutable tokenAddress;
    IERC20  public immutable paymentToken;
    /// @notice Payment-token units per one whole property token (1e18 token wei).
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
    /// @notice Running sum of escrowed paymentToken — avoids an O(n) loop at finalization.
    uint256 public totalPaymentsReceived;
    /// @notice Lockup expiry applied to every investor, fixed at finalization (0 until then).
    uint256 public lockupExpiry;
    bool    public finalized;
    bool    public cancelled;

    /// @dev investor => property-token wei committed
    mapping(address => uint256) private _investments;
    /// @dev investor => paymentToken amount held in escrow
    mapping(address => uint256) private _paymentsReceived;
    /// @dev investor => has already minted their allocation
    mapping(address => bool) private _tokensClaimed;
    /// @dev ordered list of investors (enumeration for off-chain tooling / batch claim)
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
        if (
            tokenAddress_       == address(0) ||
            paymentToken_       == address(0) ||
            registryAddress_    == address(0) ||
            kycRegistryAddress_ == address(0)
        ) revert PropertyOffering__ZeroAddress();
        if (pricePerToken_ == 0) revert PropertyOffering__InvalidPrice();
        if (hardCap_ == 0 || softCap_ == 0 || softCap_ > hardCap_) {
            revert PropertyOffering__InvalidCaps(softCap_, hardCap_);
        }
        if (startTime_ >= endTime_) revert PropertyOffering__InvalidTimeWindow(startTime_, endTime_);

        // A hard cap above the token's ceiling would make finalization mint-revert forever.
        uint256 tokenMaxSupply = IPropertyToken(tokenAddress_).maxSupply();
        if (hardCap_ > tokenMaxSupply) {
            revert PropertyOffering__HardCapExceedsMaxSupply(hardCap_, tokenMaxSupply);
        }

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
        if (tokenAmount == 0) revert PropertyOffering__ZeroAmount();
        if (!kycRegistry.isVerified(msg.sender)) revert KYCRegistry__NotVerified(msg.sender);
        if (block.timestamp < startTime || block.timestamp > endTime) {
            revert PropertyOffering__OfferingNotActive();
        }
        if (finalized || cancelled) revert PropertyOffering__OfferingNotActive();
        if (totalTokensCommitted + tokenAmount > hardCap) revert PropertyOffering__HardCapReached();

        // Round UP so small commitments can never be free.
        uint256 paymentAmount = Math.mulDiv(tokenAmount, pricePerToken, PRICE_SCALE, Math.Rounding.Ceil);

        paymentToken.safeTransferFrom(msg.sender, address(this), paymentAmount);

        if (!_hasInvested[msg.sender]) {
            _investors.push(msg.sender);
            _hasInvested[msg.sender] = true;
        }

        _investments[msg.sender]      += tokenAmount;
        _paymentsReceived[msg.sender] += paymentAmount;
        totalTokensCommitted          += tokenAmount;
        totalPaymentsReceived         += paymentAmount;

        emit InvestmentMade(propertyId, msg.sender, tokenAmount, paymentAmount);
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Caller must hold ADMIN_ROLE and the soft cap must be reached. O(1): escrow moves
    ///      to the property owner in one transfer and investors mint their own allocation via
    ///      claimTokens(). May be called before endTime — reaching the soft cap early is a
    ///      successful offering.
    function finalizeOffering() external onlyRole(ADMIN_ROLE) nonReentrant {
        if (finalized)  revert PropertyOffering__AlreadyFinalized();
        if (cancelled)  revert PropertyOffering__AlreadyCancelled();
        if (totalTokensCommitted < softCap) revert PropertyOffering__SoftCapNotReached();

        finalized    = true;
        lockupExpiry = block.timestamp + lockupDuration;

        uint256 totalPayment = totalPaymentsReceived;
        if (totalPayment > 0) {
            Types.Property memory prop = registry.getProperty(propertyId);
            paymentToken.safeTransfer(prop.owner, totalPayment);
        }

        // Transition registry: OfferingOpen → OfferingClosed
        registry.closeOffering(propertyId);

        emit OfferingFinalized(propertyId, address(this), totalPayment);
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Pull-based issuance. Replaces the old O(n) mint loop in finalizeOffering(),
    ///      which ran out of gas — and so could never finalize — past a few hundred investors.
    function claimTokens() external nonReentrant {
        _claimTokensFor(msg.sender);
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Convenience for the operator to push tokens to investors who never claim.
    ///      The caller chooses the batch size, so gas stays bounded by construction.
    function claimTokensFor(address[] calldata investors) external nonReentrant {
        uint256 len = investors.length;
        for (uint256 i = 0; i < len; ++i) {
            _claimTokensFor(investors[i]);
        }
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Caller must hold ADMIN_ROLE. Marks the offering cancelled so investors can refund.
    function cancelOffering() external onlyRole(ADMIN_ROLE) {
        if (finalized) revert PropertyOffering__AlreadyFinalized();
        if (cancelled) revert PropertyOffering__AlreadyCancelled();

        cancelled = true;
        _tryCloseOffering();

        emit OfferingCancelled(propertyId, address(this));
    }

    /// @inheritdoc IPropertyOffering
    /// @dev Permissionless failure path: once the window has closed with the soft cap unmet,
    ///      anyone may open refunds. Without this, escrow would depend on the admin choosing
    ///      to act, with no recourse for investors if they never did.
    function expireOffering() external {
        if (finalized) revert PropertyOffering__AlreadyFinalized();
        if (cancelled) revert PropertyOffering__AlreadyCancelled();
        if (block.timestamp <= endTime) revert PropertyOffering__OfferingNotEnded();
        if (totalTokensCommitted >= softCap) revert PropertyOffering__SoftCapAlreadyReached();

        cancelled = true;
        _tryCloseOffering();

        emit OfferingCancelled(propertyId, address(this));
    }

    /// @inheritdoc IPropertyOffering
    function refund() external nonReentrant {
        if (!cancelled) revert PropertyOffering__NotCancelled();

        uint256 paymentAmount = _paymentsReceived[msg.sender];
        if (paymentAmount == 0) revert PropertyOffering__NothingToClaim(msg.sender);

        _paymentsReceived[msg.sender] = 0;
        _investments[msg.sender]      = 0;

        paymentToken.safeTransfer(msg.sender, paymentAmount);

        emit InvestorRefunded(propertyId, msg.sender, paymentAmount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @inheritdoc IPropertyOffering
    /// @dev Every investor shares the same expiry, fixed at finalization; 0 before that.
    function getLockupExpiry(address) external view returns (uint256) {
        return lockupExpiry;
    }

    /// @inheritdoc IPropertyOffering
    function getInvestment(address investor) external view returns (uint256) {
        return _investments[investor];
    }

    /// @inheritdoc IPropertyOffering
    function hasClaimedTokens(address investor) external view returns (bool) {
        return _tokensClaimed[investor];
    }

    /// @inheritdoc IPropertyOffering
    function investorCount() external view returns (uint256) {
        return _investors.length;
    }

    /// @inheritdoc IPropertyOffering
    function investorAt(uint256 index) external view returns (address) {
        return _investors[index];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _claimTokensFor(address investor) internal {
        if (!finalized) revert PropertyOffering__NotFinalized();
        if (_tokensClaimed[investor]) revert PropertyOffering__TokensAlreadyClaimed(investor);

        uint256 amount = _investments[investor];
        if (amount == 0) revert PropertyOffering__NothingToClaim(investor);

        _tokensClaimed[investor] = true;

        IPropertyToken token = IPropertyToken(tokenAddress);
        token.mint(investor, amount);
        token.setLockupExpiry(investor, lockupExpiry);

        emit OfferingTokensClaimed(propertyId, investor, amount, lockupExpiry);
    }

    /// @dev Best-effort registry transition. A revert here (e.g. the property was already
    ///      paused or delisted) must never trap investor escrow, so failure is tolerated.
    function _tryCloseOffering() internal {
        try registry.closeOffering(propertyId) {} catch {}
    }
}
