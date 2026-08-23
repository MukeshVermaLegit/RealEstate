'use client';

import { useCallback } from 'react';
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { zeroAddress } from 'viem';
import { PropertyTokenABI, PropertyFactoryABI, PropertyRegistryABI } from '../contracts/abis';
import { useContracts } from '../contracts/useContracts';

export const ZERO_ADDRESS = zeroAddress;

/** Property tokens are plain 18-decimal ERC-20s. */
export const TOKEN_DECIMALS = 18;

export function isDeployed(tokenAddress: string | undefined): boolean {
  return !!tokenAddress && tokenAddress.toLowerCase() !== ZERO_ADDRESS;
}

// ─── Token summary ────────────────────────────────────────────────────────────

export type TokenInfo = {
  name:        string;
  symbol:      string;
  decimals:    number;
  totalSupply: bigint;
  maxSupply:   bigint;
  /** maxSupply − totalSupply: how much may still be minted. */
  remaining:   bigint;
  isPending:   boolean;
  refetch:     () => void;
};

/**
 * Live supply figures for a deployed PropertyToken. Everything is reported in
 * token wei — the registry's `totalSupply` field is a whole-token count, so the
 * two are NOT directly comparable without scaling by 1e18.
 */
export function useTokenInfo(tokenAddress: `0x${string}` | undefined): TokenInfo {
  const enabled = isDeployed(tokenAddress);

  const { data, isPending, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress!, abi: PropertyTokenABI, functionName: 'name' },
      { address: tokenAddress!, abi: PropertyTokenABI, functionName: 'symbol' },
      { address: tokenAddress!, abi: PropertyTokenABI, functionName: 'decimals' },
      { address: tokenAddress!, abi: PropertyTokenABI, functionName: 'totalSupply' },
      { address: tokenAddress!, abi: PropertyTokenABI, functionName: 'maxSupply' },
    ],
    query: { enabled },
  });

  const totalSupply = (data?.[3].result as bigint | undefined) ?? 0n;
  const maxSupply   = (data?.[4].result as bigint | undefined) ?? 0n;

  return {
    name:     (data?.[0].result as string | undefined) ?? '',
    symbol:   (data?.[1].result as string | undefined) ?? '',
    decimals: Number((data?.[2].result as number | undefined) ?? TOKEN_DECIMALS),
    totalSupply,
    maxSupply,
    remaining: maxSupply > totalSupply ? maxSupply - totalSupply : 0n,
    // `useReadContracts` reports `pending` while disabled, which would otherwise
    // leave a not-yet-deployed property stuck on a skeleton forever.
    isPending: enabled && isPending,
    refetch:   () => void refetch(),
  };
}

// ─── Permission checks ────────────────────────────────────────────────────────

/**
 * Whether `account` may mint on this token. The factory grants MINTER_ROLE to
 * whoever called `createPropertyToken`, so this is false for an admin wallet
 * that did not deploy the token itself.
 */
export function useIsMinter(
  tokenAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
): { isMinter: boolean; isLoading: boolean } {
  const enabled = isDeployed(tokenAddress) && !!account;

  const { data: role } = useReadContract({
    address: tokenAddress!,
    abi: PropertyTokenABI,
    functionName: 'MINTER_ROLE',
    query: { enabled },
  });

  const { data, isLoading } = useReadContract({
    address: tokenAddress!,
    abi: PropertyTokenABI,
    functionName: 'hasRole',
    args: [role as `0x${string}`, account ?? ZERO_ADDRESS],
    query: { enabled: enabled && !!role },
  });

  return { isMinter: (data as boolean | undefined) ?? false, isLoading: enabled && isLoading };
}

