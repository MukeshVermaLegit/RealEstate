import { encodePacked, keccak256, type Hex } from 'viem';

/**
 * Merkle tree matching RentDistributor's on-chain verification.
 *
 * Leaf   : keccak256(abi.encodePacked(address investor, uint256 amount))
 * Node   : keccak256(sorted(left, right))  — commutative, so proofs verify with
 *          OpenZeppelin's MerkleProof.verify without carrying left/right flags.
 * Odd node at a level is PROMOTED to the next level rather than paired with a
 * duplicate of itself. Duplicating would let a proof for the duplicated leaf be
 * replayed as a proof for an internal node.
 *
 * Do not swap in @openzeppelin/merkle-tree here: it hashes leaves as
 * keccak256(keccak256(abi.encode(...))), which is a different leaf than the
 * contract computes, so every proof it produces would be rejected.
 */

export type Allocation = {
  /** Checksummed or lower-case address — hashing normalises it either way. */
  investor: `0x${string}`;
  /** Payment-token wei, as a decimal string so it survives JSON. */
  amount: string;
};

export function leafOf(investor: `0x${string}`, amount: bigint): Hex {
  return keccak256(encodePacked(['address', 'uint256'], [investor, amount]));
}

function hashPair(a: Hex, b: Hex): Hex {
  // Sort as big-endian byte strings; both are 0x-prefixed 32-byte hex of equal
  // length, so a lexicographic compare on the lower-cased hex is equivalent.
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(`0x${lo.slice(2)}${hi.slice(2)}` as Hex);
}

/** One tree level per entry, level 0 being the leaves. */
function buildLevels(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) throw new Error('Cannot build a Merkle tree with no leaves');

  const levels: Hex[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      // Lone trailing node is promoted untouched.
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
    }
    levels.push(next);
    current = next;
  }

  return levels;
}

export type MerkleTree = {
  root: Hex;
  /** Proof for the leaf at `index` in the original allocation order. */
  proofFor: (index: number) => Hex[];
};

export function buildTree(allocations: Allocation[]): MerkleTree {
  const leaves = allocations.map((a) => leafOf(a.investor, BigInt(a.amount)));
  const levels = buildLevels(leaves);
  const root = levels[levels.length - 1][0];

  return {
    root,
    proofFor(index: number): Hex[] {
      if (index < 0 || index >= leaves.length) {
        throw new Error(`Leaf index ${index} out of range (${leaves.length} leaves)`);
      }
      const proof: Hex[] = [];
      let idx = index;
      // The last level is the root itself and contributes no sibling.
      for (let level = 0; level < levels.length - 1; level++) {
        const nodes = levels[level];
        const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
        // No sibling means this node was promoted — nothing to add to the proof.
        if (siblingIdx < nodes.length) proof.push(nodes[siblingIdx]);
        idx = Math.floor(idx / 2);
      }
      return proof;
    },
  };
}

/** Local re-verification, mirroring MerkleProof.verify. */
export function verifyProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let computed = leaf;
  for (const node of proof) computed = hashPair(computed, node);
  return computed.toLowerCase() === root.toLowerCase();
}
