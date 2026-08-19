// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRentDistributor
/// @notice Manages rental income collection and Merkle-proof-based distribution to investors.
///         Off-chain tooling computes a Merkle tree of (investor, claimableAmount) pairs;
///         the root is stored on-chain so each investor can claim with a proof.
interface IRentDistributor {
    /// @notice Property owner deposits rent for a new period and supplies a Merkle root.
    /// @param propertyId    Property whose rent is being deposited.
    /// @param amount        Amount of payment token deposited (must equal sum of all leaf amounts).
    /// @param merkleRoot    Root of the off-chain Merkle tree: leaves = keccak256(abi.encodePacked(address, amount)).
    /// @param snapshotBlock Block number at which token balances were snapshotted for entitlement computation.
    ///                      Pass 0 to disable on-chain snapshot enforcement (Merkle proof is still verified).
    ///                      When non-zero, must be strictly less than block.number, and claimable amounts
    ///                      are bounded on-chain by ERC20Votes.getPastVotes() at that block.
    /// @return periodId     The ID of the new rent period.
    function depositRent(
        uint256 propertyId,
        uint256 amount,
        bytes32 merkleRoot,
        uint256 snapshotBlock
    ) external returns (uint256 periodId);

    /// @notice Investor claims their allocation for a single period via Merkle proof.
    /// @param propertyId       The property to claim rent for.
    /// @param periodId         The rent period to claim.
    /// @param claimableAmount  Amount allocated to msg.sender (must match the Merkle leaf).
    /// @param merkleProof      Sibling hashes proving inclusion in period.merkleRoot.
    function claimRent(
        uint256 propertyId,
        uint256 periodId,
        uint256 claimableAmount,
        bytes32[] calldata merkleProof
    ) external;

    /// @notice Batch claim across multiple periods in a single transaction.
    /// @param propertyIds  Array of property IDs (must be same length as other arrays).
    /// @param periodIds    Array of period IDs.
    /// @param amounts      Array of claimable amounts.
    /// @param proofs       Array of Merkle proofs (one per claim).
    function claimMultiple(
        uint256[] calldata propertyIds,
        uint256[] calldata periodIds,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external;

    /// @notice ADMIN_ROLE: recover unclaimed funds after the reclaim deadline.
    ///         Transfers the remaining (totalRent - totalClaimed) back to the depositor.
    /// @param propertyId  The property ID.
    /// @param periodId    The period ID whose funds are being reclaimed.
    function reclaimUnclaimed(uint256 propertyId, uint256 periodId) external;
}
