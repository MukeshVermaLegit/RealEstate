'use client';

import { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits } from 'viem';
import { usePropertyCount, useProperties } from '../../lib/hooks/useProperties';
import { useActiveListings, type Listing } from '../../lib/hooks/useMarketplace';
import { useKYCStatus } from '../../lib/hooks/useKYC';
import { ListingCard } from '../../components/ListingCard';
import { BuyModal } from '../../components/BuyModal';
import { CreateListingModal } from '../../components/CreateListingModal';

// ─── Filter / Sort types ─────────────────────────────────────────────────────

type SortKey = 'price-asc' | 'price-desc' | 'newest';

const ZERO = '0x0000000000000000000000000000000000000000';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { address, isConnected } = useAccount();
  const { isVerified } = useKYCStatus(isConnected ? address : undefined);

  // All listings
  const { listings, isLoading, refetch } = useActiveListings();

  // Property data for the filter dropdown
  const { data: countData }         = usePropertyCount();
  const count                       = Number(countData ?? 0n);
  const { properties }              = useProperties(count);

  // Filter state
  const [filterPropertyId, setFilterPropertyId] = useState<string>('all');
  const [minPrice,         setMinPrice]          = useState('');
  const [maxPrice,         setMaxPrice]          = useState('');
  const [sortKey,          setSortKey]           = useState<SortKey>('newest');

  // Modal state
  const [buyTarget,        setBuyTarget]         = useState<Listing | null>(null);
  const [showCreateModal,  setShowCreateModal]   = useState(false);

  // Unique property IDs present in listings (for filter dropdown)
  const listedPropertyIds = useMemo(
    () => [...new Set(listings.map((l) => l.propertyId.toString()))],
    [listings],
  );

  // Property name helper
  const propertyMap = useMemo(() => {
    const m: Record<string, string> = {};
    properties.forEach((p) => {
      m[p.propertyId.toString()] = `Property #${p.propertyId}`;
    });
    return m;
  }, [properties]);

  // Filtered + sorted listings
  const displayed = useMemo(() => {
    let result = [...listings];

    if (filterPropertyId !== 'all') {
      result = result.filter((l) => l.propertyId.toString() === filterPropertyId);
    }

    if (minPrice) {
      const min = parseFloat(minPrice);
      result = result.filter(
        (l) => parseFloat(formatUnits(l.pricePerToken, 18)) >= min,
      );
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      result = result.filter(
        (l) => parseFloat(formatUnits(l.pricePerToken, 18)) <= max,
      );
    }

    result.sort((a, b) => {
      if (sortKey === 'price-asc')  return a.pricePerToken < b.pricePerToken ? -1 : 1;
      if (sortKey === 'price-desc') return a.pricePerToken > b.pricePerToken ? -1 : 1;
      // newest
      return b.createdAt > a.createdAt ? 1 : -1;
    });

    return result;
  }, [listings, filterPropertyId, minPrice, maxPrice, sortKey]);

  // Property metadataURI map
  const metaURIMap = useMemo(() => {
    const m: Record<string, string> = {};
    properties.forEach((p) => { m[p.propertyId.toString()] = p.metadataURI; });
    return m;
  }, [properties]);

  const handleBuySuccess = () => {
    setBuyTarget(null);
    refetch();
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    refetch();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketplace</h1>
          <p className="mt-1 text-sm text-gray-500">
            Buy and sell fractional property tokens P2P.
          </p>
        </div>

        {isConnected ? (
          isVerified ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              + Create Listing
            </button>
          ) : (
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
              KYC required to create listings
            </span>
          )
        ) : (
          <ConnectButton />
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
        {/* Property filter */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-semibold text-gray-500">Property</label>
          <select
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Properties</option>
            {listedPropertyIds.map((id) => (
              <option key={id} value={id}>
                {propertyMap[id] ?? `Property #${id}`}
              </option>
            ))}
          </select>
        </div>

        {/* Min price */}
        <div className="flex flex-col gap-1 w-32">
          <label className="text-xs font-semibold text-gray-500">Min Price ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="0"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Max price */}
        <div className="flex flex-col gap-1 w-32">
          <label className="text-xs font-semibold text-gray-500">Max Price ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="∞"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Sort */}
        <div className="flex flex-col gap-1 min-w-[160px] ml-auto">
          <label className="text-xs font-semibold text-gray-500">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="newest">Newest First</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
          </select>
        </div>
      </div>

      {/* Listing grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400 gap-2">
          <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-indigo-500 animate-spin" />
          Loading listings…
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-gray-200 bg-white gap-3">
          <p className="text-gray-400 text-sm">No active listings match your filters.</p>
          {isConnected && isVerified && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-indigo-600 text-sm font-semibold hover:underline"
            >
              Create the first one →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayed.map((listing) => (
            <ListingCard
              key={listing.listingId.toString()}
              listing={listing}
              metadataURI={metaURIMap[listing.propertyId.toString()]}
              onBuy={(l) => setBuyTarget(l)}
              onCancelled={refetch}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSuccess={handleBuySuccess}
        />
      )}

      {showCreateModal && (
        <CreateListingModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}
