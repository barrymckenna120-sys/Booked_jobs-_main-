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
      <PageSeo
        title="BookedJobs — Boiler Service Management Software for Gas Engineers"
        description="Manage bookings, customers, service calls, renewals, and scheduling for your gas engineering business. Built for plumbers and boiler service companies in Ireland."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "BookedJobs",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        }}
      />
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
