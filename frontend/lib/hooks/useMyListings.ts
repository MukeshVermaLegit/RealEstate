import { useMemo } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { PropertyRegistryABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';
import { collectLogs } from '../chain/getLogsChunked';
import { PropertyStatus, type Property } from '../types';
import { usePropertyCount, useProperties } from './useProperties';

/**
 * The connected wallet's own property listings.
 *
 * The registry has no owner index, so this reuses the same multicall the public
 * list page makes (one `getProperty` per id, batched) and filters client-side.
 * That keeps the contract free of unbounded storage arrays; if the registry ever
 * outgrows a single multicall, this is the hook to swap for an indexer query.
 */
export function useMyListings() {
  const { address } = useAccount();
  const { data: count, refetch: refetchCount } = usePropertyCount();
  const all = useProperties(Number(count ?? 0n));

  const properties = useMemo<Property[]>(() => {
    if (!address) return [];
    const me = address.toLowerCase();
    return all.properties
      .filter((p) => p.owner.toLowerCase() === me)
      .sort((a, b) => Number(b.propertyId - a.propertyId));
  }, [all.properties, address]);

  return {
    properties,
    isPending: !!address && all.isPending,
    refetch: () => {
      refetchCount();
      all.refetch();
    },
  };
}

/** Listings that still need something from their owner. */
export function draftsNeedingAction(properties: Property[]): Property[] {
  return properties.filter((p) => p.status === PropertyStatus.Draft);
}

// ─── Review feedback ─────────────────────────────────────────────────────────

export type ReviewNote = { propertyId: bigint; reason: string; blockNumber: bigint };

/**
 * Latest `PropertySubmissionRejected` reason per property, keyed by decimal id.
 *
 * Scans from block 0 — fine for this registry's volume and for a testnet
 * deployment; a mainnet-scale build should pass a deployment block or read the
 * same event from an indexer.
 */
export function useReviewNotes(propertyIds: bigint[]) {
  const { addresses, deployBlocks } = useContracts();
  const client = usePublicClient();

  const ids = useMemo(() => propertyIds.map(String).sort(), [propertyIds]);

  const { data } = useQuery({
    queryKey: ['review-notes', addresses.propertyRegistry, ids] as const,
    enabled: !!client && ids.length > 0,
    staleTime: 30_000,
    // Some RPC providers cap eth_getLogs ranges. Losing the review note is a
    // cosmetic degradation, so fail quietly rather than retrying the scan.
    retry: false,
    queryFn: async (): Promise<Record<string, ReviewNote>> => {
      const head = await client!.getBlockNumber();
      const logs = await collectLogs(deployBlocks.propertyRegistry, head, (fromBlock, toBlock) =>
        client!.getContractEvents({
          address: addresses.propertyRegistry,
          abi: PropertyRegistryABI,
          eventName: 'PropertySubmissionRejected',
          args: { propertyId: ids.map((id) => BigInt(id)) },
          fromBlock,
          toBlock,
        }),
      );

      // Logs arrive oldest-first, so a later rejection overwrites an earlier one.
      const byId: Record<string, ReviewNote> = {};
      for (const log of logs) {
        const propertyId = log.args.propertyId;
        const reason = log.args.reason;
        if (propertyId === undefined || reason === undefined) continue;
        byId[propertyId.toString()] = {
          propertyId,
          reason,
          blockNumber: log.blockNumber ?? 0n,
        };
      }
      return byId;
    },
  });

  return data ?? {};
}
