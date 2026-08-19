'use client';

import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useRequireAdmin } from '@/lib/hooks/useAdminRole';
import { usePropertyCount, useProperties } from '@/lib/hooks/useProperties';
import { MarketplaceABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import AdminProperties from './AdminProperties';
import AdminKYC from './AdminKYC';

type Tab = 'properties' | 'kyc' | 'fees';

type PropertyRow = {
  id: string;
  owner: string;
  metadataURI: string;
  status: number;
  totalSupply: string;
  pricePerToken: string;
};

export default function AdminPage() {
  const { isConnected } = useAccount();
  const { isAdmin, isLoading: roleLoading } = useRequireAdmin('/');
  const [tab, setTab] = useState<Tab>('properties');

  // ─── Properties via direct RPC ────────────────────────────────────────────
  const { data: countData } = usePropertyCount();
  const count = countData ? Number(countData) : 0;
  const { properties: rawProperties, refetch: refetchProperties } = useProperties(count);

  const propertyRows: PropertyRow[] = rawProperties.map((p) => ({
    id: p.propertyId.toString(),
    owner: p.owner,
    metadataURI: p.metadataURI,
    status: Number(p.status),
    totalSupply: p.totalSupply.toString(),
    pricePerToken: p.pricePerToken.toString(),
  }));

  const handleRefetch = useCallback(() => { refetchProperties(); }, [refetchProperties]);

  // ─── Gate: wallet not connected ───────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-65px)] gap-6">
        <p className="text-gray-500">Connect your wallet to access the admin panel.</p>
        <ConnectButton />
      </div>
    );
  }

  // ─── Gate: role check in progress ─────────────────────────────────────────
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-65px)]">
        <span className="text-gray-400 animate-pulse">Checking permissions…</span>
      </div>
    );
  }

  // ─── Gate: not admin (redirect handled by useRequireAdmin) ────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-65px)]">
        <span className="text-red-500">Access denied — DEFAULT_ADMIN_ROLE required.</span>
      </div>
    );
  }

  // ─── Admin UI ─────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'properties', label: 'Properties' },
    { key: 'kyc',        label: 'KYC' },
    { key: 'fees',       label: 'Fees' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Panel</h1>
      <p className="text-sm text-gray-500 mb-8">Manage properties, KYC, and protocol fees.</p>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-8">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
              tab === t.key
                ? 'border border-b-white border-gray-200 text-indigo-600 -mb-px bg-white'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'properties' && (
        <AdminProperties
          properties={propertyRows}
          onRefetch={handleRefetch}
        />
      )}

      {tab === 'kyc' && <AdminKYC />}

      {tab === 'fees' && <FeesTab />}
    </div>
  );
}

// ─── Fees tab (inline — simple enough to not warrant a separate file) ─────────

function FeesTab() {
  const { addresses } = useContracts();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: currentFeeBps } = useReadContract({
    address: addresses.marketplace,
    abi: MarketplaceABI,
    functionName: 'feeBps' as any,
  });

  const { data: currentFeeCollector } = useReadContract({
    address: addresses.marketplace,
    abi: MarketplaceABI,
    functionName: 'feeCollector' as any,
  });

  const [newFeeBps, setNewFeeBps]           = useState('');
  const [newFeeCollector, setNewFeeCollector] = useState('');
  const [feeError, setFeeError]             = useState('');
  const [collectorError, setCollectorError] = useState('');

  const busy = isPending || isConfirming;

  function handleSetFee() {
    const bps = parseInt(newFeeBps);
    if (isNaN(bps) || bps < 0 || bps > 1000) {
      setFeeError('Enter a value between 0 and 1000 bps (0–10%)');
      return;
    }
    setFeeError('');
    writeContract({
      address: addresses.marketplace,
      abi: MarketplaceABI,
      functionName: 'setFee' as any,
      args: [bps] as any,
    });
  }

  function handleSetCollector() {
    const { isAddress } = require('viem');
    if (!isAddress(newFeeCollector)) {
      setCollectorError('Invalid address');
      return;
    }
    setCollectorError('');
    writeContract({
      address: addresses.marketplace,
      abi: MarketplaceABI,
      functionName: 'setFeeCollector' as any,
      args: [newFeeCollector as `0x${string}`] as any,
    });
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Current settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Current Fee Settings</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Protocol Fee</dt>
            <dd className="font-medium text-gray-800">
              {currentFeeBps != null ? `${Number(currentFeeBps) / 100}% (${currentFeeBps} bps)` : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Fee Collector</dt>
            <dd className="font-mono text-xs text-gray-700 break-all">
              {currentFeeCollector ? String(currentFeeCollector) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Set fee bps */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h3 className="text-base font-semibold text-gray-800">Update Fee (bps)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={1000}
            placeholder="e.g. 250"
            value={newFeeBps}
            onChange={(e) => setNewFeeBps(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            disabled={busy}
            onClick={handleSetFee}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {busy ? '…' : 'Set'}
          </button>
        </div>
        {feeError && <p className="text-xs text-red-500">{feeError}</p>}
      </div>

      {/* Set fee collector */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <h3 className="text-base font-semibold text-gray-800">Update Fee Collector</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="0x…"
            value={newFeeCollector}
            onChange={(e) => setNewFeeCollector(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            disabled={busy}
            onClick={handleSetCollector}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {busy ? '…' : 'Set'}
          </button>
        </div>
        {collectorError && <p className="text-xs text-red-500">{collectorError}</p>}
      </div>
    </div>
  );
}
