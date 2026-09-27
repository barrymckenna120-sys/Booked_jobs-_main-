/** Engineer onboarding tour content — same shape as officeTourSteps. Not wired into the tour yet. */
import type { OfficeTourStep } from "./officeTourSteps";

export type EngineerTourStep = OfficeTourStep;

export const ENGINEER_TOUR_STEPS: EngineerTourStep[] = [
  {
    id: "jobs", number: "01", label: "Your jobs",
    title: "Your jobs, in order",
    body: "Today, Upcoming and Completed are at the bottom of the screen. An amber flag means the office has left you a note — read it before you set off.",
    benefits: ["Today, Upcoming, Completed", "Office notes flagged", "Emergency and renewal badges"],
    image: "/tour/eng-jobs.webp", hasImage: false,
    alt: "Engineer job list with Today, Upcoming and Completed tabs",
  },
  {
    id: "on-the-way", number: "02", label: "On the way",
    title: "Get there and keep the office updated",
    body: "Call the customer or navigate straight to the Eircode. Tap En Route, On Site and Start Work — the office sees your status live.",
    benefits: ["One-tap call and directions", "Live status for the office", "No phone calls needed"],
    image: "/tour/eng-on-the-way.webp", hasImage: false,
    alt: "Job screen with call, directions and En Route status buttons",
  },
  {
    id: "on-the-job", number: "03", label: "On the job",
    title: "Everything about the job and the boiler",
    body: "Read access notes, add notes, photos and video, check the customer's service history and boiler, and message the office from the job.",
    benefits: ["Notes, photos and video", "Service history and boiler", "Message the office"],
    image: "/tour/eng-on-the-job.webp", hasImage: false,
    alt: "Job details showing access notes, photos, service history and boiler",
  },
  {
    id: "certificates", number: "04", label: "Certificates",
    title: "Fill in certificates on your phone",
    body: "Complete boiler service, safety and gas installation certificates, declarations and hazard notices on the job.",
    benefits: ["All certificate types", "Done on site", "Saved to the job"],
    image: "/tour/eng-certificates.webp", hasImage: false,
    alt: "Certificate form being filled in on a phone",
  },
  {
    id: "parts", number: "05", label: "Parts & extra work",
    title: "Parts and extra work",
    body: "Mark Parts Needed or order parts, add extra work found on site, and use Fault Finder to help diagnose a fault.",
    benefits: ["Parts Needed and ordering", "Extra work recorded", "Fault Finder"],
    image: "/tour/eng-parts.webp", hasImage: false,
    alt: "Parts Needed, extra work and Fault Finder options on a job",
  },
  {
    id: "finish", number: "06", label: "Finish & get paid",
    title: "Finish the job and take payment",
    body: "Complete the job with notes for the receipt and take card or cash payment. The customer gets their receipt automatically. Nobody home? Use No Access.",
    benefits: ["Card or cash at the door", "Automatic receipt", "No Access recorded"],
    image: "/tour/eng-finish.webp", hasImage: false,
    alt: "Complete job screen with card and cash payment options",
  },
];
