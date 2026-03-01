import { LaunchBanner } from "@/components/landing/LaunchBanner";
import { HeaderSection } from "@/components/landing/HeaderSection";
import { StickyHeader } from "@/components/landing/StickyHeader";

import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { NeverMissBookingSection } from "@/components/landing/NeverMissBookingSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FooterSection } from "@/components/landing/FooterSection";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <ScrollProgress />
      <LaunchBanner />
      <StickyHeader />
      
      <HeaderSection />
      <HeroSection />
      <ProblemSection />
      <NeverMissBookingSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <FinalCTASection />
      <FooterSection />
    </main>
  );
};

export default Index;
