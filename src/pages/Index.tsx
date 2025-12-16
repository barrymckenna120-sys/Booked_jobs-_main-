import { HeaderSection } from "@/components/landing/HeaderSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { WhyThisMattersSection } from "@/components/landing/WhyThisMattersSection";
import { MissedCallsSection } from "@/components/landing/MissedCallsSection";
import { GoogleVisibilitySection } from "@/components/landing/GoogleVisibilitySection";
import { GoogleVsAdsSection } from "@/components/landing/GoogleVsAdsSection";
import { WhyGoogleMattersSection } from "@/components/landing/WhyGoogleMattersSection";
import { WhatWeSetUpSection } from "@/components/landing/WhatWeSetUpSection";
import { NoBackAndForthSection } from "@/components/landing/NoBackAndForthSection";
import { OptionalPaymentsSection } from "@/components/landing/OptionalPaymentsSection";
import { SignUpFlowSection } from "@/components/landing/SignUpFlowSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { OptionalSupportSection } from "@/components/landing/OptionalSupportSection";
import { FounderSection } from "@/components/landing/FounderSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FooterSection } from "@/components/landing/FooterSection";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <HeaderSection />
      <HeroSection />
      <WhyThisMattersSection />
      <MissedCallsSection />
      <GoogleVisibilitySection />
      <GoogleVsAdsSection />
      <WhyGoogleMattersSection />
      <WhatWeSetUpSection />
      <NoBackAndForthSection />
      <OptionalPaymentsSection />
      <SignUpFlowSection />
      <PricingSection />
      <OptionalSupportSection />
      <FounderSection />
      <FinalCTASection />
      <FooterSection />
    </main>
  );
};

export default Index;
