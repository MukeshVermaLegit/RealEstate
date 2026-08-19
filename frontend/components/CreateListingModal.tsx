'use client';

import { useState, useMemo } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useHoldings } from '../lib/hooks/usePortfolio';
import { useCreateListing } from '../lib/hooks/useMarketplace';

interface CreateListingModalProps {
  onClose:   () => void;
  onSuccess: () => void;
}

type Step = 'form' | 'approve' | 'list' | 'done';

export function CreateListingModal({ onClose, onSuccess }: CreateListingModalProps) {
  const { address }     = useAccount();
  const { holdings }    = useHoldings(address);
  const { approve, createListing, isPending, error } = useCreateListing();

  // Form state
  const [selectedIdx,   setSelectedIdx]   = useState(0);
  const [amountInput,   setAmountInput]   = useState('');
  const [priceInput,    setPriceInput]    = useState('');
  const [expiryInput,   setExpiryInput]   = useState(''); // date string
  const [step,          setStep]          = useState<Step>('form');
  const [approveHash,   setApproveHash]   = useState<`0x${string}` | undefined>();
  const [listHash,      setListHash]      = useState<`0x${string}` | undefined>();
  const [txError,       setTxError]       = useState('');

  const { isLoading: waitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: waitingList,    isSuccess: listSuccess    } = useWaitForTransactionReceipt({ hash: listHash    });

  const holding = holdings[selectedIdx];
  const now     = BigInt(Math.floor(Date.now() / 1000));

  // Validation
  const amountBig = useMemo(() => {
    try { return amountInput ? parseUnits(amountInput, 18) : 0n; } catch { return 0n; }
  }, [amountInput]);

  const priceBig = useMemo(() => {
    try { return priceInput ? parseUnits(priceInput, 18) : 0n; } catch { return 0n; }
  }, [priceInput]);

  const expiresAt = useMemo<bigint>(() => {
    if (!expiryInput) return 0n;
    const ts = Math.floor(new Date(expiryInput).getTime() / 1000);
    return BigInt(ts);
  }, [expiryInput]);

  const isLocked = holding ? (holding.lockupExpiry > 0n && holding.lockupExpiry > now) : false;

  const validationError = useMemo(() => {
    if (!holding) return 'No property selected.';
    if (isLocked) return `Tokens locked until ${new Date(Number(holding.lockupExpiry) * 1000).toLocaleDateString()}.`;
    if (amountBig <= 0n) return 'Enter a token amount.';
    if (amountBig > holding.balance) return 'Amount exceeds your balance.';
    if (priceBig <= 0n) return 'Price must be greater than 0.';
    return null;
  }, [holding, isLocked, amountBig, priceBig]);

  const handleApprove = async () => {
    if (!holding || validationError) return;
    setTxError('');
    try {
      const hash = await approve(holding.tokenAddress, amountBig);
      setApproveHash(hash);
      setStep('approve');
    } catch (e) {
      setTxError(e instanceof Error ? e.message.slice(0, 140) : 'Approval failed');
    }
  };

  const handleList = async () => {
    if (!holding || validationError) return;
    setTxError('');
    try {
      const hash = await createListing(holding.propertyId, amountBig, priceBig, expiresAt);
      setListHash(hash);
      setStep('list');
    } catch (e) {
      setTxError(e instanceof Error ? e.message.slice(0, 140) : 'Listing failed');
    }
  };

  if (listSuccess && step !== 'done') {
    setStep('done');
    onSuccess();
  }

  const balanceDisplay = holding
    ? formatUnits(holding.balance, 18).replace(/\.?0+$/, '')
    : '0';

  const totalRevenue = amountBig > 0n && priceBig > 0n
    ? parseFloat(formatUnits(amountBig * priceBig / 10n ** 18n, 18)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create Listing</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 'done' ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-semibold text-gray-900">Listing created!</p>
              <p className="text-sm text-gray-500 mt-1">Your tokens are now in escrow and visible on the marketplace.</p>
              <button onClick={onClose} className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Property selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Property</label>
                {holdings.length === 0 ? (
                  <p className="text-sm text-gray-400">You don't hold any property tokens.</p>
                ) : (
                  <select
                    value={selectedIdx}
                    onChange={(e) => setSelectedIdx(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {holdings.map((h, i) => (
                      <option key={h.propertyId.toString()} value={i}>
                        Property #{h.propertyId.toString()} — {formatUnits(h.balance, 18).replace(/\.?0+$/, '')} tokens
                      </option>
                    ))}
                  </select>
                )}
                {holding && (
                  <p className="mt-1 text-xs text-gray-400">
                    Available: <span className="font-semibold text-gray-700">{balanceDisplay} tokens</span>
                    {isLocked && (
                      <span className="ml-2 text-amber-600 font-semibold">⚠ Locked</span>
                    )}
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Token Amount</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Price per token */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Price per Token (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="e.g. 10.50"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Expiry (optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={expiryInput}
                  onChange={(e) => setExpiryInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Summary */}
              {amountBig > 0n && priceBig > 0n && (
                <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total revenue</span>
                    <span className="font-semibold text-indigo-700">${totalRevenue}</span>
                  </div>
                </div>
              )}

              {/* Validation error */}
              {validationError && (
                <p className="text-xs text-amber-600">{validationError}</p>
              )}

              {/* Tx error */}
              {txError && (
                <p className="text-xs text-red-600 leading-tight">{txError}</p>
              )}

              {/* Steps */}
              <div className="flex gap-3 pt-2">
                {/* Step 1: Approve */}
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
                  ) : isPending && step === 'form' ? (
                    'Signing…'
                  ) : (
                    '1. Approve Tokens'
                  )}
                </button>

                {/* Step 2: List */}
                <button
                  onClick={() => void handleList()}
                  disabled={!!validationError || !approveSuccess || isPending || waitingList}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {waitingList ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Confirming…
                    </span>
                  ) : isPending && step === 'approve' ? (
                    'Signing…'
                  ) : (
                    '2. List for Sale'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
