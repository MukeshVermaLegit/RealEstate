'use client';

import Link from 'next/link';
import { Container } from './ui';
import { Logo } from './Logo';
import { useContracts } from '@/lib/contracts/useContracts';
import { explorerAddressUrl, explorerName } from '@/lib/explorer';
import { isZeroAddress, shortAddress } from '@/lib/format';

const PRODUCT_LINKS = [
  { href: '/properties',  label: 'Browse properties' },
  { href: '/marketplace', label: 'Secondary market' },
  { href: '/portfolio',   label: 'My portfolio' },
] as const;

const LEARN_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#compliance',   label: 'Compliance model' },
] as const;

/** Contracts worth surfacing publicly — the ones an investor may want to verify. */
const CONTRACT_LABELS = [
  { key: 'propertyRegistry', label: 'Property Registry' },
  { key: 'marketplace',      label: 'Marketplace' },
  { key: 'rentDistributor',  label: 'Rent Distributor' },
  { key: 'kycRegistry',      label: 'KYC Registry' },
] as const;

export function Footer() {
  const { addresses, chainId } = useContracts();

  return (
    <footer className="mt-auto border-t border-hairline bg-surface/40">
      <Container className="py-12 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div>
            <Logo />
            <p className="text-pretty mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Fractional ownership of real-world property, settled in stablecoins and
              enforced by compliance-gated token transfers.
            </p>
          </div>

          {/* Product */}
          <nav aria-label="Product">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">Product</h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Learn */}
          <nav aria-label="Learn">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">Learn</h3>
            <ul className="mt-4 space-y-2.5">
              {LEARN_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contracts — verifiable, not decorative */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Contracts · {explorerName(chainId)}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {CONTRACT_LABELS.map(({ key, label }) => {
                const address = addresses[key];
                if (isZeroAddress(address)) {
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted">{label}</span>
                      <span className="text-xs text-faint">not deployed</span>
                    </li>
                  );
                }
                const url = explorerAddressUrl(chainId, address);
                return (
                  <li key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">{label}</span>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-accent transition-colors hover:text-accent-hover"
                      >
                        {shortAddress(address)}
                      </a>
                    ) : (
                      <span className="font-mono text-xs text-faint">{shortAddress(address)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="rule-fade my-8" />

        <div className="flex flex-col gap-3 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RWA Estate. All rights reserved.</p>
          <p className="text-pretty max-w-xl sm:text-right">
            Tokenised property interests are securities in most jurisdictions. Nothing here is
            investment advice. Access is restricted to verified investors.
          </p>
        </div>
      </Container>
    </footer>
  );
}
