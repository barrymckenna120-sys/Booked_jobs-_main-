/** Office onboarding tour content — single source, reusable by mobile later. */
export interface OfficeTourStep {
  id: string;
  number: string;
  label: string;
  title: string;
  body: string;
  benefits: string[];
  image: string;
  /** Only render/preload the image when true — avoids requests for missing files. */
  hasImage: boolean;
  alt: string;
}

export const OFFICE_TOUR_STEPS: OfficeTourStep[] = [
  {
    id: "incoming", number: "01", label: "Incoming Jobs",
    title: "New bookings land here",
    body: "When a customer fills in your booking form, the job arrives with their details, boiler make and model, error code, photos and preferred day. Review it and assign it to an engineer.",
    benefits: ["All the details up front", "Colour-coded by wait time", "Review and assign"],
    image: "/tour/incoming.webp", hasImage: true,
    alt: "Incoming Jobs list showing a new booking with New Customer and Possible duplicate badges",
  },
  {
    id: "schedule", number: "02", label: "Schedule",
    title: "Assign jobs to your engineers",
    body: "See each engineer's day, spot gaps and drop jobs where they fit. Customers are told automatically when their appointment is confirmed or changed.",
    benefits: ["Team schedule at a glance", "Quick job allocation", "Automatic customer updates"],
    image: "/tour/schedule.webp", hasImage: true,
    alt: "Weekly schedule with unallocated jobs and each engineer's booked slots",
  },
  {
    id: "engineer-app", number: "03", label: "Engineer App",
    title: "What your engineers see",
    body: "Engineers get their jobs, customer details, history and notes on their phone, and update progress and photos from site.",
    benefits: ["Job details on the phone", "Photos and notes", "Fewer calls to the office"],
    image: "/tour/engineer-app.webp", hasImage: true,
    alt: "Engineer app showing a boiler service job with a payment due banner",
  },
  {
    id: "quotes", number: "04", label: "Quotes",
    title: "Send a quote in about two minutes",
    body: "Build a quote with parts and labour and send it by WhatsApp. The customer accepts online and the quote becomes a job.",
    benefits: ["Professional quotes", "Online acceptance", "Accepted quote becomes a job"],
    image: "/tour/quotes.webp", hasImage: true,
    alt: "Quotes list with status tabs, profit summary and each quote's status",
  },
  {
    id: "deposit", number: "05", label: "Deposit",
    title: "Take a deposit to confirm the job",
    body: "Send a payment link to the customer's phone. The payment is recorded against the quote and job automatically.",
    benefits: ["Payment links by WhatsApp", "Recorded automatically", "Balance tracked"],
    image: "/tour/deposit.webp", hasImage: true,
    alt: "WhatsApp message asking the customer to pay a deposit through a secure payment link",
  },
  {
    id: "payment", number: "06", label: "Payment",
    title: "Get paid and send the receipt",
    body: "Take the balance by card or payment link. A PDF receipt with the service details is sent and saved to the customer's record.",
    benefits: ["Clear outstanding balances", "Automatic PDF receipt", "Saved to customer profile"],
    image: "/tour/payment.webp", hasImage: true,
    alt: "Outstanding balances with Take Payment, Send Link and reminder actions",
  },
  {
    id: "renewals", number: "07", label: "Renewals",
    title: "Bring customers back every year",
    body: "Customers get a WhatsApp reminder with a booking link before their annual service is due.",
    benefits: ["Automatic reminders", "WhatsApp booking link", "More repeat work"],
    image: "/tour/renewals.webp", hasImage: true,
    alt: "Renewals screen showing services due and customer records",
  },
];
