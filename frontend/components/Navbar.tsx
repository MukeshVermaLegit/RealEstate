'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '@/lib/cn';
import { useAdminRole } from '@/lib/hooks/useAdminRole';
import { KYCBadge } from './KYCBadge';
import { Logo } from './Logo';

const NAV_LINKS = [
  { href: '/properties',  label: 'Properties' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/portfolio',   label: 'Portfolio' },
  { href: '/my-listings', label: 'My listings' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const { isAdmin } = useAdminRole();
  const [open, setOpen] = useState(false);

  const links = isAdmin
    ? [...NAV_LINKS, { href: '/admin', label: 'Admin' } as const]
    : NAV_LINKS;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline glass">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'text-ink' : 'text-muted hover:text-ink hover:bg-elevated',
                  )}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: KYC + wallet */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:block">
            <KYCBadge />
          </span>
          <ConnectButton
            showBalance={false}
            accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
            chainStatus={{ smallScreen: 'icon', largeScreen: 'icon' }}
          />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline text-muted transition-colors hover:text-ink md:hidden"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="animate-fade-in border-t border-hairline bg-surface md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-3 sm:px-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(pathname, link.href)
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-elevated hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-hairline pt-3 sm:hidden">
              <KYCBadge />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
