'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits } from 'viem';
import { useHoldings, type Holding } from '../../lib/hooks/usePortfolio';
import { useRentClaims, useClaimRent, type ClaimItem } from '../../lib/hooks/useRentClaims';
import { useIPFSMetadata } from '../../lib/hooks/useIPFSMetadata';
import { ClaimButton } from '../../components/ClaimButton';

/** Decimals of the payment token (USDC = 6). Update if using a different token. */
const PAYMENT_TOKEN_DECIMALS = 6;

// ─── Sub-components ───────────────────────────────────────────────────────────

function PropertyName({ uri, id }: { uri: string; id: bigint }) {
  const { data } = useIPFSMetadata(uri);
  return <span>{data?.name || `Property #${id}`}</span>;
}

function LockupCell({ expiry }: { expiry: bigint }) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiry === 0n) return <span className="text-gray-400">—</span>;

  const date = new Date(Number(expiry) * 1000).toLocaleDateString();
  if (expiry > now) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{date}</span>
        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          Locked
        </span>
      </span>
    );
  }
  return <span className="text-gray-500">{date}</span>;
}

function HoldingValueCell({ pricePerToken, balance }: { pricePerToken: bigint; balance: bigint }) {
  // pricePerToken is 18-decimal USD; balance is 18-decimal token
  // value = pricePerToken * balance / 1e18 (result is 18-decimal USD)
  const raw = balance > 0n ? (pricePerToken * balance) / 10n ** 18n : 0n;
  const formatted = formatUnits(raw, 18);
  return (
    <span>${parseFloat(formatted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  );
}

// ─── Section: My Holdings ────────────────────────────────────────────────────

function HoldingsSection({ holdings, isLoading }: { holdings: Holding[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">My Holdings</h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-indigo-500 animate-spin" />
          Loading holdings…
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">My Holdings</h2>
        <p className="text-sm text-gray-400">You don't hold any property tokens yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">My Holdings</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3">Property</th>
              <th className="px-6 py-3 text-right">Tokens Held</th>
              <th className="px-6 py-3 text-right">% of Supply</th>
              <th className="px-6 py-3">Lockup Expires</th>
              <th className="px-6 py-3 text-right">Current Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {holdings.map((h) => {
              const pct =
                h.totalSupply > 0n
                  ? (Number((h.balance * 10000n) / h.totalSupply) / 100).toFixed(2)
                  : '0.00';
              return (
                <tr key={h.propertyId.toString()} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <PropertyName uri={h.metadataURI} id={h.propertyId} />
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {formatUnits(h.balance, 18).replace(/\.?0+$/, '')}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{pct}%</td>
                  <td className="px-6 py-4">
                    <LockupCell expiry={h.lockupExpiry} />
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    <HoldingValueCell pricePerToken={h.pricePerToken} balance={h.balance} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section: Unclaimed Rent ─────────────────────────────────────────────────

function UnclaimedRentSection({
  claims,
  totalClaimable,
  isLoading,
  onClaimSuccess,
}: {
  claims:         ClaimItem[];
  totalClaimable: bigint;
  isLoading:      boolean;
  onClaimSuccess: () => void;
}) {
  const { claimMultiple, invalidateClaims } = useClaimRent();

  const [claimAllState, setClaimAllState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [claimAllHash,  setClaimAllHash]  = useState<`0x${string}` | undefined>();
  const [claimAllError, setClaimAllError] = useState('');

  const { isLoading: waitingAll, isSuccess: claimAllSuccess } = useWaitForTransactionReceipt({
    hash: claimAllHash,
  });

  useEffect(() => {
    if (claimAllSuccess) {
      setClaimAllState('success');
      void invalidateClaims();
      onClaimSuccess();
    }
  }, [claimAllSuccess, invalidateClaims, onClaimSuccess]);

  const handleClaimAll = async () => {
    if (claims.length === 0) return;
    setClaimAllState('loading');
    setClaimAllError('');
    try {
      const hash = await claimMultiple(claims);
      setClaimAllHash(hash);
    } catch (e) {
      setClaimAllState('error');
      setClaimAllError(e instanceof Error ? e.message.slice(0, 100) : 'Transaction failed');
    }
  };

  const claimAllLoading = claimAllState === 'loading' || waitingAll;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Unclaimed Rent</h2>
          {totalClaimable > 0n && (
            <p className="text-xs text-gray-500 mt-0.5">
              Total:{' '}
              <span className="font-semibold text-indigo-600">
                {parseFloat(formatUnits(totalClaimable, PAYMENT_TOKEN_DECIMALS)).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDC
              </span>
            </p>
          )}
        </div>

        {claims.length > 1 && (
          <button
            onClick={() => void handleClaimAll()}
            disabled={claimAllLoading || claimAllState === 'success'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {claimAllLoading ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                {waitingAll ? 'Confirming…' : 'Signing…'}
              </>
            ) : claimAllState === 'success' ? (
              '✓ All Claimed'
            ) : (
              'Claim All'
            )}
          </button>
        )}
      </div>

      {claimAllState === 'error' && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {claimAllError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 px-6 py-8 text-sm text-gray-400">
          <span className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-indigo-500 animate-spin" />
          Scanning on-chain periods…
        </div>
      ) : claims.length === 0 ? (
        <p className="px-6 py-8 text-sm text-gray-400">No unclaimed rent at this time.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Property</th>
                <th className="px-6 py-3 text-right">Period</th>
                <th className="px-6 py-3 text-right">Amount (USDC)</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map((claim) => (
                <tr
                  key={`${claim.propertyId}-${claim.periodId}`}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">
                    Property #{claim.propertyId.toString()}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    #{claim.periodId.toString()}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    {parseFloat(
                      formatUnits(claim.amount, PAYMENT_TOKEN_DECIMALS),
                    ).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ClaimButton item={claim} onSuccess={onClaimSuccess} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();

  const { holdings, isLoading: holdingsLoading } = useHoldings(address);

  const propertyIds = useMemo(() => holdings.map((h) => h.propertyId), [holdings]);

  const {
    claims,
    totalClaimable,
    isLoading: claimsLoading,
    refetch: refetchClaims,
  } = useRentClaims(address, propertyIds);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleClaimSuccess = useCallback(() => {
    setToast({ type: 'success', text: 'Rent claimed successfully!' });
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, []);

  // Dismiss toast on click
  const dismissToast = () => setToast(null);

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">My Portfolio</h1>
        <div className="flex flex-col items-center gap-4 py-20 rounded-2xl border border-dashed border-gray-200 bg-white">
          <p className="text-gray-500">Connect your wallet to view your portfolio.</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
        <button
          onClick={() => refetchClaims()}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <button
          onClick={dismissToast}
          className={`w-full text-left rounded-xl border px-5 py-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {toast.type === 'success' ? '✓ ' : '✗ '}
          {toast.text}
          <span className="ml-2 text-xs opacity-60">(click to dismiss)</span>
        </button>
      )}

      {/* Section 1 — My Holdings */}
      <HoldingsSection holdings={holdings} isLoading={holdingsLoading} />

      {/* Section 2 — Unclaimed Rent */}
      <UnclaimedRentSection
        claims={claims}
        totalClaimable={totalClaimable}
        isLoading={claimsLoading}
        onClaimSuccess={handleClaimSuccess}
      />

      {/* Section 3 — Transaction History (placeholder) */}
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-gray-500">Transaction History</p>
        <p className="mt-1 text-xs text-gray-400">
          Full transaction history will be available once subgraph indexing is integrated.
        </p>
      </div>
    </div>
  );
}
