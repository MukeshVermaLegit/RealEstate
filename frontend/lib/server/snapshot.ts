import { parseAbiItem, type PublicClient } from 'viem';
import { collectLogs } from '../chain/getLogsChunked';
import { PropertyRegistryABI, PropertyTokenABI } from '../contracts/abis';
import { CONTRACT_ADDRESSES, DEPLOY_BLOCKS, type SupportedChainId } from '../contracts/addresses';
import type { Holder } from '../merkle/allocate';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export type Snapshot = {
  tokenAddress: `0x${string}`;
  holders: Holder[];
  pastTotalSupply: bigint;
};

/**
 * Who held how much of a property token at `snapshotBlock`.
 *
 * Candidates come from Transfer logs (the only way to enumerate ERC-20 holders),
 * but the authoritative number is `getPastVotes`, which is exactly what
 * RentDistributor reads when it caps a claim. PropertyToken self-delegates on
 * first receipt, so votes track balances without the holder doing anything.
 */
export async function buildSnapshot(
  client: PublicClient,
  chainId: SupportedChainId,
  propertyId: bigint,
  snapshotBlock: bigint,
): Promise<Snapshot> {
  const addresses = CONTRACT_ADDRESSES[chainId];

  const tokenAddress = await client.readContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'getPropertyToken',
    args: [propertyId],
  }) as `0x${string}`;

  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Property ${propertyId} has no token yet — issue tokens before depositing rent`);
  }

  const pastTotalSupply = await client.readContract({
    address: tokenAddress,
    abi: PropertyTokenABI,
    functionName: 'getPastTotalSupply',
    args: [snapshotBlock],
  }) as bigint;

  if (pastTotalSupply === 0n) {
    // depositRent rejects this too, but failing here gives a usable message
    // instead of an opaque revert after the admin has already approved USDC.
    throw new Error(
      `No supply existed at block ${snapshotBlock} — pick a block after the token was minted`,
    );
  }

  const logs = await collectLogs(
    DEPLOY_BLOCKS[chainId].propertyRegistry,
    snapshotBlock,
    (fromBlock, toBlock) =>
      client.getLogs({ address: tokenAddress, event: TRANSFER_EVENT, fromBlock, toBlock }),
  );

  const candidates = new Set<`0x${string}`>();
  for (const log of logs) {
    // `from` matters too: an address that sent everything away still needs to be
    // probed, because getPastVotes at an earlier-but-still-relevant block is what
    // decides eligibility, not the final balance.
    if (log.args.from) candidates.add(log.args.from);
    if (log.args.to) candidates.add(log.args.to);
  }
  candidates.delete('0x0000000000000000000000000000000000000000');

  const list = [...candidates];
  const votes = await client.multicall({
    contracts: list.map((address) => ({
      address: tokenAddress,
      abi: PropertyTokenABI,
      functionName: 'getPastVotes',
      args: [address, snapshotBlock],
    })),
    allowFailure: true,
  });

  const holders: Holder[] = [];
  list.forEach((address, i) => {
    const result = votes[i];
    if (result.status !== 'success') return;
    const amount = result.result as bigint;
    if (amount > 0n) holders.push({ address, votes: amount });
  });

  if (holders.length === 0) {
    // Supply exists but nobody has voting power. ERC20Votes only checkpoints
    // accounts that have delegated, and tokens minted by the pre-2026-08-29
    // factory never self-delegated — so RentDistributor would cap every claim at
    // zero and the rent would be permanently unclaimable. Fail loudly here.
    throw new Error(
      `Property ${propertyId} has supply at block ${snapshotBlock} but no holder has voting power. ` +
      'Holders of tokens minted before the factory fix must call delegate(self) once, ' +
      'and the snapshot block must be AFTER that transaction.',
    );
  }

  return { tokenAddress, holders, pastTotalSupply };
}
