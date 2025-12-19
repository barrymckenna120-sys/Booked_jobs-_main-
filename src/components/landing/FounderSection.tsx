import { Quote, MapPin } from "lucide-react";
import barryPhoto from "@/assets/barry-mckenna.png";

export const FounderSection = () => {
  return (
    <section className="section-container">
      <h2 className="section-heading">From the Founder</h2>
      
      <div className="bg-secondary rounded-xl p-6">
        <Quote className="w-8 h-8 text-cta/30 mb-4" />
        
        <p className="text-body mb-6 leading-relaxed">
          "I've worked with plumbers for years. This is built to help good local plumbers show up on Google, get chosen faster, and win more jobs every week."
        </p>
        
        <div className="border-t border-border pt-4 flex items-center gap-4">
          <img 
            src={barryPhoto} 
            alt="Barry McKenna" 
            className="w-16 h-16 rounded-full object-cover"
          />
          <div>
            <p className="font-semibold text-heading">Barry McKenna</p>
            <p className="text-sm text-subtle">Founder, WebLiveView Ltd</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-center gap-2 mt-6 text-sm text-subtle">
        <MapPin className="w-4 h-4 text-cta" />
        <span>Based in Dublin. Supporting Irish trades since 2018.</span>
      </div>
    </section>
  );
};
