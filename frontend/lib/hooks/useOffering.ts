import { useMemo, useCallback } from 'react';
import {
  useReadContracts,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { PropertyOfferingABI, ERC20ABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';

// ─── Offering summary (batched) ───────────────────────────────────────────────

export function useOfferingData(offeringAddress: `0x${string}` | undefined) {
  const enabled = !!offeringAddress && offeringAddress !== '0x';

  const { data, isPending, refetch } = useReadContracts({
    contracts: [
      {
        address: offeringAddress!,
        abi: PropertyOfferingABI,
        functionName: 'totalTokensCommitted',
      },
      {
        address: offeringAddress!,
        abi: PropertyOfferingABI,
        functionName: 'finalized',
      },
      {
        address: offeringAddress!,
        abi: PropertyOfferingABI,
        functionName: 'cancelled',
      },
    ],
    query: { enabled },
  });

  return {
    totalTokensCommitted: (data?.[0].result as bigint | undefined) ?? 0n,
    finalized:  (data?.[1].result as boolean | undefined) ?? false,
    cancelled:  (data?.[2].result as boolean | undefined) ?? false,
    isPending,
    refetch,
  };
}

// ─── My investment ────────────────────────────────────────────────────────────

export function useMyInvestment(
  offeringAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
) {
  const enabled =
    !!offeringAddress &&
    offeringAddress !== '0x' &&
    !!account;

  const { data, isPending } = useReadContracts({
    contracts: [
      {
        address: offeringAddress!,
        abi: PropertyOfferingABI,
        functionName: 'getInvestment',
        args: [account!],
      },
      {
        address: offeringAddress!,
        abi: PropertyOfferingABI,
        functionName: 'getLockupExpiry',
        args: [account!],
      },
    ],
    query: { enabled },
  });

  return {
    tokenAmount:  (data?.[0].result as bigint | undefined) ?? 0n,
    lockupExpiry: (data?.[1].result as bigint | undefined) ?? 0n,
    isPending,
  };
}

// ─── Write: invest flow ───────────────────────────────────────────────────────

export function useInvest(offeringAddress: `0x${string}` | undefined) {
  const { addresses } = useContracts();

  // ── allowance check ──────────────────────────────────────────────────────
  const { data: allowanceData } = useReadContract({
    address: addresses.paymentToken,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [
      // placeholder — will be overridden by callers before writing
      '0x0000000000000000000000000000000000000000',
      offeringAddress ?? '0x0000000000000000000000000000000000000000',
    ],
    query: { enabled: false }, // only used via refetch by InvestPanel
  });
  const currentAllowance = (allowanceData as bigint | undefined) ?? 0n;

  // ── approve ───────────────────────────────────────────────────────────────
  const {
    writeContractAsync: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveWriteError,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const approve = useCallback(
    async (amount: bigint) => {
      if (!offeringAddress) throw new Error('No offering address');
      return writeApprove({
        address: addresses.paymentToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [offeringAddress, amount],
      });
    },
    [writeApprove, addresses.paymentToken, offeringAddress],
  );

  // ── invest ────────────────────────────────────────────────────────────────
  const {
    writeContractAsync: writeInvest,
    data: investTxHash,
    isPending: isInvestPending,
    error: investWriteError,
  } = useWriteContract();

  const { isLoading: isInvestConfirming, isSuccess: isInvestSuccess } =
    useWaitForTransactionReceipt({ hash: investTxHash });

  const invest = useCallback(
    async (tokenAmount: bigint) => {
      if (!offeringAddress) throw new Error('No offering address');
      return writeInvest({
        address: offeringAddress,
        abi: PropertyOfferingABI,
        functionName: 'invest',
        args: [tokenAmount],
      });
    },
    [writeInvest, offeringAddress],
  );

  // ── refund ────────────────────────────────────────────────────────────────
  const {
    writeContractAsync: writeRefund,
    data: refundTxHash,
    isPending: isRefundPending,
    error: refundWriteError,
  } = useWriteContract();

  const { isLoading: isRefundConfirming, isSuccess: isRefundSuccess } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  const refund = useCallback(
    async () => {
      if (!offeringAddress) throw new Error('No offering address');
      return writeRefund({
        address: offeringAddress,
        abi: PropertyOfferingABI,
        functionName: 'refund',
        args: [],
      });
    },
    [writeRefund, offeringAddress],
  );

  const isPending =
    isApprovePending ||
    isApproveConfirming ||
    isInvestPending ||
    isInvestConfirming ||
    isRefundPending ||
    isRefundConfirming;

  const error =
    approveWriteError ?? investWriteError ?? refundWriteError ?? null;

  return {
    approve,
    invest,
    refund,
    currentAllowance,
    isPending,
    isApproveSuccess,
    isInvestSuccess,
    isRefundSuccess,
    error,
  };
}
