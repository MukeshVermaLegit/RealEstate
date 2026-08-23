import { Container, ButtonLink, PageHeader } from '@/components/ui';
import { MyListings } from './MyListings';

export const metadata = {
  title: 'My listings',
  description: 'Properties you have listed on the registry, and where each one stands.',
};

export default function MyListingsPage() {
  return (
    <>
      <PageHeader
        title="My listings"
        description="Every property registered by your wallet, from private draft through admin review to a live offering."
        action={<ButtonLink href="/list-property">List a property</ButtonLink>}
      />
      <Container className="py-8 sm:py-10">
        <MyListings />
      </Container>
    </>
  );
}
