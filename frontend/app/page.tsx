import { Hero } from '@/components/home/Hero';
import { FeaturedProperties } from '@/components/home/FeaturedProperties';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Compliance } from '@/components/home/Compliance';
import { CtaBand } from '@/components/home/CtaBand';

export default function Home() {
  return (
    <>
      <Hero />
      <FeaturedProperties />
      <HowItWorks />
      <Compliance />
      <CtaBand />
    </>
  );
}
