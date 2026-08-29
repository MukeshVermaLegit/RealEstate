/**
 * Generates test/fixtures/merkle-allocation.json from the REAL allocator + tree
 * modules the app uses, so a Foundry test can assert that RentDistributor accepts
 * every proof this TypeScript produces.
 *
 * Run: npx tsx scripts/gen-merkle-fixture.ts
 *
 * If the allocator or leaf format ever changes, regenerate and re-run forge test —
 * a drift between the two implementations shows up as a failing claim, not as
 * silently unclaimable rent in production.
 */
import { writeFileSync } from 'fs';
import { allocate, type Holder } from '../lib/merkle/allocate';
import { buildTree, leafOf, verifyProof } from '../lib/merkle/tree';

function addr(n: number): `0x${string}` {
  return ('0x' + n.toString(16).padStart(40, '0')) as `0x${string}`;
}

// Deliberately awkward numbers: the votes do NOT divide the rent evenly, so the
// largest-remainder path and the on-chain ceil() cap both get exercised.
const holders: Holder[] = [
  { address: addr(0xa11ce), votes: 3_333_333_333_333_333_333n },
  { address: addr(0xb0b),   votes: 2_777_777_777_777_777_777n },
  { address: addr(0xca401), votes: 1_111_111_111_111_111_111n },
  { address: addr(0xdafe),  votes: 1_777_777_777_777_777_778n },
  // Stands in for the marketplace escrow — holds supply, cannot claim.
  { address: addr(0xe5c20), votes: 1_000_000_000_000_000_000n },
];

const escrow = addr(0xe5c20);
const pastTotalSupply = holders.reduce((a, h) => a + h.votes, 0n);
const totalRent = 7_777_777_777n; // USDC-ish, indivisible by the vote weights

const result = allocate(holders, totalRent, pastTotalSupply, new Set([escrow]));
const tree = buildTree(result.allocations);

// Refuse to emit a fixture that our own verifier rejects.
result.allocations.forEach((a, i) => {
  if (!verifyProof(tree.proofFor(i), tree.root, leafOf(a.investor, BigInt(a.amount)))) {
    throw new Error(`local verification failed for ${a.investor}`);
  }
});

// Flat parallel arrays rather than arrays-of-objects: forge's JSON cheatcodes
// have no `[*]` wildcard, so a nested shape can only be read one index at a time.
const fixture = {
  totalRent: totalRent.toString(),
  pastTotalSupply: pastTotalSupply.toString(),
  merkleRoot: tree.root,
  allocated: result.allocated.toString(),
  unallocated: result.unallocated.toString(),
  escrow,
  holderAddresses: holders.map((h) => h.address),
  holderVotes: holders.map((h) => h.votes.toString()),
  claimInvestors: result.allocations.map((a) => a.investor),
  claimAmounts: result.allocations.map((a) => a.amount),
  claimProofs: result.allocations.map((_, i) => tree.proofFor(i)),
};

const out = new URL('../../test/fixtures/merkle-allocation.json', import.meta.url).pathname;
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');

console.log(`wrote ${out}`);
console.log(`  root        ${tree.root}`);
console.log(`  claims      ${fixture.claimInvestors.length}`);
console.log(`  allocated   ${result.allocated}`);
console.log(`  unallocated ${result.unallocated} (escrow share, unclaimable by design)`);
