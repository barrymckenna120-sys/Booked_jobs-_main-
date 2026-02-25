import { HeaderSection } from "@/components/landing/HeaderSection";
import { StickyHeader } from "@/components/landing/StickyHeader";
import { StickyCTA } from "@/components/landing/StickyCTA";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { ImageBlock } from "@/components/landing/ImageBlock";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FooterSection } from "@/components/landing/FooterSection";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <ScrollProgress />
      <StickyHeader />
      <StickyCTA />
      <HeaderSection />
      <HeroSection />
      <ProblemSection />
      <ImageBlock
        label="Image Placeholder – Missed Call Cost Visual"
        caption="Just one missed call per day can cost thousands per month."
      />
      <HowItWorksSection />
      <ImageBlock
        label="Image Placeholder – Booking → Dashboard → WhatsApp Flow"
        caption="Customer books. Job captured. Office notified instantly."
      />
      <FeaturesSection />
      <ImageBlock
        label="Image Placeholder – Quote & Review Flow"
        caption="Send quotes. Get approval. Request reviews — automatically."
      />
      <PricingSection />
      <FinalCTASection />
      <FooterSection />
    </main>
  );
};

export default Index;
