import { Container, Section, SectionHeading } from '@/components/ui';

const STEPS = [
  {
    title: 'Verify your identity',
    body:
      'Complete KYC once. Your wallet is written into the on-chain identity registry with your jurisdiction and investor class, which is what unlocks every subsequent action.',
  },
  {
    title: 'Pick a property',
    body:
      'Each listing carries its IPFS metadata, legal document pack, SPV address and a hash of the signed paperwork — all readable on-chain before you commit a cent.',
  },
  {
    title: 'Invest in the offering',
    body:
      'Approve stablecoins and subscribe to the primary offering. If the raise is cancelled, your funds are refundable directly from the offering contract.',
  },
  {
    title: 'Collect rent, or exit',
    body:
      'Rent is published per period and claimed pro-rata against your token balance. After the lockup you can list your shares on the permissioned secondary market.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-t border-hairline bg-surface/30">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From verified wallet to rent-paying position"
          description="Four steps, each enforced by a contract rather than a promise."
        />

        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="group relative bg-surface p-6">
              <span className="tabular font-display text-sm font-semibold text-accent">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">{step.title}</h3>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
              {/* Accent rail on hover, reads as progress through the flow */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-sheen transition-transform duration-300 group-hover:scale-x-100"
              />
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
