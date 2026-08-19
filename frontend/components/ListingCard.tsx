'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useIPFSMetadata } from '../lib/hooks/useIPFSMetadata';
import { useCancelListing, type Listing } from '../lib/hooks/useMarketplace';
import { useWaitForTransactionReceipt } from 'wagmi';

interface ListingCardProps {
  listing:    Listing;
  metadataURI?: string;
  onBuy:      (listing: Listing) => void;
  onCancelled?: () => void;
}

function ExpiryLabel({ expiresAt }: { expiresAt: bigint }) {
  if (expiresAt === 0n) {
    return <span className="text-gray-400 text-xs">No expiry</span>;
  }
  const now  = Math.floor(Date.now() / 1000);
  const diff = Number(expiresAt) - now;
  if (diff <= 0) {
    return <span className="text-red-500 text-xs font-medium">Expired</span>;
  }
  const days = Math.ceil(diff / 86400);
  return (
    <span className="text-amber-600 text-xs font-medium">
      Expires in {days} day{days !== 1 ? 's' : ''}
    </span>
  );
}

export function ListingCard({ listing, metadataURI, onBuy, onCancelled }: ListingCardProps) {
  const { address } = useAccount();
  const { data: meta } = useIPFSMetadata(metadataURI ?? '');

  const cancelListing = useCancelListing();
  const [cancelHash,  setCancelHash]  = useState<`0x${string}` | undefined>();
  const [cancelError, setCancelError] = useState('');
  const [cancelling,  setCancelling]  = useState(false);

  const { isLoading: waitingCancel, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({
    hash: cancelHash,
  });

  if (cancelSuccess) {
    onCancelled?.();
  }

  const isSeller = address?.toLowerCase() === listing.seller.toLowerCase();

  // token amount is 18-decimal fractional token
  const tokenAmtDisplay = formatUnits(listing.tokenAmount, 18).replace(/\.?0+$/, '');
  // pricePerToken is 18-decimal USD
  const priceDisplay = parseFloat(formatUnits(listing.pricePerToken, 18)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const totalCost = listing.tokenAmount * listing.pricePerToken / 10n ** 18n;
  const totalDisplay = parseFloat(formatUnits(totalCost, 18)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const sellerShort = `${listing.seller.slice(0, 6)}…${listing.seller.slice(-4)}`;

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      const hash = await cancelListing(listing.listingId);
      setCancelHash(hash);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message.slice(0, 100) : 'Failed');
      setCancelling(false);
    }
  };

  const cancelLoading = cancelling || waitingCancel;

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">
              {meta?.name ?? `Property #${listing.propertyId}`}
            </p>
            {meta?.location && (
              <p className="text-xs text-gray-400 mt-0.5">{meta.location}</p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
            #{listing.listingId.toString()}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-2 flex-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tokens</span>
          <span className="font-medium text-gray-900">{tokenAmtDisplay}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Price / token</span>
          <span className="font-medium text-gray-900">${priceDisplay}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total cost</span>
          <span className="font-semibold text-indigo-600">${totalDisplay}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Seller</span>
          <span className="font-mono text-xs text-gray-700">{sellerShort}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <ExpiryLabel expiresAt={listing.expiresAt} />

        {isSeller ? (
          <button
            onClick={() => void handleCancel()}
            disabled={cancelLoading || cancelSuccess}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {cancelLoading ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                {waitingCancel ? 'Cancelling…' : 'Signing…'}
              </>
            ) : cancelSuccess ? (
              '✓ Cancelled'
            ) : (
              'Cancel'
            )}
          </button>
        ) : (
          <button
            onClick={() => onBuy(listing)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Buy
          </button>
        )}
      </div>

      {cancelError && (
        <p className="px-5 pb-3 text-[11px] text-red-500 leading-tight">{cancelError}</p>
      )}
    </div>
  );
}
