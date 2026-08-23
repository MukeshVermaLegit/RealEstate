'use client';

import { useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { KYCRegistryABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';

/**
 * Demo-mode identity verification: the caller marks their own wallet verified.
 *
 * Only present when the KYCRegistry proxy runs the KYCRegistryDemo implementation
 * (testnets). Against the production implementation `selfVerify` does not exist
 * and the call reverts, which is the intended behaviour — real verification is an
 * operator attesting to an off-chain check, not a button.
 */
export function useSelfVerify() {
  const { addresses } = useContracts();
  const { writeContractAsync, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const selfVerify = useCallback(
    () =>
      writeContractAsync({
        address: addresses.kycRegistry,
        abi: KYCRegistryABI,
        functionName: 'selfVerify',
        args: [],
      }),
    [writeContractAsync, addresses.kycRegistry],
  );

  return { selfVerify, txHash, isPending: isPending || isConfirming, isSuccess, error };
}
