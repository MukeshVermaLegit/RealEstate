'use client';

import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { usePropertyCount, useProperties } from '../../lib/hooks/useProperties';
import { useActiveListings, type Listing } from '../../lib/hooks/useMarketplace';
import { useKYCStatus } from '../../lib/hooks/useKYC';
import { useIPFSMetadataMany } from '../../lib/hooks/useIPFSMetadata';
import { ListingCard } from '../../components/ListingCard';
import { BuyModal } from '../../components/BuyModal';
import { CreateListingModal } from '../../components/CreateListingModal';
import { formatNumber, formatUsd, formatUsdCompact, parseUsdTo18 } from '../../lib/format';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Field,
  InputWithPrefix,
  PageHeader,
  Select,
  Spinner,
  StatCell,
  StatRow,
} from '../../components/ui';

type SortKey = 'newest' | 'price-asc' | 'price-desc';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Newest first',       value: 'newest' },
  { label: 'Price: low to high', value: 'price-asc' },
  { label: 'Price: high to low', value: 'price-desc' },
];

export default function MarketplacePage() {
  const { address, isConnected } = useAccount();
  const { isVerified } = useKYCStatus(isConnected ? address : undefined);

  const { listings, isLoading, refetch } = useActiveListings();

  const { data: countData } = usePropertyCount();
  const count = Number(countData ?? 0n);
  const { properties } = useProperties(count);

  const uris = useMemo(() => properties.map((p) => p.metadataURI), [properties]);
  const { byUri } = useIPFSMetadataMany(uris);

  const [filterPropertyId, setFilterPropertyId] = useState('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');

  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  /** propertyId → { name, metadataURI } from the registry + IPFS. */
  const propertyInfo = useMemo(() => {
    const m: Record<string, { name: string; metadataURI: string }> = {};
    for (const p of properties) {
      const key = p.propertyId.toString();
      m[key] = {
        name: byUri[p.metadataURI]?.name || `Property #${key}`,
        metadataURI: p.metadataURI,
      };
    }
    return m;
  }, [properties, byUri]);

  const listedPropertyIds = useMemo(
    () => [...new Set(listings.map((l) => l.propertyId.toString()))],
    [listings],
  );

  const displayed = useMemo(() => {
    const min = parseUsdTo18(minPrice);
    const max = parseUsdTo18(maxPrice);

    const result = listings.filter((l) => {
      if (filterPropertyId !== 'all' && l.propertyId.toString() !== filterPropertyId) return false;
      if (min !== null && l.pricePerToken < min) return false;
      if (max !== null && l.pricePerToken > max) return false;
      return true;
    });

    result.sort((a, b) => {
      if (sortKey === 'price-asc') return a.pricePerToken < b.pricePerToken ? -1 : 1;
      if (sortKey === 'price-desc') return a.pricePerToken > b.pricePerToken ? -1 : 1;
      return b.createdAt > a.createdAt ? 1 : -1;
    });

    return result;
  }, [listings, filterPropertyId, minPrice, maxPrice, sortKey]);

  /** Order-book summary across everything currently listed. */
  const summary = useMemo(() => {
    if (listings.length === 0) return { notional: 0n, floor: 0n, tokens: 0n };
    let notional = 0n;
    let tokens = 0n;
    let floor = listings[0].pricePerToken;
    for (const l of listings) {
      notional += (l.tokenAmount * l.pricePerToken) / 10n ** 18n;
      tokens += l.tokenAmount;
      if (l.pricePerToken < floor) floor = l.pricePerToken;
    }
    return { notional, floor, tokens };
  }, [listings]);

  const hasFilters = filterPropertyId !== 'all' || Boolean(minPrice) || Boolean(maxPrice);

  const resetFilters = () => {
    setFilterPropertyId('all');
    setMinPrice('');
    setMaxPrice('');
  };

  return (
    <>
      <PageHeader
        title="Secondary market"
        description="Peer-to-peer trading of fractional property tokens. Settlement is restricted to wallets that pass the on-chain compliance check."
        action={
          isConnected ? (
            isVerified ? (
              <Button onClick={() => setShowCreateModal(true)}>
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
                List tokens
              </Button>
            ) : (
              <Badge tone="warn" dot>
                KYC required to list
              </Badge>
            )
          ) : (
            // The navbar already owns the connect action — don't stack a second one here.
            <Badge tone="neutral" dot>
              Connect a wallet to list tokens
            </Badge>
          )
        }
      />

      <Container className="py-8 sm:py-10">
        {/* Order-book summary */}
        <StatRow className="grid-cols-2 lg:grid-cols-4">
          <StatCell label="Active listings" value={formatNumber(listings.length)} loading={isLoading} />
          <StatCell
            label="Notional offered"
            value={formatUsdCompact(summary.notional)}
            sub="Sum of listing totals"
            loading={isLoading}
            accent
          />
          <StatCell
            label="Lowest ask"
            value={listings.length ? formatUsd(summary.floor) : '—'}
            sub="Per token"
            loading={isLoading}
          />
          <StatCell
            label="Properties listed"
            value={formatNumber(listedPropertyIds.length)}
            loading={isLoading}
          />
        </StatRow>

        {/* Filters */}
        <div className="mt-6 rounded-2xl border border-hairline bg-surface p-4 shadow-card sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Property" htmlFor="mkt-property">
              <Select
                id="mkt-property"
                value={filterPropertyId}
                onChange={(e) => setFilterPropertyId(e.target.value)}
              >
                <option value="all">All properties</option>
                {listedPropertyIds.map((id) => (
                  <option key={id} value={id}>
                    {propertyInfo[id]?.name ?? `Property #${id}`}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Min price" htmlFor="mkt-min">
              <InputWithPrefix
                id="mkt-min"
                prefix="$"
                type="number"
                min="0"
                step="any"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field label="Max price" htmlFor="mkt-max">
              <InputWithPrefix
                id="mkt-max"
                prefix="$"
                type="number"
                min="0"
                step="any"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Any"
              />
            </Field>

            <Field label="Sort by" htmlFor="mkt-sort">
              <Select
                id="mkt-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* Result meta */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {isLoading ? (
              'Scanning the marketplace…'
            ) : (
              <>
                <span className="tabular font-medium text-ink">{formatNumber(displayed.length)}</span>
                {' of '}
                <span className="tabular">{formatNumber(listings.length)}</span>
                {' listings'}
              </>
            )}
          </p>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Grid */}
        <div className="mt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
              <Spinner /> Loading listings…
            </div>
          ) : displayed.length === 0 ? (
            <EmptyState
              title={listings.length === 0 ? 'No active listings' : 'Nothing matches those filters'}
              description={
                listings.length === 0
                  ? 'Holders can list tokens here once their lockup has expired.'
                  : 'Try widening the price range or selecting all properties.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : isConnected && isVerified ? (
                  <Button size="sm" onClick={() => setShowCreateModal(true)}>
                    Create the first listing
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayed.map((listing) => (
                <ListingCard
                  key={listing.listingId.toString()}
                  listing={listing}
                  metadataURI={propertyInfo[listing.propertyId.toString()]?.metadataURI}
                  onBuy={setBuyTarget}
                  onCancelled={refetch}
                />
              ))}
            </div>
          )}
        </div>
      </Container>

      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSuccess={() => {
            setBuyTarget(null);
            refetch();
          }}
        />
      )}

      {showCreateModal && (
        <CreateListingModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
