import { ButtonLink, Container, PageHeader } from '@/components/ui';
import { PropertiesList } from './PropertiesList';

export const metadata = {
  title: 'Properties',
  description: 'Browse tokenised real-estate offerings open for investment.',
};

export default function PropertiesPage() {
  return (
    <>
      <PageHeader
        title="Properties"
        description="Every asset written to the on-chain property registry, with live offering status and price per token."
        action={
          <ButtonLink href="/list-property" variant="secondary">
            List your property
          </ButtonLink>
        }
      />
      <Container className="py-8 sm:py-10">
        <PropertiesList />
      </Container>
    </>
  );
}
