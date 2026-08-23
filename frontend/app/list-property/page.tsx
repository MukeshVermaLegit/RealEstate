import { Suspense } from 'react';
import { Container, PageHeader, Skeleton } from '@/components/ui';
import { ListPropertyClient } from './ListPropertyClient';

export const metadata = {
  title: 'List a property',
  description: 'Tokenise a property you own and submit it to the registry for review.',
};

export default function ListPropertyPage() {
  return (
    <>
      <PageHeader
        title="List a property"
        description="Publish the asset's details to IPFS and write it into the on-chain registry as a draft. Admin review comes next — nothing is investable until it is approved."
      />
      <Container className="max-w-3xl py-8 sm:py-10">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <ListPropertyClient />
        </Suspense>
      </Container>
    </>
  );
}
