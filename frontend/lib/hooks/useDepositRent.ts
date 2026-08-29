'use client';

import { useCallback, useState } from 'react';
import { parseEventLogs } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { ERC20ABI, RentDistributorABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';

/**
 * Depositing a rent period is a build-then-two-transactions dance, and the order
 * is forced by the contract:
 *
 *   1. build    — the Merkle root is an ARGUMENT to depositRent, so the claim set
 *                 has to be computed and stored before anything is signed
 *   2. approve  — depositRent pulls the payment token via safeTransferFrom
 *   3. deposit  — the contract assigns the period id inside this transaction
 *   4. confirm  — hand that id back to the API, otherwise the claim set exists
 *                 but investors cannot find it (they look it up by period id)
 *
 * Step 4 is the one that silently breaks claiming if it is skipped, so the step
 * the run reached is surfaced rather than collapsed into a boolean.
 */
export type DepositStep =
  | 'idle'
  | 'building'
  | 'approving'
  | 'depositing'
  | 'confirming'
  | 'done';

export const DEPOSIT_STEP_LABEL: Record<DepositStep, string> = {
  idle:       '',
  building:   'Snapshotting holders and building the Merkle tree…',
  approving:  'Approving the distributor to pull the rent…',
  depositing: 'Depositing rent on-chain…',
  confirming: 'Publishing the claim set…',
  done:       'Rent period is live',
};

export type AllocationPreview = {
  draftId: string;
  merkleRoot: `0x${string}`;
  tokenAddress: `0x${string}`;
  snapshotBlock: string;
  pastTotalSupply: string;
  totalRent: string;
  allocated: string;
  unallocated: string;
  excludedVotes: string;
  holderCount: number;
  allocations: { investor: `0x${string}`; amount: string }[];
};

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function useDepositRent() {
  const { addresses, chainId } = useContracts();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<DepositStep>('idle');
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [periodId, setPeriodId] = useState<number | null>(null);

  /** Step 1 — compute the allocation without signing anything. */
  const build = useCallback(
    async (propertyId: bigint, totalRent: bigint, snapshotBlock: bigint) => {
      setStep('building');
      try {
        const result = await postJSON<AllocationPreview>('/api/rent/periods', {
          chainId,
          propertyId: Number(propertyId),
          totalRent: totalRent.toString(),
          snapshotBlock: snapshotBlock.toString(),
        });
        setPreview(result);
        setStep('idle');
        return result;
      } catch (err) {
        setStep('idle');
        throw err;
      }
    },
    [chainId],
  );

  /** Steps 2–4 — approve, deposit, then publish the claim set. */
  const deposit = useCallback(
    async (propertyId: bigint, built: AllocationPreview): Promise<number> => {
      if (!publicClient) throw new Error('No RPC client available');

      const totalRent = BigInt(built.totalRent);

      // ── 2. Approve ───────────────────────────────────────────────────────
      setStep('approving');
      const approveHash = await writeContractAsync({
        address: addresses.paymentToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [addresses.rentDistributor, totalRent],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // ── 3. Deposit ───────────────────────────────────────────────────────
      setStep('depositing');
      const depositHash = await writeContractAsync({
        address: addresses.rentDistributor,
        abi: RentDistributorABI,
        functionName: 'depositRent',
        args: [propertyId, totalRent, built.merkleRoot, BigInt(built.snapshotBlock)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });

      // The id is assigned inside the transaction, so the event is the only way
      // to learn it without racing another deposit for the same property.
      const events = parseEventLogs({
        abi: RentDistributorABI,
        eventName: 'RentDeposited',
        logs: receipt.logs,
      });
      const deposited = events[0];
      if (!deposited) {
        throw new Error(
          'Deposit confirmed but no RentDeposited event was found — the claim set is unpublished. ' +
          `Re-publish it with draftId ${built.draftId}.`,
        );
      }
      const newPeriodId = Number(deposited.args.periodId);

      // ── 4. Publish the claim set ─────────────────────────────────────────
      setStep('confirming');
      await postJSON('/api/rent/periods/confirm', {
        draftId: built.draftId,
        periodId: newPeriodId,
        txHash: depositHash,
      });

      setPeriodId(newPeriodId);
      setStep('done');
      return newPeriodId;
    },
    [addresses, publicClient, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setPreview(null);
    setPeriodId(null);
  }, []);

  return { step, preview, periodId, build, deposit, reset };
}
