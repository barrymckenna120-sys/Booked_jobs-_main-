import type { HelpGuide } from "../types";
import sList from "@/assets/help-customer-list.png.asset.json";
import sContact from "@/assets/help-customer-contact.png.asset.json";
import sBoiler from "@/assets/help-customer-boiler.png.asset.json";
import sNotes from "@/assets/help-customer-notes.png.asset.json";
import sTimeline from "@/assets/help-customer-timeline.png.asset.json";
import sMessages from "@/assets/help-customer-messages.png.asset.json";
import sPayments from "@/assets/help-customer-payments.png.asset.json";
import sHistory from "@/assets/help-customer-history.png.asset.json";

export const customerProfileGuide: HelpGuide = {
  slug: "customer-profile",
  title: "Customer Profile",
  description: "Find a customer and use their profile: contact details, boiler, notes, activity, messages, payments and history.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  keywords: ["customer", "profile", "contact", "boiler", "notes", "payments", "history", "messages"],
  steps: [
    {
      slug: "find-customer",
      title: "Find a customer",
      shortDescription: "Search, filter by area code, or use the status tags.",
      body: [
        "The Customers page lists everyone in your company. Use the search box to find a name, phone number or address.",
        "Tap an area code chip (e.g. D16) to show only customers in that area, and tap Clear to show everyone again.",
        "The coloured tags under the search box — New Boiler Fitted, New Boiler Soon, Under Warranty — filter the list by those groups.",
      ],
      instructions: [
        "Open Customers from the menu.",
        "Search or filter to find the customer.",
        "Tap their row to open the profile.",
      ],
      note: { tone: "info", text: "The Status column shows at a glance whether a customer is Up to Date or Overdue for a service." },
      screenshots: [{ src: sList.url, device: "desktop", alt: "Customers list with area code filters, search box and status column" }],
      keywords: ["search", "area code", "filter", "status", "up to date", "overdue", "add customer"],
    },
    {
      slug: "contact-information",
      title: "Contact Information",
      shortDescription: "Edit name, phone, address and reminder settings.",
      body: [
        "The top of the profile holds the customer's contact details: name, mobile, landline, email, address, Eircode, area code and GPRN.",
        "The Opt out of service reminders switch stops automated renewal reminders for this customer. When they can receive messages, you'll see Receiving WhatsApp in green.",
      ],
      instructions: [
        "Edit any field.",
        "Tap Save at the top of the page.",
      ],
      callouts: [
        { label: "History", text: "Shows previous versions of the contact details, so you can see what changed and when." },
        { label: "Archive", text: "Removes the customer from your active list without deleting their history." },
      ],
      screenshots: [{ src: sContact.url, device: "desktop", alt: "Contact Information card with customer details, Save and Archive buttons" }],
      keywords: ["edit", "save", "archive", "opt out", "reminders", "whatsapp", "eircode", "gprn", "history"],
    },
    {
      slug: "boiler-service",
      title: "Boiler & Service Information",
      shortDescription: "The boiler on record and when the next service is due.",
      body: [
        "Boiler Information records the brand, model, location, type, installation date and warranty. Start typing in Brand or Model to see suggestions, or enter a new one.",
        "Warranty Expiry is worked out from the installation date and warranty years, and the Warranty Status badge shows Under Warranty in green when it's still covered.",
        "Service Information shows the last service date and engineer, the next service due date, and the service status. These update automatically when jobs are completed.",
      ],
      screenshots: [{ src: sBoiler.url, device: "desktop", alt: "Boiler Information and Service Information cards with warranty status" }],
      keywords: ["boiler", "brand", "model", "warranty", "installation", "next service", "service status", "renewal"],
    },
    {
      slug: "notes",
      title: "Notes",
      shortDescription: "Three note boxes for access, engineer and customer notes.",
      body: [
        "Access Notes — anything about getting in, e.g. \"call customer 1 hour before call\". Engineers see these on the job.",
        "Engineer Notes — technical notes about the boiler or property.",
        "Customer Notes — general notes about the customer.",
        "Notes save with the rest of the profile when you tap Save.",
      ],
      screenshots: [{ src: sNotes.url, device: "desktop", alt: "Notes card with Access Notes, Engineer Notes and Customer Notes boxes" }],
      keywords: ["notes", "access notes", "engineer notes", "customer notes"],
    },
    {
      slug: "activity-timeline",
      title: "Activity Timeline",
      shortDescription: "Everything that's happened, newest first.",
      body: [
        "The timeline lists jobs completed, payments received, WhatsApp messages sent and more, with the date and who did it.",
        "Tap Show all activities to expand the full list.",
      ],
      instructions: ["Tap Log Activity to add your own entry, e.g. a phone call you made."],
      screenshots: [{ src: sTimeline.url, device: "desktop", alt: "Activity Timeline with WhatsApp, payment and job completed entries" }],
      keywords: ["activity", "timeline", "log activity", "history", "events"],
    },
    {
      slug: "message-history",
      title: "Message History",
      shortDescription: "Every message sent to the customer, with its status.",
      body: [
        "See each WhatsApp and email sent — booking confirmations, reminders, warranty messages — with the date, who sent it and its delivery status (sent, accepted).",
        "Tap Show less / Show more to collapse or expand the list.",
      ],
      instructions: ["Tap Send Message to write a new message to the customer."],
      screenshots: [{ src: sMessages.url, device: "desktop", alt: "Message History with sent messages and the Send Message button" }],
      keywords: ["messages", "whatsapp", "send message", "delivery status", "reminders"],
    },
    {
      slug: "payments",
      title: "Payments & Activity",
      shortDescription: "Payments taken, with receipts to copy or download.",
      body: [
        "Each payment shows the job number, method (e.g. Card), date, who took it and the amount. Total paid is summed at the bottom.",
        "Use the icons on a payment to copy the receipt link or download the receipt.",
      ],
      screenshots: [{ src: sPayments.url, device: "desktop", alt: "Payments & Activity card with two card payments and total paid" }],
      keywords: ["payments", "receipt", "card", "total paid", "download"],
    },
    {
      slug: "quotes-history",
      title: "Quotes & Service History",
      shortDescription: "Past quotes, jobs and certificates in one place.",
      body: [
        "Quotes lists every quote for the customer with its date, total and status (e.g. Converted).",
        "Service History & Certificates lists every job with the date, job type, engineer, amount and payment status. Certificate icons appear on rows that have documents. Total spent is summed at the bottom.",
        "Parts shows any parts fitted for this customer.",
      ],
      screenshots: [{ src: sHistory.url, device: "desktop", alt: "Quotes and Service History & Certificates sections with totals" }],
      keywords: ["quotes", "service history", "certificates", "parts", "total spent", "converted"],
    },
  ],
};
