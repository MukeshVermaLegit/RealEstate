'use client';

import { useState, useMemo } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { KYCGate } from './KYCGate';
import { useBuyListing, type Listing } from '../lib/hooks/useMarketplace';

interface BuyModalProps {
  listing:   Listing;
  onClose:   () => void;
  onSuccess: () => void;
}

type Step = 'form' | 'approve' | 'buy' | 'done';

const PAYMENT_TOKEN_DECIMALS = 6;

export function BuyModal({ listing, onClose, onSuccess }: BuyModalProps) {
  const { approve, buy, isPending } = useBuyListing();

  const [qtyInput,     setQtyInput]     = useState('1');
  const [step,         setStep]         = useState<Step>('form');
  const [approveHash,  setApproveHash]  = useState<`0x${string}` | undefined>();
  const [buyHash,      setBuyHash]      = useState<`0x${string}` | undefined>();
  const [txError,      setTxError]      = useState('');

  const { isLoading: waitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: waitingBuy,     isSuccess: buySuccess     } = useWaitForTransactionReceipt({ hash: buyHash    });

  const qtyBig = useMemo(() => {
    try {
      const n = parseUnits(qtyInput, 18);
      return n > 0n ? n : 0n;
    } catch { return 0n; }
  }, [qtyInput]);

  const totalCostRaw = qtyBig > 0n ? qtyBig * listing.pricePerToken / 10n ** 18n : 0n;

  // pricePerToken is 18-decimal; totalCostRaw is 18-decimal USD
  // convert to USDC (6 decimals) for approve amount
  const totalCostUSDC = totalCostRaw / 10n ** 12n; // 18 → 6 decimals

  const validationError = useMemo(() => {
    if (qtyBig <= 0n) return 'Enter a quantity.';
    if (qtyBig > listing.tokenAmount) return `Max available: ${formatUnits(listing.tokenAmount, 18).replace(/\.?0+$/, '')}`;
    return null;
  }, [qtyBig, listing.tokenAmount]);

  const handleApprove = async () => {
    setTxError('');
    try {
      const hash = await approve(totalCostUSDC > 0n ? totalCostUSDC : 1n);
      setApproveHash(hash);
      setStep('approve');
    } catch (e) {
      setTxError(e instanceof Error ? e.message.slice(0, 140) : 'Approval failed');
    }
  };

  const handleBuy = async () => {
    setTxError('');
    try {
      const hash = await buy(listing.listingId, qtyBig);
      setBuyHash(hash);
      setStep('buy');
    } catch (e) {
      setTxError(e instanceof Error ? e.message.slice(0, 140) : 'Purchase failed');
    }
  };

  if (buySuccess && step !== 'done') {
    setStep('done');
    onSuccess();
  }

  const priceDisplay = parseFloat(formatUnits(listing.pricePerToken, 18)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const totalDisplay = parseFloat(formatUnits(totalCostRaw, 18)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const availableDisplay = formatUnits(listing.tokenAmount, 18).replace(/\.?0+$/, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Buy Tokens</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 'done' ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-900">Purchase complete!</p>
              <p className="text-sm text-gray-500 mt-1">
                Tokens will appear in your portfolio.
              </p>
              <button onClick={onClose} className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Listing summary */}
              <div className="rounded-lg bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Listing</span>
                  <span className="font-medium">#{listing.listingId.toString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available</span>
                  <span className="font-medium">{availableDisplay} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Price / token</span>
                  <span className="font-medium">${priceDisplay}</span>
                </div>
              </div>

              {/* Quantity input */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Quantity to Buy
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Total */}
              <div className="rounded-lg bg-indigo-50 px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-600 font-medium">Total USDC</span>
                <span className="font-semibold text-indigo-700">${totalDisplay}</span>
              </div>

              {/* Validation */}
              {validationError && (
                <p className="text-xs text-amber-600">{validationError}</p>
              )}

              {txError && (
                <p className="text-xs text-red-600 leading-tight">{txError}</p>
              )}

              {/* KYC-gated buy actions */}
              <KYCGate
                fallback={
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    KYC verification required to purchase tokens.
                  </p>
                }
              >
                <div className="flex gap-3">
                  {/* Step 1: Approve USDC */}
                  <button
                    onClick={() => void handleApprove()}
                    disabled={!!validationError || isPending || waitingApprove || approveSuccess}
                    className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                  >
                    {waitingApprove ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                        Confirming…
                      </span>
                    ) : approveSuccess ? (
                      '✓ Approved'
                    ) : (
                      '1. Approve USDC'
                    )}
                  </button>

                  {/* Step 2: Buy */}
                  <button
                    onClick={() => void handleBuy()}
                    disabled={!!validationError || !approveSuccess || isPending || waitingBuy}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {waitingBuy ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Confirming…
                      </span>
                    ) : (
                      '2. Buy'
                    )}
                  </button>
                </div>
              </KYCGate>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
