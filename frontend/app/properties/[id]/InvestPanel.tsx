'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useOfferingData, useMyInvestment, useInvest } from '@/lib/hooks/useOffering';
import { KYCRegistryABI, ERC20ABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { PropertyStatus, type Property } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUsd(wei: bigint): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(wei) / 1e18);
}

function formatDate(unixSec: bigint): string {
  if (unixSec === 0n) return '—';
  return new Date(Number(unixSec) * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  committed,
  total,
}: {
  committed: bigint;
  total: bigint;
}) {
  const pct = total > 0n ? Number((committed * 10000n) / total) / 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{committed.toLocaleString()} committed</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right">
        of {total.toLocaleString()} total tokens
      </p>
    </div>
  );
}

// ─── Tx button ───────────────────────────────────────────────────────────────

function TxButton({
  label,
  loading,
  disabled,
  onClick,
  variant = 'primary',
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'primary' | 'outline';
}) {
  const base =
    'w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
      : 'border border-indigo-600 text-indigo-600 hover:bg-indigo-50';

  return (
    <button
      className={`${base} ${styles}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      )}
      {label}
    </button>
  );
}

// ─── KYC placeholder (Part 5 will replace this) ──────────────────────────────

function KYCGatePlaceholder() {
  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
      <p className="font-semibold mb-1">KYC Required</p>
      <p>
        You must complete identity verification before investing. KYC portal
        coming in Part 5.
      </p>
    </div>
  );
}

// ─── InvestPanel ─────────────────────────────────────────────────────────────

export function InvestPanel({ property }: { property: Property }) {
  const { address: account } = useAccount();
  const { addresses } = useContracts();

  const offeringAddress =
    property.offeringContract !== '0x0000000000000000000000000000000000000000'
      ? property.offeringContract
      : undefined;

  // Offering state
  const { totalTokensCommitted, finalized, cancelled, refetch: refetchOffering } =
    useOfferingData(offeringAddress);

  // My investment
  const { tokenAmount: myTokens, lockupExpiry } = useMyInvestment(
    offeringAddress,
    account,
  );

  // KYC check
  const { data: isVerified } = useReadContract({
    address: addresses.kycRegistry,
    abi: KYCRegistryABI,
    functionName: 'isVerified',
    args: [account ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!account },
  });

  // Allowance check
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: addresses.paymentToken,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [
      account ?? '0x0000000000000000000000000000000000000000',
      offeringAddress ?? '0x0000000000000000000000000000000000000000',
    ],
    query: { enabled: !!account && !!offeringAddress },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  const { approve, invest, refund, isPending, isInvestSuccess, isRefundSuccess, error } =
    useInvest(offeringAddress);

  // Form state
  const [tokenInput, setTokenInput] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const tokensAvailable = property.totalSupply - totalTokensCommitted;
  const tokenAmount = BigInt(tokenInput || '0');
  const totalCost = tokenAmount * property.pricePerToken; // in payment token units (18 dec)

  const needsApprove = allowance < totalCost && tokenAmount > 0n;

  useEffect(() => {
    if (isInvestSuccess) {
      setSuccessMsg(
        `Investment confirmed! Lockup expires ${formatDate(lockupExpiry)}.`,
      );
      refetchOffering();
      refetchAllowance();
    }
  }, [isInvestSuccess, lockupExpiry, refetchOffering, refetchAllowance]);

  useEffect(() => {
    if (isRefundSuccess) {
      setSuccessMsg('Refund claimed successfully.');
      refetchOffering();
    }
  }, [isRefundSuccess, refetchOffering]);

  useEffect(() => {
    if (error) setTxError((error as Error).message.slice(0, 120));
  }, [error]);

  const handleApprove = async () => {
    setTxError(null);
    try {
      await approve(totalCost);
      await refetchAllowance();
    } catch (e) {
      setTxError((e as Error).message.slice(0, 120));
    }
  };

  const handleInvest = async () => {
    setTxError(null);
    if (tokenAmount <= 0n) {
      setTxError('Enter a valid token amount.');
      return;
    }
    if (tokenAmount > tokensAvailable) {
      setTxError(`Max available: ${tokensAvailable.toLocaleString()} tokens.`);
      return;
    }
    try {
      await invest(tokenAmount);
    } catch (e) {
      setTxError((e as Error).message.slice(0, 120));
    }
  };

  const handleRefund = async () => {
    setTxError(null);
    try {
      await refund();
    } catch (e) {
      setTxError((e as Error).message.slice(0, 120));
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 sticky top-24">
      <h2 className="text-lg font-bold text-gray-900">Investment Panel</h2>

      {/* Progress */}
      {offeringAddress && (
        <ProgressBar
          committed={totalTokensCommitted}
          total={property.totalSupply}
        />
      )}

      {/* Price summary */}
      <div className="text-sm text-gray-600 space-y-1">
        <div className="flex justify-between">
          <span>Price / token</span>
          <span className="font-semibold text-gray-900">
            {formatUsd(property.pricePerToken)}
          </span>
        </div>
        {tokenAmount > 0n && (
          <div className="flex justify-between text-indigo-700 font-semibold">
            <span>Total cost</span>
            <span>{formatUsd(totalCost)}</span>
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* State: no offering contract yet */}
      {!offeringAddress && (
        <p className="text-sm text-gray-400 text-center py-4">
          No active offering for this property.
        </p>
      )}

      {/* State: offering not open */}
      {offeringAddress && property.status !== PropertyStatus.OfferingOpen && !cancelled && (
        <p className="text-sm text-gray-500 text-center py-2">
          Offering is not currently active.{' '}
          <span className="font-medium">
            Status: {finalized ? 'Finalized' : 'Closed'}
          </span>
        </p>
      )}

      {/* State: cancelled — show refund */}
      {offeringAddress && cancelled && (
        <div className="space-y-3">
          <p className="text-sm text-red-600 font-medium">
            This offering was cancelled.
          </p>
          {myTokens > 0n && (
            <TxButton
              label="Claim Refund"
              loading={isPending}
              onClick={handleRefund}
              variant="outline"
            />
          )}
        </div>
      )}

      {/* State: active offering */}
      {offeringAddress &&
        property.status === PropertyStatus.OfferingOpen &&
        !cancelled && (
          <>
            {!account ? (
              <p className="text-sm text-gray-400 text-center">
                Connect your wallet to invest.
              </p>
            ) : !isVerified ? (
              <KYCGatePlaceholder />
            ) : (
              <div className="space-y-3">
                {/* Token input */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Number of tokens
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={tokensAvailable.toString()}
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                      setTxError(null);
                      setSuccessMsg(null);
                    }}
                    placeholder={`1 – ${tokensAvailable.toLocaleString()}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Available: {tokensAvailable.toLocaleString()}
                  </p>
                </div>

                {/* Two-step buttons */}
                {needsApprove ? (
                  <TxButton
                    label="1. Approve USDC"
                    loading={isPending}
                    disabled={tokenAmount <= 0n}
                    onClick={handleApprove}
                    variant="outline"
                  />
                ) : (
                  <TxButton
                    label="Invest"
                    loading={isPending}
                    disabled={tokenAmount <= 0n}
                    onClick={handleInvest}
                  />
                )}

                {/* Error */}
                {txError && (
                  <p className="text-xs text-red-600 break-words">{txError}</p>
                )}

                {/* Success */}
                {successMsg && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800">
                    {successMsg}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      {/* My investment summary */}
      {account && myTokens > 0n && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-gray-900">My Investment</p>
            <div className="flex justify-between text-gray-600">
              <span>Tokens committed</span>
              <span className="font-medium">{myTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Payment paid</span>
              <span className="font-medium">
                {formatUsd(myTokens * property.pricePerToken)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Lockup expiry</span>
              <span className="font-medium">{formatDate(lockupExpiry)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