/** Whether `account` holds FACTORY_ROLE and can therefore deploy property tokens. */
export function useCanDeployTokens(account: `0x${string}` | undefined): boolean {
  const { addresses } = useContracts();
  const enabled = !!account;

  const { data: role } = useReadContract({
    address: addresses.propertyFactory,
    abi: PropertyFactoryABI,
    functionName: 'FACTORY_ROLE',
    query: { enabled },
  });

  const { data } = useReadContract({
    address: addresses.propertyFactory,
    abi: PropertyFactoryABI,
    functionName: 'hasRole',
    args: [role as `0x${string}`, account ?? ZERO_ADDRESS],
    query: { enabled: enabled && !!role },
  });

  return (data as boolean | undefined) ?? false;
}

/**
 * `createPropertyToken` finishes by calling `registry.setTokenAddress`, which is
 * PROPERTY_ADMIN_ROLE-gated. If the factory was never granted that role the deploy
 * reverts at the very last step, so check it up front and offer the fix.
 */
export function useFactoryAuthorized(): {
  authorized: boolean;
  isLoading: boolean;
  refetch: () => void;
} {
  const { addresses } = useContracts();

  const { data: role } = useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'PROPERTY_ADMIN_ROLE',
  });

  const { data, isLoading, refetch } = useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'hasRole',
    args: [role as `0x${string}`, addresses.propertyFactory],
    query: { enabled: !!role },
  });

  return {
    authorized: (data as boolean | undefined) ?? false,
    isLoading: !role || isLoading,
    refetch: () => void refetch(),
  };
}

/** Grants the factory PROPERTY_ADMIN_ROLE on the registry. Needs registry admin. */
export function useAuthorizeFactory() {
  const { addresses } = useContracts();
  const { writeContractAsync, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: role } = useReadContract({
    address: addresses.propertyRegistry,
    abi: PropertyRegistryABI,
    functionName: 'PROPERTY_ADMIN_ROLE',
  });

  const authorize = useCallback(() => {
    if (!role) throw new Error('Could not read PROPERTY_ADMIN_ROLE from the registry');
    return writeContractAsync({
      address: addresses.propertyRegistry,
      abi: PropertyRegistryABI,
      functionName: 'grantRole',
      args: [role as `0x${string}`, addresses.propertyFactory],
    });
  }, [writeContractAsync, addresses, role]);

  return { authorize, isPending: isPending || isConfirming, isSuccess, error };
}

// ─── Write: deploy a property token ───────────────────────────────────────────

/**
 * Deploys the per-property ERC-20 via PropertyFactory and records it on the
 * registry in the same transaction. The caller becomes the token's admin,
 * minter and pauser.
 */
export function useDeployPropertyToken() {
  const { addresses } = useContracts();
  const { writeContractAsync, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const deploy = useCallback(
    (args: { propertyId: bigint; name: string; symbol: string; maxSupplyWei: bigint }) =>
      writeContractAsync({
        address: addresses.propertyFactory,
        abi: PropertyFactoryABI,
        functionName: 'createPropertyToken',
        args: [
          args.propertyId,
          args.name,
          args.symbol,
          args.maxSupplyWei,
          addresses.propertyRegistry,
          addresses.kycRegistry,
          addresses.complianceModule,
        ],
      }),
    [writeContractAsync, addresses],
  );

  return { deploy, txHash, isPending: isPending || isConfirming, isSuccess, error, reset };
}

// ─── Write: mint ──────────────────────────────────────────────────────────────

/**
 * Direct issuance to an address. Reserved for MINTER_ROLE — the normal path for
 * investors is PropertyOffering, which mints against escrowed payment. Both draw
 * from the same `maxSupply`, so minting here reduces what an offering can sell.
 */
export function useMintPropertyTokens(tokenAddress: `0x${string}` | undefined) {
  const { writeContractAsync, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const mint = useCallback(
    (to: `0x${string}`, amountWei: bigint) => {
      if (!tokenAddress) throw new Error('No token deployed for this property');
      return writeContractAsync({
        address: tokenAddress,
        abi: PropertyTokenABI,
        functionName: 'mint',
        args: [to, amountWei],
      });
    },
    [writeContractAsync, tokenAddress],
  );

  return { mint, txHash, isPending: isPending || isConfirming, isSuccess, error, reset };
}
