import { MessageCircle, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

const testimonials = [
  {
    quote: "I was missing 3–4 calls a week. Now I get bookings while I'm on-site. Paid for itself in week one.",
    name: "Mike D.",
    location: "Cork Plumber",
  },
  {
    quote: "I didn't have a website. Just a Facebook page. Now customers can book me directly.",
    name: "John B.",
    location: "Meath",
  },
  {
    quote: "Google listing looked dead before. Now I get better jobs from local homeowners.",
    name: "Pat R.",
    location: "Dublin 15",
  },
];

export const TestimonialsSection = () => {
  return (
    <section className="section-container">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="w-6 h-6 text-primary" />
        <h2 className="section-heading mb-0">What Other Plumbers Say</h2>
      </div>
      
      <div className="space-y-4">
        {testimonials.map((testimonial, index) => (
          <div key={index} className="bg-secondary rounded-xl p-5">
            <Quote className="w-6 h-6 text-primary/30 mb-3" />
            <p className="text-body mb-4 italic">"{testimonial.quote}"</p>
            <div className="border-t border-border pt-3">
              <p className="font-semibold text-heading">{testimonial.name}</p>
              <p className="text-sm text-subtle">{testimonial.location}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6">
        <Button size="lg" variant="outline" className="w-full text-base font-semibold py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground" asChild>
          <a href="https://tally.so/r/0Qd2Y0" target="_blank" rel="noopener noreferrer">
            See More Testimonials →
          </a>
        </Button>
      </div>
    </section>
  );
};
