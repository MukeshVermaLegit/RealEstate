import { ButtonLink, Container } from '@/components/ui';

export function CtaBand() {
  return (
    <section className="border-t border-hairline">
      <Container className="py-16 sm:py-20">
        <div className="relative isolate overflow-hidden rounded-3xl border border-hairline bg-surface px-6 py-14 text-center sm:px-12">
          {/* Accent bloom behind the copy */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-80"
            style={{
              background:
                'radial-gradient(38rem 22rem at 50% -20%, rgb(var(--c-accent) / 0.18), transparent 65%)',
            }}
          />

          <h2 className="text-balance mx-auto max-w-2xl font-display text-2xl font-semibold text-ink sm:text-4xl">
            Start with a fraction, not a mortgage.
          </h2>
          <p className="text-pretty mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Verify once, then invest in any open offering with stablecoins. Rent accrues per period
            and your position stays tradable.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/properties" size="lg">
              Browse open offerings
            </ButtonLink>
            <ButtonLink href="/portfolio" variant="secondary" size="lg">
              View my portfolio
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
