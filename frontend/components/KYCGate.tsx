'use client';

import type { ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useKYCStatus } from '../lib/hooks/useKYC';
import { KYCPrompt } from './KYCPrompt';

interface KYCGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function KYCGate({ children, fallback }: KYCGateProps) {
  const { address, isConnected } = useAccount();
  const { isVerified, isLoading } = useKYCStatus(isConnected ? address : undefined);

  // Wallet not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-gray-500">Connect your wallet to continue.</p>
        <ConnectButton />
      </div>
    );
  }

  // Still fetching
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        Checking KYC status…
      </div>
    );
  }

  // Connected but not verified
  if (!isVerified) {
    return fallback ? <>{fallback}</> : <KYCPrompt />;
  }

  // Verified — render protected content
  return <>{children}</>;
}
