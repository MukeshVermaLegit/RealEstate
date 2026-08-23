'use client';

import type { ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useKYCStatus } from '../lib/hooks/useKYC';
import { KYCPrompt } from './KYCPrompt';
import { EmptyState, Spinner } from './ui';

interface KYCGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function KYCGate({ children, fallback }: KYCGateProps) {
  const { address, isConnected } = useAccount();
  const { isVerified, isLoading } = useKYCStatus(isConnected ? address : undefined);

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        description="This area is gated by the on-chain identity registry, so a connected wallet is required."
        action={<ConnectButton />}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Checking KYC status…
      </div>
    );
  }

  if (!isVerified) {
    return fallback ? <>{fallback}</> : <KYCPrompt />;
  }

  return <>{children}</>;
}
