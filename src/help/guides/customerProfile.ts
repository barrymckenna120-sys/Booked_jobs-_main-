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
  description: "How to find, review and update a customer's complete record in BookedJobs.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  sourceDocument: "BookedJobs Customer Profile Guide (Final)",
  keywords: ["customer", "profile", "customer record", "contact", "history"],
  intro: [
    "The Customer Profile keeps contact details, boiler information, service history, messages, payments, quotes, notes and activity together in one place.",
  ],
  beforeYouStart: [
    "Contact and property details",
    "Boiler and warranty information",
    "Service information and notes",
    "Customer activity and message history",
    "Payments and receipts",
    "Quotes",
    "Service history and certificates",
    "Parts",
  ],
  quickReference: [{
    title: "Quick reference",
    items: [
      "Use Search to quickly find a customer by name, phone number or address.",
      "Click Save after changing customer details.",
      "Check boiler and service information before booking or discussing a service.",
      "Use Notes for useful customer, property and engineer information.",
      "Use Activity Timeline and Message History to see what has happened with the customer.",
      "Use Payments & Activity for payment and receipt history.",
      "Use Quotes and Service History & Certificates for previous work and records.",
    ],
  }],
  steps: [
    {
      slug: "find-customer",
      title: "Find or add a customer",
      shortDescription: "Use the Customers page to quickly find the customer you need.",
      body: [
        "Search by name, phone number or address. You can also filter customers by area, such as Dublin 1, Dublin 2 or Dublin 3.",
        "Customer information is available on both desktop and mobile.",
      ],
      instructions: [
        "Click the customer's name to open their Customer Profile.",
        "To add a new customer, click + Add Customer in the top-right corner.",
      ],
      screenshots: [{ src: sList.url, device: "desktop", alt: "Customers list with area filters, search box and customer rows" }],
      keywords: ["find customer", "search", "add customer", "area", "filter"],
    },
    {
      slug: "contact-details",
      title: "Contact details & WhatsApp service reminders",
      shortDescription: "The customer's main contact and property details.",
      body: [
        "The Customer Profile stores the customer's main contact and property details, including their mobile number, email, address and Eircode.",
        "Information added or updated here is also available to the engineer in the Engineer App.",
        "The WhatsApp service reminder toggle shows whether the customer is open to receiving service reminders.",
        "If the customer replies STOP, or asks not to receive reminders, BookedJobs automatically stops sending them. You can also switch reminders on or off manually using the toggle.",
      ],
      instructions: ["Click Save after making any changes."],
      screenshots: [{ src: sContact.url, device: "desktop", alt: "Contact details with phone, email, address, Eircode, reminder toggle and Save" }],
      keywords: ["contact", "phone", "email", "eircode", "service reminder", "whatsapp reminder", "opt out", "stop"],
    },
    {
      slug: "boiler-warranty-service",
      title: "Boiler, warranty & service information",
      shortDescription: "Keep the customer's boiler, warranty and service information up to date.",
      body: ["Keep the customer's boiler, warranty and service information up to date in this section."],
      callouts: [
        { label: "Boiler Location", text: "Select where the boiler is installed, such as the kitchen, attic or garage." },
        { label: "Warranty", text: "Enter the installation date and select the warranty period, for example 10 years. BookedJobs automatically calculates the warranty expiry date." },
        { label: "Service dates", text: "Keep the Last Service Date and Next Service Due date accurate." },
      ],
      notes: [
        { tone: "info", text: "The Warranty page gives you a separate view of customers whose boilers are under warranty or out of warranty." },
        { tone: "info", text: "After a new boiler installation, BookedJobs can automatically send service reminder messages after 14 days and 30 days." },
        { tone: "warning", text: "The Next Service Due date is important because BookedJobs uses it to send the customer a WhatsApp service reminder 14 days before their service is due." },
      ],
      screenshots: [{ src: sBoiler.url, device: "desktop", alt: "Boiler and Service Information with location, warranty and service dates" }],
      keywords: ["boiler", "warranty", "service due", "next service", "service reminder", "installation"],
    },
    {
      slug: "notes-activity",
      title: "Notes & customer activity",
      shortDescription: "Notes from the office or engineer, and the Activity Timeline.",
      body: ["Notes can be added by the office during a customer call or by an engineer using the Engineer App while on site."],
      callouts: [
        { label: "Access Notes", text: "Record anything the engineer needs to enter the property, such as a key location, gate code or special access instruction." },
        { label: "Engineer Notes", text: "Keep internal information about the customer's boiler, heating system or previous work." },
        { label: "Customer Notes", text: "Add information you want to flag with the customer. These notes can appear on the customer's receipt, so only include information that is suitable for the customer to see." },
        { label: "Activity Timeline", text: "Keeps a history of activity with the customer, including messages, bookings, completed jobs and payments." },
      ],
      screenshots: [
        { src: sNotes.url, device: "desktop", alt: "Notes section with Access, Engineer and Customer Notes" },
        { src: sTimeline.url, device: "desktop", alt: "Activity Timeline with WhatsApp, payment and job completed entries" },
      ],
      keywords: ["notes", "access notes", "engineer notes", "customer notes", "activity", "timeline"],
    },
    {
      slug: "quotes-payments",
      title: "Quotes, payments & customer history",
      shortDescription: "A clear view of the customer's quotes and payment history.",
      body: [
        "The Customer Profile gives your team a clear view of the customer's quotes and payment history.",
        "You can see when deposits and other payments were received, the amount paid, the payment method and the receipt details.",
        "BookedJobs also shows the customer's total payments.",
        "This is useful when a customer calls and the staff member answering does not know their history. They can quickly review the customer's quotes, deposits, payments and previous activity before speaking with them.",
      ],
      screenshots: [{ src: sPayments.url, device: "desktop", alt: "Payments & Activity with card payments, dates, amounts and total paid" }],
      keywords: ["customer payment", "payments", "deposit", "quotes", "history", "total"],
    },
    {
      slug: "messages-records",
      title: "WhatsApp messages & customer records",
      shortDescription: "Message History and the customer's other records.",
      body: [
        "Message History keeps a record of WhatsApp messages sent to the customer. You can see what was sent, when it was sent and the message status.",
        "Below Message History, you can open Payments & Activity, Quotes, Service History & Certificates and Parts.",
        "Together, these sections give you a record of receipts, payments, quotes, completed work, certificates and parts ordered, including the relevant dates, times and amounts.",
      ],
      screenshots: [{ src: sMessages.url, device: "desktop", alt: "Message History with sent WhatsApp messages and their status" }],
      keywords: ["whatsapp", "messages", "message history", "status"],
    },
    {
      slug: "receipts-quotes",
      title: "View or download receipts & quotes",
      shortDescription: "Download a PDF copy of a receipt or quote.",
      body: [
        "For each payment, you can see the date, amount, payment method and receipt number.",
        "Quotes work in the same way.",
      ],
      instructions: [
        "Click Payments & Activity to view the customer's payment history.",
        "Click the Download button beside a payment to download a PDF copy of the receipt. You can then save, print or resend it if needed.",
        "Open Quotes to view previous quotes and use the Download button to download a PDF copy.",
      ],
      screenshots: [{ src: sPayments.url, device: "desktop", alt: "Payments & Activity with a Download button beside each payment" }],
      keywords: ["receipt", "download", "pdf", "quote", "resend", "print"],
    },
    {
      slug: "service-history-parts",
      title: "Service history, certificates & parts",
      shortDescription: "Previous work, certificates and parts ordered for the customer.",
      body: [
        "Open Service History & Certificates to see the customer's boiler service history.",
        "You can see the work completed, the amount charged, the engineer who carried out the work and whether the job is paid or still outstanding.",
        "At the bottom of the section, BookedJobs shows how much the customer has spent with you during the year.",
        "The Parts section keeps a record of parts ordered for the customer.",
        "If an engineer orders a part while on site using the Engineer App, the order is recorded here against the Customer Profile.",
      ],
      screenshots: [{ src: sHistory.url, device: "desktop", alt: "Quotes and Service History & Certificates tables with totals and statuses" }],
      keywords: ["service history", "certificates", "parts", "outstanding", "spent"],
    },
  ],
};
