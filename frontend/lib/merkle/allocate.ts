import type { Allocation } from './tree';

export type Holder = {
  address: `0x${string}`;
  /** getPastVotes(address, snapshotBlock) — equals balance, since PropertyToken self-delegates. */
  votes: bigint;
};

export type AllocationResult = {
  allocations: Allocation[];
  /** Sum of `allocations` — what investors can actually claim. */
  allocated: bigint;
  /**
   * totalRent - allocated. Sits in the contract until the 90-day reclaim window
   * opens. Non-zero when some of the supply is held by an address that cannot
   * claim (see `excluded`).
   */
  unallocated: bigint;
  /** Votes held at the snapshot by addresses left out of the tree. */
  excludedVotes: bigint;
};

/**
 * Split `totalRent` across holders pro-rata to their snapshot votes.
 *
 * RentDistributor._claim caps each claimant at
 *     ceil(pastVotes * totalRent / pastTotalSupply)
 * so this uses the largest-remainder method: every holder gets
 * floor(votes * totalRent / supply), then the truncation dust is handed out ONE
 * WEI AT A TIME to the largest remainders. Dumping the dust on a single holder
 * would push them past their cap and their claim would revert.
 *
 * `pastTotalSupply` MUST stay the denominator even when addresses are excluded.
 * Redistributing an excluded holder's share would push the remaining holders
 * above their own on-chain caps, so that share is deliberately left unallocated
 * rather than shared out.
 */
export function allocate(
  holders: Holder[],
  totalRent: bigint,
  pastTotalSupply: bigint,
  excluded: Set<string> = new Set(),
): AllocationResult {
  if (totalRent <= 0n) throw new Error('totalRent must be positive');
  if (pastTotalSupply <= 0n) throw new Error('pastTotalSupply must be positive');

  const excludedLower = new Set([...excluded].map((a) => a.toLowerCase()));

  let excludedVotes = 0n;
  const eligible: Holder[] = [];
  for (const h of holders) {
    if (h.votes <= 0n) continue;
    if (excludedLower.has(h.address.toLowerCase())) {
      excludedVotes += h.votes;
      continue;
    }
    eligible.push(h);
  }

  if (eligible.length === 0) {
    return { allocations: [], allocated: 0n, unallocated: totalRent, excludedVotes };
  }

  // Base share plus the remainder that decides who receives dust.
  const rows = eligible.map((h) => {
    const numerator = h.votes * totalRent;
    return {
      address: h.address,
      base: numerator / pastTotalSupply,
      remainder: numerator % pastTotalSupply,
    };
  });

  const baseSum = rows.reduce((acc, r) => acc + r.base, 0n);
  // Everything the eligible holders are collectively entitled to, floor-rounded.
  const eligibleVotes = eligible.reduce((acc, h) => acc + h.votes, 0n);
  const eligibleTotal = (eligibleVotes * totalRent) / pastTotalSupply;
  let dust = eligibleTotal - baseSum;

  // Largest remainder first; address breaks ties so the tree is deterministic.
  const order = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1
      : a.remainder > b.remainder ? -1 : 1,
  );

  const extra = new Map<string, bigint>();
  for (const row of order) {
    if (dust <= 0n) break;
    // A zero remainder means floor == ceil for this holder: one more wei would
    // break their cap, so they are skipped.
    if (row.remainder === 0n) continue;
    extra.set(row.address, 1n);
    dust -= 1n;
  }

  const allocations: Allocation[] = rows
    .map((r) => ({
      investor: r.address,
      amount: (r.base + (extra.get(r.address) ?? 0n)).toString(),
    }))
    .filter((a) => a.amount !== '0');

  const allocated = allocations.reduce((acc, a) => acc + BigInt(a.amount), 0n);

  return {
    allocations,
    allocated,
    unallocated: totalRent - allocated,
    excludedVotes,
  };
}
