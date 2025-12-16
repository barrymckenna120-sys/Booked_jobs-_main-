import { Calendar, Star, Award } from "lucide-react";
import googleLogo from "@/assets/google-logo.png";

export const WhyGoogleMattersSection = () => {
  const features = [
    { icon: Calendar, text: "Works all year without ongoing ad spend" },
    { icon: Star, text: "Builds trust through reviews and photos" },
    { icon: Award, text: "Gets you shown first on Google" },
  ];

  return (
    <section className="section-container bg-secondary">
      <div className="flex justify-center mb-4">
        <img src={googleLogo} alt="Google" className="w-10 h-10" />
      </div>
      <h2 className="section-heading">Why Your Google Business Profile Matters</h2>
      
      <ul className="bullet-list mb-6">
        {features.map((item, index) => (
          <li key={index} className="bullet-item">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-primary" />
            </div>
            <span className="text-body">{item.text}</span>
          </li>
        ))}
      </ul>
      
      <p className="text-sm text-subtle">
        This is the first page Google checks when deciding which plumber to show.
      </p>
    </section>
  );
};
