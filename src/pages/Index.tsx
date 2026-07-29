import PageSeo from "@/components/seo/PageSeo";
import { HeaderSection } from "@/components/landing/HeaderSection";
import { StickyHeader } from "@/components/landing/StickyHeader";
import MarketingOfflineGate from "@/components/landing/MarketingOfflineGate";

import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { NeverMissBookingSection } from "@/components/landing/NeverMissBookingSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { FooterSection } from "@/components/landing/FooterSection";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <MarketingOfflineGate />
      <ScrollProgress />
      <StickyHeader />
      
      <HeaderSection />
      <HeroSection />
      <ProblemSection />
      <NeverMissBookingSection />
      <HowItWorksSection />
      <FeaturesSection />
      <FooterSection />
    </main>
  );
};

export default Index;
