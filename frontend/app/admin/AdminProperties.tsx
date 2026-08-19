'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { PropertyRegistryABI } from '@/lib/contracts/abis';
import { useContracts } from '@/lib/contracts/useContracts';
import { PROPERTY_STATUS_LABEL, PropertyStatus } from '@/lib/types';
import { RegisterPropertyModal } from '@/components/RegisterPropertyModal';

type PropertyRow = {
  id: string;
  owner: string;
  metadataURI: string;
  status: number;
  totalSupply: string;
  pricePerToken: string;
};

type Props = {
  properties: PropertyRow[];
  onRefetch: () => void;
};

/** Map from a status → the next action label + contract function */
const LIFECYCLE_ACTIONS: Record<
  number,
  { label: string; fn: string; needsOfferingAddr?: boolean } | undefined
> = {
  [PropertyStatus.Draft]:         { label: 'Submit for Review', fn: 'submitForReview' },
  [PropertyStatus.UnderReview]:   { label: 'Approve',            fn: 'approveProperty' },
  [PropertyStatus.Approved]:      { label: 'Open Offering',      fn: 'openOffering', needsOfferingAddr: true },
  [PropertyStatus.OfferingClosed]:{ label: 'Open Trading',       fn: 'openTrading' },
};

export default function AdminProperties({ properties, onRefetch }: Props) {
  const { addresses } = useContracts();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [offeringAddrInputs, setOfferingAddrInputs] = useState<Record<string, string>>({});
  const [offeringAddrErrors, setOfferingAddrErrors] = useState<Record<string, string>>({});
  const [showRegister, setShowRegister] = useState(false);

  function handleAction(prop: PropertyRow) {
    const action = LIFECYCLE_ACTIONS[prop.status];
    if (!action) return;

    const propId = BigInt(prop.id);

    if (action.needsOfferingAddr) {
      const addr = offeringAddrInputs[prop.id] ?? '';
      if (!isAddress(addr)) {
        setOfferingAddrErrors((prev) => ({ ...prev, [prop.id]: 'Enter a valid offering contract address' }));
        return;
      }
      setOfferingAddrErrors((prev) => ({ ...prev, [prop.id]: '' }));
      writeContract({
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'openOffering',
        args: [propId, addr as `0x${string}`],
      }, { onSuccess: onRefetch });
      return;
    }

    writeContract({
      address: addresses.propertyRegistry,
      abi: PropertyRegistryABI,
      functionName: action.fn as any,
      args: [propId],
    }, { onSuccess: onRefetch });
  }

  const busy = isPending || isConfirming;

  return (
    <>
      {/* Register button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowRegister(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          + Register Property
        </button>
      </div>

      {showRegister && (
        <RegisterPropertyModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => { setShowRegister(false); onRefetch(); }}
        />
      )}

    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['ID', 'Metadata URI', 'Owner', 'Status', 'Supply', 'Price / Token', 'Action'].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {properties.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                No properties registered yet.
              </td>
            </tr>
          )}
          {properties.map((prop) => {
            const action = LIFECYCLE_ACTIONS[prop.status];
            return (
              <tr key={prop.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-gray-700">{prop.id}</td>
                <td className="px-4 py-3 max-w-[160px] truncate text-gray-600" title={prop.metadataURI}>
                  {prop.metadataURI}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500" title={prop.owner}>
                  {prop.owner.slice(0, 6)}…{prop.owner.slice(-4)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">
                    {PROPERTY_STATUS_LABEL[prop.status] ?? `Status ${prop.status}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{prop.totalSupply}</td>
                <td className="px-4 py-3 text-gray-700">{prop.pricePerToken}</td>
                <td className="px-4 py-3 min-w-[220px]">
                  {action ? (
                    <div className="flex flex-col gap-1">
                      {action.needsOfferingAddr && (
                        <div>
                          <input
                            type="text"
                            placeholder="Offering contract address"
                            value={offeringAddrInputs[prop.id] ?? ''}
                            onChange={(e) =>
                              setOfferingAddrInputs((prev) => ({ ...prev, [prop.id]: e.target.value }))
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          {offeringAddrErrors[prop.id] && (
                            <p className="mt-0.5 text-xs text-red-500">{offeringAddrErrors[prop.id]}</p>
                          )}
                        </div>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => handleAction(prop)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {busy ? 'Pending…' : action.label}
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
