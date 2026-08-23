'use client';

import {
  ButtonLink,
  Container,
  EmptyState,
  Section,
  SectionHeading,
} from '@/components/ui';
import { PropertyCard, PropertyCardSkeleton } from '@/components/PropertyCard';
import { useFeaturedProperties } from '@/lib/hooks/usePlatformStats';

export function FeaturedProperties() {
  const { featured, isLoading } = useFeaturedProperties(6);

  return (
    <Section id="properties" className="border-t border-hairline">
      <Container>
        <SectionHeading
          eyebrow="Live inventory"
          title="Properties open for investment"
          description="Pulled straight from the on-chain property registry — open offerings first, then assets already trading on the secondary market."
          action={
            <ButtonLink href="/properties" variant="secondary">
              View all properties
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M4 10h11M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ButtonLink>
          }
        />

        <div className="mt-10">
          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <PropertyCardSkeleton key={i} />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              title="No properties registered yet"
              description="Once a property is tokenised through the registry it will appear here automatically."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => (
                <PropertyCard key={p.propertyId.toString()} property={p} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
}
