'use client';

import { useState } from 'react';
import { useWalletClient } from 'wagmi';
import { Button } from './ui';

/**
 * Registers a property token with the connected wallet.
 *
 * Every property is its own ERC-20 contract, so a claimed balance is invisible in
 * MetaMask until the asset is added by address — the tokens are there, the wallet
 * just has no reason to look for them.
 */
export function AddToWalletButton({
  tokenAddress,
  symbol,
  decimals = 18,
  className,
}: {
  tokenAddress: `0x${string}`;
  symbol: string;
  decimals?: number;
  className?: string;
}) {
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<'idle' | 'pending' | 'added' | 'failed'>('idle');

  // Symbols longer than 11 characters are rejected by wallets outright.
  const safeSymbol = (symbol || 'PROP').slice(0, 11);

  const handleAdd = async () => {
    if (!walletClient) return;
    setState('pending');
    try {
      await walletClient.watchAsset({
        type: 'ERC20',
        options: { address: tokenAddress, symbol: safeSymbol, decimals },
      });
      setState('added');
    } catch {
      // Declining the wallet prompt lands here too, so this is not an error state
      // worth shouting about — just let them try again.
      setState('idle');
    }
  };

  if (!walletClient) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      loading={state === 'pending'}
      onClick={() => void handleAdd()}
    >
      {state === 'added' ? 'Added to wallet' : 'Add to wallet'}
    </Button>
  );
}
