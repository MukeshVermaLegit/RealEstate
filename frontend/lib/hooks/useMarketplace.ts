import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReadContracts,
  useWriteContract,
  usePublicClient,
  useWatchContractEvent,
} from 'wagmi';
import { parseAbiItem } from 'viem';
import { collectLogs } from '../chain/getLogsChunked';
import { MarketplaceABI, PropertyTokenABI, ERC20ABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';
import type { ListingStatus } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Listing = {
  listingId:     bigint;
  propertyId:    bigint;
  seller:        `0x${string}`;
  tokenAmount:   bigint;
  pricePerToken: bigint;
  status:        number;
  createdAt:     bigint;
  tokenAddress:  `0x${string}`;
  expiresAt:     bigint;
};

const LISTING_STATUS_ACTIVE = 1;

function isActive(l: Listing): boolean {
  if (l.status !== LISTING_STATUS_ACTIVE) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  return l.expiresAt === 0n || l.expiresAt > now;
}

// ─── Listing discovery via getLogs ────────────────────────────────────────────

const LISTING_CREATED_EVENT = parseAbiItem(
  'event ListingCreated(uint256 indexed listingId, uint256 indexed propertyId, address indexed seller, uint256 tokenAmount, uint256 pricePerToken, uint48 expiresAt)',
);

async function fetchListingIds(
  publicClient: ReturnType<typeof usePublicClient>,
  address: `0x${string}`,
  fromBlock: bigint,
  propertyId?: bigint,
): Promise<bigint[]> {
  if (!publicClient) return [];
  const head = await publicClient.getBlockNumber();
  const logs = await collectLogs(fromBlock, head, (from, to) =>
    publicClient.getLogs({
      address,
      event: LISTING_CREATED_EVENT,
      args:  propertyId !== undefined ? { propertyId } : undefined,
      fromBlock: from,
      toBlock:   to,
    }),
  );
  return [...new Set(logs.map((l) => l.args.listingId!))];
}

// ─── useActiveListings ────────────────────────────────────────────────────────

export function useActiveListings(propertyId?: bigint): {
  listings:  Listing[];
  isLoading: boolean;
  refetch:   () => void;
} {
  const { addresses, deployBlocks } = useContracts();
  const publicClient   = usePublicClient();
  const queryClient    = useQueryClient();

  // Step 1 — collect listing IDs from events
  const {
    data:     listingIds,
    isPending: idsPending,
    refetch:  refetchIds,
  } = useQuery({
    queryKey:  ['listing-ids', addresses.marketplace, propertyId?.toString()],
    queryFn:   () =>
      fetchListingIds(publicClient, addresses.marketplace, deployBlocks.marketplace, propertyId),
    staleTime: 20_000,
  });

  // Step 2 — batch getListing() for each ID
  const contracts = useMemo(
    () =>
      (listingIds ?? []).map((id) => ({
        address:      addresses.marketplace,
        abi:          MarketplaceABI,
        functionName: 'getListing' as const,
        args:         [id] as const,
      })),
    [listingIds, addresses.marketplace],
  );

  const listingsEnabled = (listingIds?.length ?? 0) > 0;

  const { data: listingData, isPending: listingsPending } = useReadContracts({
    contracts,
    query: { enabled: listingsEnabled },
  });

  // Watch for new listings and invalidate cache
  useWatchContractEvent({
    address:   addresses.marketplace,
    abi:       MarketplaceABI,
    eventName: 'ListingCreated',
    onLogs: () => {
      void queryClient.invalidateQueries({ queryKey: ['listing-ids'] });
    },
  });

  useWatchContractEvent({
    address:   addresses.marketplace,
    abi:       MarketplaceABI,
    eventName: 'ListingCancelled',
    onLogs: () => {
      void queryClient.invalidateQueries({ queryKey: ['listing-ids'] });
    },
  });

  const listings = useMemo<Listing[]>(() => {
    if (!listingData) return [];
    return listingData
      .filter((item) => item.status === 'success' && item.result != null)
      .map((item) => {
        const r = (item.result as unknown) as {
          listingId: bigint; propertyId: bigint; seller: `0x${string}`;
          tokenAmount: bigint; pricePerToken: bigint; status: number;
          createdAt: bigint; tokenAddress: `0x${string}`; expiresAt: number;
        };
        return {
          listingId:     r.listingId,
          propertyId:    r.propertyId,
          seller:        r.seller,
          tokenAmount:   r.tokenAmount,
          pricePerToken: r.pricePerToken,
          status:        r.status,
          createdAt:     r.createdAt,
          tokenAddress:  r.tokenAddress,
          expiresAt:     BigInt(r.expiresAt),
        } satisfies Listing;
      })
      .filter(isActive);
  }, [listingData]);

  const refetch = useCallback(() => {
    void refetchIds();
  }, [refetchIds]);

  return {
    listings,
    // A disabled query stays `pending`; with zero listing IDs there is nothing
    // left to fetch, so don't report loading.
    isLoading: idsPending || (listingsEnabled && listingsPending),
    refetch,
  };
}

// ─── useMyListings ────────────────────────────────────────────────────────────

export function useMyListings(address: `0x${string}` | undefined) {
  const { listings, isLoading, refetch } = useActiveListings();
  const mine = useMemo(
    () =>
      address
        ? listings.filter((l) => l.seller.toLowerCase() === address.toLowerCase())
        : [],
    [listings, address],
  );
  return { listings: mine, isLoading, refetch };
}

// ─── useCreateListing ─────────────────────────────────────────────────────────

export function useCreateListing() {
  const { addresses }        = useContracts();
  const { writeContractAsync, isPending, error } = useWriteContract();
  const queryClient          = useQueryClient();

  const approve = useCallback(
    (tokenAddress: `0x${string}`, amount: bigint) =>
      writeContractAsync({
        address:      tokenAddress,
        abi:          PropertyTokenABI,
        functionName: 'approve',
        args:         [addresses.marketplace, amount],
      }),
    [addresses.marketplace, writeContractAsync],
  );

  const createListing = useCallback(
    (propertyId: bigint, tokenAmount: bigint, pricePerToken: bigint, expiresAt: bigint) =>
      writeContractAsync({
        address:      addresses.marketplace,
        abi:          MarketplaceABI,
        functionName: 'createListing',
        // uint48 is typed as `number` in viem; safe cast — value fits in 48 bits
        args:         [propertyId, tokenAmount, pricePerToken, expiresAt as unknown as number],
      }).then((hash) => {
        void queryClient.invalidateQueries({ queryKey: ['listing-ids'] });
        return hash;
      }),
    [addresses.marketplace, writeContractAsync, queryClient],
  );

  return { approve, createListing, isPending, error };
}

// ─── useBuyListing ────────────────────────────────────────────────────────────

export function useBuyListing() {
  const { addresses }        = useContracts();
  const { writeContractAsync, isPending, error } = useWriteContract();
  const queryClient          = useQueryClient();

  const approve = useCallback(
    (amount: bigint) =>
      writeContractAsync({
        address:      addresses.paymentToken,
        abi:          ERC20ABI,
        functionName: 'approve',
        args:         [addresses.marketplace, amount],
      }),
    [addresses.marketplace, addresses.paymentToken, writeContractAsync],
  );

  const buy = useCallback(
    (listingId: bigint, amount: bigint) =>
      writeContractAsync({
        address:      addresses.marketplace,
        abi:          MarketplaceABI,
        functionName: 'buyListing',
        args:         [listingId, amount],
      }).then((hash) => {
        void queryClient.invalidateQueries({ queryKey: ['listing-ids'] });
        return hash;
      }),
    [addresses.marketplace, writeContractAsync, queryClient],
  );

  return { approve, buy, isPending, error };
}

// ─── useCancelListing ────────────────────────────────────────────────────────

export function useCancelListing() {
  const { addresses }        = useContracts();
  const { writeContractAsync } = useWriteContract();
  const queryClient          = useQueryClient();

  return useCallback(
    (listingId: bigint) =>
      writeContractAsync({
        address:      addresses.marketplace,
        abi:          MarketplaceABI,
        functionName: 'cancelListing',
        args:         [listingId],
      }).then((hash) => {
        void queryClient.invalidateQueries({ queryKey: ['listing-ids'] });
        return hash;
      }),
    [addresses.marketplace, writeContractAsync, queryClient],
  );
}
