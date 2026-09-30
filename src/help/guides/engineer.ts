import type { HelpGuide } from "../types";
import e01 from "@/assets/help-engineer-01-today.png.asset.json";
import e02 from "@/assets/help-engineer-02-job-actions.png.asset.json";
import e03 from "@/assets/help-engineer-03-today-lower.png.asset.json";
import e04 from "@/assets/help-engineer-04-job-details.png.asset.json";
import e05 from "@/assets/help-engineer-05-job-details-lower.png.asset.json";
import e06 from "@/assets/help-engineer-06-fault-finder.png.asset.json";
import e07 from "@/assets/help-engineer-07-more-menu.png.asset.json";
import e08 from "@/assets/help-engineer-08-navigation.png.asset.json";
import e09 from "@/assets/help-engineer-09-photos-videos.png.asset.json";
import e10 from "@/assets/help-engineer-10-parts.png.asset.json";
import e11 from "@/assets/help-engineer-11-take-payment.png.asset.json";
import e12 from "@/assets/help-engineer-12-payment-successful.png.asset.json";
import e13 from "@/assets/help-engineer-13-actions-messages.png.asset.json";

/** Text from the approved Engineer App PDF; clean unframed screenshots as visuals. */
export const engineerGuide: HelpGuide = {
  slug: "engineer",
  title: "Engineer App",
  description: "A practical guide for engineers using BookedJobs on site.",
  audience: ["engineer", "owner"],
  lastUpdated: "30/09/26",
  sourceDocument: "BookedJobs Engineer App Guide (Final)",
  keywords: ["engineer", "engineer app", "on site", "mobile"],
  intro: ["Get your jobs → Get to the customer → Record the work → Complete & get paid."],
  quickReference: [{
    title: "Quick Reference — Other Actions",
    table: {
      head: ["Action", "What it does"],
      rows: [
        ["Next Job", "Move to the next scheduled job for the day."],
        ["Upcoming", "See future jobs."],
        ["Completed", "Review finished work."],
        ["Reschedule", "Move a job to another time or date."],
        ["Cancel", "Cancel the job when required."],
        ["Message Office", "Send an update or question to the office."],
        ["Report a Bug", "Report an app problem from the More menu."],
        ["Sign Out", "Securely sign out of the Engineer App."],
      ],
    },
  }],
  steps: [
    {
      slug: "header",
      title: "Understanding the Engineer App Header",
      shortDescription: "Quick access to the main views, notifications and extra tools.",
      body: ["The strip at the top of the Engineer App gives you quick access to the main views, notifications and extra tools."],
      callouts: [
        { number: 1, label: "Engineer / Office", text: "Owners and managers can switch between the Engineer App and Office App without signing out." },
        { number: 2, label: "Bell", text: "Shows alerts, notifications and changes sent from the Office App." },
        { number: 3, label: "Three dots (•••) — More Options", text: "Fault Finder — find boiler fault codes and explanations; Order Parts — request parts needed for a customer job; Take a Tour — view a guided tour of the main BookedJobs screens; Sign Out — securely sign out of the app." },
      ],
      screenshots: [{ src: e07.url, device: "mobile", alt: "More menu with Order Parts, Fault Finder, Take the tour, Report a Bug and Sign Out" }],
      keywords: ["header", "bell", "notifications", "three dots", "more options", "sign out", "take a tour"],
    },
    {
      slug: "controls",
      title: "Engineer App Controls",
      shortDescription: "Switch views, check notifications and open extra tools.",
      body: [
        "Owners and managers can switch between Engineer and Office at the top of the screen.",
        "The bell icon shows notifications and changes from the office.",
        "Tap the three dots in the top-right corner for additional tools.",
      ],
      screenshots: [{ src: e01.url, device: "mobile", alt: "Engineer App top strip with Engineer / Office switch, bell and three dots" }],
      keywords: ["controls", "switch", "office", "engineer", "bell"],
    },
    {
      slug: "todays-jobs",
      title: "Today's Jobs",
      shortDescription: "Your assigned jobs for the day.",
      body: [
        "Jobs are created and scheduled in the Office App and assigned directly to the engineer.",
        "Open a job to see the customer, job type, boiler information, last engineer, service history, previous notes and photographs.",
      ],
      screenshots: [{ src: e01.url, device: "mobile", alt: "Today's Jobs with job counts and the next job card" }, { src: e04.url, device: "mobile", alt: "Job details with contact, job type, time slot and boiler information" }, { src: e05.url, device: "mobile", alt: "Lower job details with last service, last engineer, notes and service history" }],
      keywords: ["today", "jobs", "assigned", "job details", "service history"],
    },
    {
      slug: "travel",
      title: "Travel & Keep the Office Updated",
      shortDescription: "Navigate to the customer and let the office know you're on the way.",
      body: [
        "Tap Nav to open the customer address in Google Maps.",
        "Use Messages to keep the office updated.",
        "When travelling to the customer, tap En Route so the office can see that you are on the way.",
      ],
      callouts: [{ label: "Nav", text: "Opens the customer's address in Google Maps." }],
      screenshots: [{ src: e08.url, device: "mobile", alt: "Google Maps navigation to the customer's address" }, { src: e03.url, device: "mobile", alt: "En Route and Message Office buttons above the rest of the day's jobs" }],
      keywords: ["nav", "navigate", "google maps", "en route", "travel", "directions"],
    },
    {
      slug: "messages",
      title: "Messages, Media & Job Actions",
      shortDescription: "Communicate with the office and update the job.",
      body: [
        "From the job screen you can communicate with the office, add media and update the job status.",
        "The bottom navigation gives quick access to Today, Upcoming, Completed and Office/Chat.",
      ],
      screenshots: [{ src: e13.url, device: "mobile", alt: "Messages with quick replies, Note, Media, Video and Fault Finder actions" }, { src: e02.url, device: "mobile", alt: "Job screen with Service History, Notes, Photos & Videos and Messages" }],
      keywords: ["messages", "chat", "office", "message office", "upcoming", "completed"],
    },
    {
      slug: "media",
      title: "Photos & Videos",
      shortDescription: "Add photos and videos to the job.",
      body: ["The media is uploaded to the job and becomes part of the customer record, where it is also available to the office."],
      instructions: ["Tap Media.", "Choose Take Photo or Record Video.", "Press Done when finished."],
      screenshots: [{ src: e09.url, device: "mobile", alt: "Photos & Videos sheet with Take Photo, Record Video and Done" }],
      keywords: ["media", "photo", "video", "take photo", "record video", "upload"],
    },
    {
      slug: "fault-finder",
      title: "Fault Finder",
      shortDescription: "Look up boiler fault codes on site.",
      body: ["BookedJobs shows an explanation of the fault and, where available, technical information and the official boiler manual."],
      instructions: ["Select the boiler brand and model.", "Choose the relevant fault code."],
      screenshots: [{ src: e06.url, device: "mobile", alt: "Fault Finder with brand, model, fault code and explanation" }],
      keywords: ["fault finder", "fault code", "boiler", "manual", "error code"],
    },
    {
      slug: "request-parts",
      title: "Request a Part",
      shortDescription: "Request a part directly from the Engineer App.",
      body: ["If a part is needed on site, request it directly from the Engineer App. The office receives an alert."],
      instructions: [
        "Select the customer and job reference.",
        "Enter the part and quantity.",
        "Set the priority as Urgent, Normal or Low.",
        "Add comments if useful.",
        "Confirm.",
      ],
      screenshots: [{ src: e10.url, device: "mobile", alt: "My Parts with Request Part button and open part requests" }],
      keywords: ["request part", "order a part", "order parts", "parts", "priority"],
    },
    {
      slug: "complete-job",
      title: "Complete the Job",
      shortDescription: "Record the work carried out and confirm the total.",
      body: [],
      instructions: [
        "Tap the green Complete button.",
        "Add the work carried out and any final notes.",
        "Mark Complete and confirm the final job total.",
      ],
      note: { tone: "warning", text: "A Customer Note can appear on the receipt, so only enter information you are happy for the customer to see." },
      screenshots: [{ src: e13.url, device: "mobile", alt: "Job screen with the green Complete button" }],
      keywords: ["complete", "mark complete", "finish job", "job total", "customer note"],
    },
    {
      slug: "payment",
      title: "Take Payment & Receipt",
      shortDescription: "Take card payment and send the receipt.",
      body: [
        "BookedJobs records the payment against the job and customer, generates the receipt and automatically sends the receipt to the customer by WhatsApp.",
        "The completed job keeps the notes, media, parts and payment together for the office and future visits.",
      ],
      instructions: [
        "For a card payment, take the payment on the SumUp terminal first.",
        "Once SumUp confirms it, select Card in BookedJobs.",
        "Confirm the amount and complete the payment.",
      ],
      screenshots: [{ src: e11.url, device: "mobile", alt: "Take Payment with Card, Cash and Invoice and the amount" }, { src: e12.url, device: "mobile", alt: "Payment Successful receipt with Download PDF Receipt and Receipt Sent" }],
      keywords: ["take payment", "payment", "card", "sumup", "receipt", "cash", "invoice"],
    },
  ],
};
