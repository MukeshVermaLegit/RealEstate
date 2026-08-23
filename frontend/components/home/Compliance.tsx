import type { ReactNode } from 'react';
import { Container, Section, SectionHeading } from '@/components/ui';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      {children}
    </svg>
  );
}

const PILLARS = [
  {
    title: 'Identity-gated transfers',
    body:
      'The compliance module checks the identity registry on every transfer. Unverified, frozen, or out-of-jurisdiction wallets are rejected at the token level — not by a front-end check.',
    icon: (
      <Icon>
        <path d="M12 3l7.5 3.5v5c0 4.5-3.1 8.4-7.5 9.5-4.4-1.1-7.5-5-7.5-9.5v-5L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </Icon>
    ),
  },
  {
    title: 'SPV-wrapped title',
    body:
      'Each asset is held by its own special-purpose vehicle. The registry records the SPV address alongside a hash of the executed legal pack, so the paperwork behind a token is verifiable.',
    icon: (
      <Icon>
        <path d="M4 20h16M6 20V9.5L12 5l6 4.5V20" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 20v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
      </Icon>
    ),
  },
  {
    title: 'Rent distributed on-chain',
    body:
      'The distributor publishes a Merkle root for each rent period. Holders claim their pro-rata share in stablecoins directly from the contract — no custodian sitting in the middle.',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.5 9.5c-.6-.9-1.5-1.3-2.5-1.3-1.4 0-2.3.7-2.3 1.8 0 1 .8 1.5 2.4 1.9 1.7.4 2.6 1 2.6 2.1 0 1.2-1 1.9-2.6 1.9-1.2 0-2.1-.4-2.7-1.3M12 6.5v11" strokeLinecap="round" />
      </Icon>
    ),
  },
  {
    title: 'Lockups the chain enforces',
    body:
      'Primary-offering allocations carry an on-chain lockup expiry. Attempting to move tokens before it elapses reverts, which keeps holding-period rules real rather than contractual.',
    icon: (
      <Icon>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" strokeLinecap="round" />
      </Icon>
    ),
  },
  {
    title: 'Permissioned secondary market',
    body:
      'Listings settle only between verified wallets. Liquidity does not come at the cost of an uncontrolled cap table after issuance.',
    icon: (
      <Icon>
        <path d="M4 16.5 9 11l3.5 3L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 11V6.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </Icon>
    ),
  },
  {
    title: 'Upgradeable, pausable, role-gated',
    body:
      'Contracts sit behind UUPS proxies with role-based administration and an emergency pause, so a compliance incident can be contained without freezing the whole registry.',
    icon: (
      <Icon>
        <path d="M12 3v3M12 18v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" />
      </Icon>
    ),
  },
] as const;

export function Compliance() {
  return (
    <Section id="compliance" className="border-t border-hairline">
      <Container>
        <SectionHeading
          eyebrow="Why it holds up"
          title="Compliance built into the token, not bolted on"
          description="Tokenised property only works if the rules survive contact with a secondary market. These are enforced by the contracts themselves."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group rounded-2xl border border-hairline bg-surface p-6 transition-colors duration-200 hover:border-edge"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
                {p.icon}
              </div>
              <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">{p.title}</h3>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
