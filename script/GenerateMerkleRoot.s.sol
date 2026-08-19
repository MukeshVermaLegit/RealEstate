// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

/// @title GenerateMerkleRoot
/// @notice Off-chain Forge script that reads a JSON file of (address, amount) allocations,
///         builds a Merkle tree and prints the root plus each investor's proof.
///
/// Usage:
///   1. Create a JSON file at the path set in env var ALLOCATIONS_FILE, e.g.:
///      allocations.json:
///      [
///        {"investor": "0xABCD...", "amount": "600000000000000000000"},
///        {"investor": "0xDEF0...", "amount": "400000000000000000000"}
///      ]
///
///   2. Run:
///      ALLOCATIONS_FILE=./allocations.json forge script script/GenerateMerkleRoot.s.sol \
///        --sig "run()" -vvvv
///
/// Leaf format (matches RentDistributor.sol):
///   leaf = keccak256(abi.encodePacked(investor, amount))
///
/// The Merkle tree is a full binary tree padded to the next power-of-two with the last
/// leaf repeated. Pairs are combined with commutativeKeccak256 (sorted before hashing)
/// so proofs are compatible with OpenZeppelin's MerkleProof.verify().
contract GenerateMerkleRoot is Script {
    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Allocation {
        address investor;
        uint256 amount;
    }

    // ─── Entry point ─────────────────────────────────────────────────────────

    function run() external view {
        string memory filePath = vm.envString("ALLOCATIONS_FILE");
        string memory raw      = vm.readFile(filePath);

        // Parse JSON array — expects keys "investor" and "amount" per element.
        // vm.parseJson returns ABI-encoded bytes; we decode the full array at once.
        bytes memory encoded = vm.parseJson(raw);
        Allocation[] memory allocs = abi.decode(encoded, (Allocation[]));

        require(allocs.length > 0, "GenerateMerkleRoot: empty allocations");

        // ── Build leaves ──────────────────────────────────────────────────────
        uint256 n = allocs.length;
        bytes32[] memory leaves = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            leaves[i] = keccak256(abi.encodePacked(allocs[i].investor, allocs[i].amount));
        }

        // ── Build tree ────────────────────────────────────────────────────────
        bytes32[][] memory tree = _buildTree(leaves);
        bytes32 root = tree[tree.length - 1][0];

        // ── Output ────────────────────────────────────────────────────────────
        console2.log("=== Merkle Root ===");
        console2.logBytes32(root);
        console2.log("");
        console2.log("=== Proofs ===");

        for (uint256 i = 0; i < n; ++i) {
            bytes32[] memory proof = _getProof(tree, i);
            console2.log("Investor:", allocs[i].investor);
            console2.log("Amount:  ", allocs[i].amount);
            console2.log("Leaf:    ");
            console2.logBytes32(leaves[i]);
            console2.log("Proof:   ");
            for (uint256 j = 0; j < proof.length; ++j) {
                console2.logBytes32(proof[j]);
            }
            console2.log("---");
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Builds a full Merkle tree as a 2-D array of levels.
    ///      tree[0] = leaf layer; tree[tree.length-1] = [root].
    ///      Odd-length layers duplicate the last node before pairing.
    function _buildTree(bytes32[] memory leaves) internal pure returns (bytes32[][] memory tree) {
        uint256 n      = leaves.length;
        uint256 levels = _ceilLog2(n) + 1;
        tree           = new bytes32[][](levels);
        tree[0]        = leaves;

        for (uint256 lvl = 1; lvl < levels; ++lvl) {
            bytes32[] memory prev   = tree[lvl - 1];
            uint256          pLen   = prev.length;
            uint256          newLen = (pLen + 1) / 2;
            bytes32[]  memory cur   = new bytes32[](newLen);

            for (uint256 i = 0; i < newLen; ++i) {
                bytes32 left  = prev[2 * i];
                bytes32 right = (2 * i + 1 < pLen) ? prev[2 * i + 1] : left;
                cur[i] = _commutativeKeccak256(left, right);
            }
            tree[lvl] = cur;
        }
    }

    /// @dev Returns the Merkle proof for leaf at `index` in the tree.
    function _getProof(bytes32[][] memory tree, uint256 index) internal pure returns (bytes32[] memory proof) {
        uint256 depth = tree.length - 1; // number of levels above the leaf layer
        proof         = new bytes32[](depth);

        for (uint256 lvl = 0; lvl < depth; ++lvl) {
            bytes32[] memory layer  = tree[lvl];
            uint256          pLen   = layer.length;
            uint256          sibling = (index % 2 == 0)
                ? (index + 1 < pLen ? index + 1 : index)  // right sibling (or self if last)
                : index - 1;                               // left sibling
            proof[lvl] = layer[sibling];
            index /= 2;
        }
    }

    /// @dev Commutative keccak256 — matches OZ Hashes.commutativeKeccak256.
    function _commutativeKeccak256(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// @dev Ceiling of log2(n), rounded up (used to size the tree).
    function _ceilLog2(uint256 n) internal pure returns (uint256 result) {
        if (n <= 1) return 0;
        n -= 1;
        while (n > 0) {
            ++result;
            n >>= 1;
        }
    }
}
