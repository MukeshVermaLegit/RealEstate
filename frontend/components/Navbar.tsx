'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { KYCBadge } from './KYCBadge';

export function Navbar() {
  return (
    <nav className="w-full border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl font-bold text-indigo-600 tracking-tight">
          RWA Estate
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/properties" className="hover:text-indigo-600 transition-colors">
            Properties
          </Link>
          <Link href="/portfolio" className="hover:text-indigo-600 transition-colors">
            Portfolio
          </Link>
          <Link href="/marketplace" className="hover:text-indigo-600 transition-colors">
            Marketplace
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <KYCBadge />
        <ConnectButton />
      </div>
    </nav>
  );
}
