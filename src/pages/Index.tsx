import { HeaderSection } from "@/components/landing/HeaderSection";
import { StickyHeader } from "@/components/landing/StickyHeader";
import { StickyCTA } from "@/components/landing/StickyCTA";
import { HeroSection } from "@/components/landing/HeroSection";
import { GoogleComparisonSection } from "@/components/landing/GoogleComparisonSection";
import { BeforeAfterSection } from "@/components/landing/BeforeAfterSection";
import { WhatWeSetUpSection } from "@/components/landing/WhatWeSetUpSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FounderSection } from "@/components/landing/FounderSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FooterSection } from "@/components/landing/FooterSection";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <StickyHeader />
      <StickyCTA />
      <HeaderSection />
      <HeroSection />
      <GoogleComparisonSection />
      <BeforeAfterSection />
      <WhatWeSetUpSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <FounderSection />
      <FinalCTASection />
      <FooterSection />
    </main>
  );
};

export default Index;
