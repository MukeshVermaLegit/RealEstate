'use client';

import { useCallback, useState } from 'react';
import {
  useDeployContract,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import {
  PropertyOfferingABI,
  PropertyRegistryABI,
  PropertyTokenABI,
  ERC20ABI,
} from '../contracts/abis';
import {
  PROPERTY_OFFERING_BYTECODE,
  PROPERTY_OFFERING_CONSTRUCTOR_ABI,
} from '../contracts/propertyOfferingBytecode';
import { useContracts } from '../contracts/useContracts';

/**
 * Bringing an offering online is three transactions that must all land, in order:
 *
 *   1. deploy   — PropertyOffering has no factory, so it is deployed client-side
 *   2. minter   — grant the offering MINTER_ROLE on the property token, or every
 *                 investor's `claimTokens()` reverts after finalization
 *   3. open     — registry.openOffering(), which flips the property to OfferingOpen
 *                 and is what makes the public invest panel go live
 *
 * Stopping halfway leaves a real but unreachable offering, so the step the run
 * reached is reported back for display rather than collapsing into one boolean.
 */
export type OfferingStep = 'idle' | 'deploying' | 'granting' | 'opening' | 'done';

export const OFFERING_STEP_LABEL: Record<OfferingStep, string> = {
  idle:      '',
  deploying: 'Deploying offering contract…',
  granting:  'Granting the offering minter rights…',
  opening:   'Opening the offering on the registry…',
  done:      'Offering is live',
};

export type CreateOfferingArgs = {
  propertyId:   bigint;
  tokenAddress: `0x${string}`;
  /** Payment-token units per ONE WHOLE property token (e.g. 250e6 for $250 USDC). */
  pricePerToken: bigint;
  /** Property-token wei. Must be ≤ the token's maxSupply or the constructor reverts. */
  hardCap: bigint;
  softCap: bigint;
  startTime: bigint;
  endTime: bigint;
  lockupDuration: bigint;
};

export function useCreateOffering() {
  const { addresses } = useContracts();
  const publicClient = usePublicClient();
  const { deployContractAsync } = useDeployContract();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<OfferingStep>('idle');
  const [offeringAddress, setOfferingAddress] = useState<`0x${string}` | null>(null);

  const create = useCallback(
    async (args: CreateOfferingArgs): Promise<`0x${string}`> => {
      if (!publicClient) throw new Error('No RPC client available');

      // ── 1. Deploy ────────────────────────────────────────────────────────
      setStep('deploying');
      const deployHash = await deployContractAsync({
        abi: PROPERTY_OFFERING_CONSTRUCTOR_ABI,
        bytecode: PROPERTY_OFFERING_BYTECODE,
        args: [
          args.propertyId,
          args.tokenAddress,
          addresses.paymentToken,
          args.pricePerToken,
          args.hardCap,
          args.softCap,
          args.startTime,
          args.endTime,
          args.lockupDuration,
          addresses.propertyRegistry,
          addresses.kycRegistry,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
      const deployed = receipt.contractAddress;
      if (!deployed) throw new Error('Deployment produced no contract address');
      setOfferingAddress(deployed);

      // ── 2. Make the offering a minter on the property token ──────────────
      setStep('granting');
      const minterRole = await publicClient.readContract({
        address: args.tokenAddress,
        abi: PropertyTokenABI,
        functionName: 'MINTER_ROLE',
      });
      const grantHash = await writeContractAsync({
        address: args.tokenAddress,
        abi: PropertyTokenABI,
        functionName: 'grantRole',
        args: [minterRole as `0x${string}`, deployed],
      });
      await publicClient.waitForTransactionReceipt({ hash: grantHash });

      // ── 3. Open it on the registry ───────────────────────────────────────
      setStep('opening');
      const openHash = await writeContractAsync({
        address: addresses.propertyRegistry,
        abi: PropertyRegistryABI,
        functionName: 'openOffering',
        args: [args.propertyId, deployed],
      });
      await publicClient.waitForTransactionReceipt({ hash: openHash });

      setStep('done');
      return deployed;
    },
    [addresses, deployContractAsync, publicClient, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setOfferingAddress(null);
  }, []);

  return { create, step, offeringAddress, reset };
}

// ─── Payment-token decimals ───────────────────────────────────────────────────

/**
 * Decimals of the settlement token, read on chain rather than hardcoded to USDC's
 * 6 — a price scaled with the wrong exponent is the defect that made every
 * marketplace purchase revert, and hardcoding invites it back.
 */
export function usePaymentDecimals(): { decimals: number; isLoading: boolean } {
  const { addresses } = useContracts();
  const { data, isLoading } = useReadContract({
    address: addresses.paymentToken,
    abi: ERC20ABI,
    functionName: 'decimals',
  });
  return { decimals: Number((data as number | undefined) ?? 6), isLoading };
}

// ─── Offering terms (for the public invest panel) ─────────────────────────────

export type OfferingTerms = {
  pricePerToken: bigint;
  hardCap:       bigint;
  softCap:       bigint;
  startTime:     bigint;
  endTime:       bigint;
  isPending:     boolean;
};

/**
 * The offering's own immutable terms. These — not the registry's display figures —
 * are what `invest()` actually charges against, and the two use different units.
 */
export function useOfferingTerms(offeringAddress: `0x${string}` | undefined): OfferingTerms {
  const enabled = !!offeringAddress;
  const common = { address: offeringAddress!, abi: PropertyOfferingABI } as const;

  const { data, isPending } = useReadContract({
    ...common,
    functionName: 'pricePerToken',
    query: { enabled },
  });
  const { data: hardCap } = useReadContract({
    ...common,
    functionName: 'hardCap',
    query: { enabled },
  });
  const { data: softCap } = useReadContract({
    ...common,
    functionName: 'softCap',
    query: { enabled },
  });
  const { data: startTime } = useReadContract({
    ...common,
    functionName: 'startTime',
    query: { enabled },
  });
  const { data: endTime } = useReadContract({
    ...common,
    functionName: 'endTime',
    query: { enabled },
  });

  return {
    pricePerToken: (data as bigint | undefined) ?? 0n,
    hardCap:       (hardCap as bigint | undefined) ?? 0n,
    softCap:       (softCap as bigint | undefined) ?? 0n,
    startTime:     (startTime as bigint | undefined) ?? 0n,
    endTime:       (endTime as bigint | undefined) ?? 0n,
    isPending:     enabled && isPending,
  };
}
