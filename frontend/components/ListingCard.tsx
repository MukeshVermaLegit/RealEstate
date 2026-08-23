'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { useIPFSMetadata } from '../lib/hooks/useIPFSMetadata';
import { useCancelListing, type Listing } from '../lib/hooks/useMarketplace';
import { cleanTxError, expiryLabel, formatTokens, formatUsd, shortAddress } from '../lib/format';
import { Badge, Button } from './ui';

interface ListingCardProps {
  listing: Listing;
  metadataURI?: string;
  onBuy: (listing: Listing) => void;
  onCancelled?: () => void;
}

function ExpiryBadge({ expiresAt }: { expiresAt: bigint }) {
  const expiry = expiryLabel(expiresAt);
  if (!expiry) return <span className="text-[11px] text-faint">No expiry</span>;
  return (
    <Badge tone={expiry.expired ? 'negative' : 'warn'}>{expiry.text}</Badge>
  );
}

export function ListingCard({ listing, metadataURI, onBuy, onCancelled }: ListingCardProps) {
  const { address } = useAccount();
  const { data: meta } = useIPFSMetadata(metadataURI ?? '');

  const cancelListing = useCancelListing();
  const [cancelHash, setCancelHash] = useState<`0x${string}` | undefined>();
  const [cancelError, setCancelError] = useState('');
  const [signing, setSigning] = useState(false);

  const { isLoading: waitingCancel, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({
    hash: cancelHash,
  });

  // Notify the parent once the receipt lands — never during render.
  useEffect(() => {
    if (cancelSuccess) onCancelled?.();
  }, [cancelSuccess, onCancelled]);

  const isSeller = address?.toLowerCase() === listing.seller.toLowerCase();
  const totalCost = (listing.tokenAmount * listing.pricePerToken) / 10n ** 18n;

  const handleCancel = async () => {
    setSigning(true);
    setCancelError('');
    try {
      const hash = await cancelListing(listing.listingId);
      setCancelHash(hash);
    } catch (e) {
      setCancelError(cleanTxError(e, 90));
    } finally {
      setSigning(false);
    }
  };

  const cancelLoading = signing || waitingCancel;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card transition-colors hover:border-edge">
      {/* Header */}
      <div className="border-b border-hairline px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">
              {meta?.name || `Property #${listing.propertyId}`}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {meta?.location || `Property #${listing.propertyId}`}
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-hairline bg-elevated px-2 py-0.5 font-mono text-[11px] text-faint">
            #{listing.listingId.toString()}
          </span>
        </div>
      </div>

      {/* Figures */}
      <div className="flex-1 space-y-2.5 px-5 py-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Tokens</span>
          <span className="tabular font-medium text-ink">{formatTokens(listing.tokenAmount)}</span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Price / token</span>
          <span className="tabular font-medium text-ink">{formatUsd(listing.pricePerToken)}</span>
        </div>
        <div className="rule-fade" />
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Total</span>
          <span className="tabular font-display text-base font-semibold text-accent">
            {formatUsd(totalCost)}
          </span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Seller</span>
          <span className="font-mono text-xs text-muted">
            {isSeller ? 'You' : shortAddress(listing.seller)}
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
        <ExpiryBadge expiresAt={listing.expiresAt} />

        {isSeller ? (
          <Button
            variant="danger"
            size="sm"
            loading={cancelLoading}
            disabled={cancelSuccess}
            onClick={() => void handleCancel()}
          >
            {cancelSuccess ? 'Cancelled' : cancelLoading && waitingCancel ? 'Cancelling…' : 'Cancel'}
          </Button>
        ) : (
          <Button size="sm" onClick={() => onBuy(listing)}>
            Buy tokens
          </Button>
        )}
      </div>

      {cancelError && (
        <p className="border-t border-hairline px-5 py-2.5 text-[11px] leading-tight text-negative">
          {cancelError}
        </p>
      )}
    </div>
  );
}
