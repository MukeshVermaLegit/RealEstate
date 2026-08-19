'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useReadContracts } from 'wagmi';
import { isAddress, parseAbiItem } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { KYCRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';

type VerifyForm = {
  address: string;
  countryCode: string;
  investorType: string;
  expiresAt: string;
};

const BLANK_FORM: VerifyForm = { address: '', countryCode: '', investorType: '1', expiresAt: '' };

type InvestorRow = {
  id: string;
  countryCode: number;
  investorType: number;
  verifiedAt: string;
  expiresAt: string;
  frozen: boolean;
};

const INVESTOR_TYPE_LABEL: Record<number, string> = { 0: 'Unset', 1: 'Retail', 2: 'Accredited', 3: 'Qualified' };

export default function AdminKYC() {
  const { addresses } = useContracts();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [form, setForm] = useState<VerifyForm>(BLANK_FORM);
  const [formErrors, setFormErrors] = useState<Partial<VerifyForm>>({});

  // Single address for revoke / freeze / unfreeze actions
  const [actionAddr, setActionAddr] = useState('');
  const [actionAddrError, setActionAddrError] = useState('');

  const publicClient = usePublicClient();

  const ACCOUNT_VERIFIED_EVENT = parseAbiItem(
    'event AccountVerified(address indexed account, address indexed verifiedBy, uint16 countryCode, uint8 investorType, uint48 expiresAt, uint256 timestamp)',
  );

  // Step 1 — collect unique verified addresses from logs
  const { data: verifiedAddresses, refetch: refetchLogs } = useQuery({
    queryKey: ['kyc-verified-addresses', addresses.kycRegistry],
    queryFn: async () => {
      if (!publicClient) return [] as `0x${string}`[];
      const logs = await publicClient.getLogs({
        address: addresses.kycRegistry,
        event: ACCOUNT_VERIFIED_EVENT,
        fromBlock: 0n,
        toBlock: 'latest',
      });
      // deduplicate; keep last occurrence order
      const seen = new Map<string, `0x${string}`>();
      logs.forEach((log) => {
        if (log.args.account) seen.set(log.args.account.toLowerCase(), log.args.account);
      });
      return [...seen.values()].slice(-20) as `0x${string}`[];
    },
    staleTime: 30_000,
  });

  // Step 2 — batch getInvestorRecord for each address
  const { data: recordResults, refetch: refetchRecords } = useReadContracts({
    contracts: (verifiedAddresses ?? []).map((addr) => ({
      address: addresses.kycRegistry,
      abi: KYCRegistryABI,
      functionName: 'getInvestorRecord' as const,
      args: [addr] as const,
    })),
    query: { enabled: (verifiedAddresses ?? []).length > 0 },
  });

  function refetchInvestors() {
    refetchLogs();
    refetchRecords();
  }

  type RawRecord = {
    verified: boolean;
    countryCode: number;
    investorType: number;
    verifiedAt: bigint;
    expiresAt: bigint;
    frozen: boolean;
  };

  const investors: InvestorRow[] = (verifiedAddresses ?? [])
    .map((addr, i) => {
      const rec = recordResults?.[i]?.result as RawRecord | undefined;
      return {
        id: addr,
        countryCode: rec?.countryCode ?? 0,
        investorType: rec?.investorType ?? 0,
        verifiedAt: rec ? rec.verifiedAt.toString() : '0',
        expiresAt: rec ? rec.expiresAt.toString() : '0',
        frozen: rec?.frozen ?? false,
      };
    })
    .filter((inv) => inv.countryCode !== 0);

  const busy = isPending || isConfirming;

  // ─── Validation ─────────────────────────────────────────────────────────────

  function validateForm(): boolean {
    const errors: Partial<VerifyForm> = {};
    if (!isAddress(form.address)) errors.address = 'Invalid address';
    const cc = parseInt(form.countryCode);
    if (isNaN(cc) || cc < 1 || cc > 999) errors.countryCode = '1–999 ISO numeric';
    const it = parseInt(form.investorType);
    if (![1, 2, 3].includes(it)) errors.investorType = 'Must be 1, 2, or 3';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateActionAddr(): boolean {
    if (!isAddress(actionAddr)) {
      setActionAddrError('Invalid address');
      return false;
    }
    setActionAddrError('');
    return true;
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleVerify() {
    if (!validateForm()) return;
    const expiresAtSecs = form.expiresAt
      ? BigInt(Math.floor(new Date(form.expiresAt).getTime() / 1000))
      : 0n;
    writeContract(
      {
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: 'verify',
        args: [
          form.address as `0x${string}`,
          parseInt(form.countryCode),
          parseInt(form.investorType),
          Number(expiresAtSecs),
        ],
      },
      {
        onSuccess: () => {
          setForm(BLANK_FORM);
          refetchInvestors();
        },
      }
    );
  }

  function handleRevoke() {
    if (!validateActionAddr()) return;
    writeContract(
      { address: addresses.kycRegistry, abi: KYCRegistryABI, functionName: 'revoke', args: [actionAddr as `0x${string}`] },
      { onSuccess: () => refetchInvestors() }
    );
  }

  function handleFreeze() {
    if (!validateActionAddr()) return;
    writeContract(
      { address: addresses.kycRegistry, abi: KYCRegistryABI, functionName: 'freeze', args: [actionAddr as `0x${string}`] },
      { onSuccess: () => refetchInvestors() }
    );
  }

  function handleUnfreeze() {
    if (!validateActionAddr()) return;
    writeContract(
      { address: addresses.kycRegistry, abi: KYCRegistryABI, functionName: 'unfreeze', args: [actionAddr as `0x${string}`] },
      { onSuccess: () => refetchInvestors() }
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Verify form ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 p-6 bg-white">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Verify Investor</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Wallet Address</label>
            <input
              type="text"
              placeholder="0x…"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {formErrors.address && <p className="mt-1 text-xs text-red-500">{formErrors.address}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Country Code (ISO numeric)</label>
            <input
              type="number"
              min={1}
              max={999}
              placeholder="840"
              value={form.countryCode}
              onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {formErrors.countryCode && <p className="mt-1 text-xs text-red-500">{formErrors.countryCode}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Investor Type</label>
            <select
              value={form.investorType}
              onChange={(e) => setForm((f) => ({ ...f, investorType: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="1">1 — Retail</option>
              <option value="2">2 — Accredited</option>
              <option value="3">3 — Qualified</option>
            </select>
            {formErrors.investorType && <p className="mt-1 text-xs text-red-500">{formErrors.investorType}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              KYC Expiry <span className="text-gray-400">(leave blank for no expiry)</span>
            </label>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          disabled={busy}
          onClick={handleVerify}
          className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Pending…' : 'Verify Investor'}
        </button>
      </section>

      {/* ── Revoke / Freeze / Unfreeze ───────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 p-6 bg-white">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Revoke / Freeze / Unfreeze</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="0x investor address…"
              value={actionAddr}
              onChange={(e) => setActionAddr(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {actionAddrError && <p className="mt-1 text-xs text-red-500">{actionAddrError}</p>}
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={handleRevoke}
              className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              Revoke
            </button>
            <button
              disabled={busy}
              onClick={handleFreeze}
              className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Freeze
            </button>
            <button
              disabled={busy}
              onClick={handleUnfreeze}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              Unfreeze
            </button>
          </div>
        </div>
      </section>

      {/* ── Recent verified investors (from subgraph) ────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Recent Verified Investors</h3>
          <p className="text-xs text-gray-400 mt-0.5">Data sourced from the subgraph — requires a running Graph node.</p>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Address', 'Country', 'Type', 'Verified At', 'Expires', 'Frozen'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {investors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No verified investors indexed yet.
                </td>
              </tr>
            )}
            {investors.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">
                  {inv.id.slice(0, 6)}…{inv.id.slice(-4)}
                </td>
                <td className="px-4 py-3 text-gray-700">{inv.countryCode}</td>
                <td className="px-4 py-3 text-gray-700">{INVESTOR_TYPE_LABEL[inv.investorType] ?? inv.investorType}</td>
                <td className="px-4 py-3 text-gray-700">
                  {inv.verifiedAt !== '0'
                    ? new Date(parseInt(inv.verifiedAt) * 1000).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {inv.expiresAt !== '0'
                    ? new Date(parseInt(inv.expiresAt) * 1000).toLocaleDateString()
                    : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {inv.frozen ? (
                    <span className="text-xs font-semibold text-orange-600">Frozen</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
