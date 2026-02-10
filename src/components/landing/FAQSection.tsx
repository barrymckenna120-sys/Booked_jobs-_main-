import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "Do I need a website?",
    answer: "No. We can use your Facebook or set up a landing page.",
  },
  {
    question: "Is this SEO or Ads?",
    answer: "Neither. It's Google profile optimisation — where real leads come from.",
  },
  {
    question: "What if I already have a site?",
    answer: "We plug in the booking form. Fast and easy.",
  },
  {
    question: "Can I cancel?",
    answer: "Yes — cancel anytime. No lock-in contracts.",
  },
  {
    question: "Will I show up in my area?",
    answer: "If we don't think we can help you, we'll tell you upfront — no charge.",
  },
];

export const FAQSection = () => {
  return (
    <section className="section-container">
      <div className="flex items-center gap-2 mb-6">
        <HelpCircle className="w-6 h-6 text-cta" />
        <h2 className="section-heading mb-0">Frequently Asked Questions</h2>
      </div>
      
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left text-heading font-medium">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-body">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};
