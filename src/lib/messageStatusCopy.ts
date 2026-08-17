/**
 * Tenant-facing plain-language copy for messaging config gaps.
 *
 * The superadmin catalogue speaks in reason codes (`message_footer_not_configured`,
 * skip/degrade). Tenants get sentences instead. Keeping the mapping in one place
 * means the two views can't drift apart.
 */

import type { ConfigKeyId } from "./whatsappCatalogue";

/** Where a tenant goes to fix a gap themselves, or "support" when they can't. */
export type FixTarget =
  | { kind: "settings-tab"; tab: string; tabLabel: string; fieldLabel: string }
  | { kind: "support" };

export interface GapCopy {
  /** Short noun phrase, used in the header summary. */
  thing: string;
  /** Shown when the gap stops messages sending. */
  pausedLine: string;
  /** Shown when the message still sends but with a detail missing. */
  degradedLine: string;
  fix: FixTarget;
}

export const TENANT_GAP_COPY: Record<ConfigKeyId, GapCopy> = {
  message_footer: {
    thing: "message footer",
    pausedLine:
      "Your message footer is empty, so these messages are paused — add your business name and contact details to switch them back on.",
    degradedLine:
      "Sending, but without your sign-off at the end. Add a message footer so customers know who the message is from.",
    fix: {
      kind: "settings-tab",
      tab: "general",
      tabLabel: "Settings → General",
      fieldLabel: "Message footer",
    },
  },
  company_name: {
    thing: "business name",
    pausedLine:
      "Your business name isn't set, so these messages are paused until it's added.",
    degradedLine:
      "Sending, but without your business name. Add it so customers recognise the message.",
    fix: {
      kind: "settings-tab",
      tab: "general",
      tabLabel: "Settings → General",
      fieldLabel: "Business name",
    },
  },
  company_phone: {
    thing: "contact phone number",
    pausedLine:
      "Your contact phone number isn't set, so these messages are paused until it's added.",
    degradedLine:
      "Sending, but without your phone number. Add it so customers can call you back.",
    fix: {
      kind: "settings-tab",
      tab: "general",
      tabLabel: "Settings → General",
      fieldLabel: "Business phone",
    },
  },
  google_review_url: {
    thing: "Google review link",
    pausedLine:
      "Your Google review link isn't set up yet — review requests are paused until it's added.",
    degradedLine: "Sending, but without your review link.",
    fix: {
      kind: "settings-tab",
      tab: "integrations",
      tabLabel: "Settings → Integrations",
      fieldLabel: "Google Review URL",
    },
  },
  renewal_form_url: {
    thing: "rebooking form link",
    pausedLine:
      "Your rebooking form link isn't set up yet — service and warranty reminders are paused until it's added.",
    degradedLine: "Sending, but without a booking link for customers to click.",
    fix: {
      kind: "settings-tab",
      tab: "integrations",
      tabLabel: "Settings → Integrations",
      fieldLabel: "Rebooking Form URL",
    },
  },
  new_booking_url: {
    thing: "new booking form link",
    pausedLine:
      "Your new booking form link isn't set up yet — these messages are paused until it's added.",
    degradedLine: "Sending, but without a booking link for new customers.",
    fix: {
      kind: "settings-tab",
      tab: "integrations",
      tabLabel: "Settings → Integrations",
      fieldLabel: "New Booking Form URL",
    },
  },
  cert_prefix: {
    thing: "job reference prefix",
    pausedLine:
      "Your job reference prefix isn't set, so these messages are paused until it's added.",
    degradedLine:
      "Sending, but job numbers appear in a generic format. Add your reference prefix to tidy this up.",
    fix: {
      kind: "settings-tab",
      tab: "quote_defaults",
      tabLabel: "Settings → Quote & Invoice Defaults",
      fieldLabel: "Certificate / job prefix",
    },
  },
  stripe_payment_link: {
    thing: "payment link",
    pausedLine:
      "Your payment link isn't set up yet — these payment messages are paused until it's added.",
    degradedLine: "Sending, but without a payment link.",
    fix: {
      kind: "settings-tab",
      tab: "integrations",
      tabLabel: "Settings → Integrations",
      fieldLabel: "Stripe Payment Link",
    },
  },
  sumup_merchant_code: {
    thing: "card payment account",
    pausedLine:
      "Your card payment account isn't connected yet, so deposit and payment links can't be created. Contact support to get this set up.",
    degradedLine:
      "Sending, but without a card payment link. Contact support to connect card payments.",
    fix: { kind: "support" },
  },
  whatsapp_api_key_secret: {
    thing: "WhatsApp connection",
    pausedLine:
      "Your WhatsApp connection isn't finished yet, so these messages can't be sent. Contact support to complete setup.",
    degradedLine: "Sending, but your WhatsApp connection needs attention. Contact support.",
    fix: { kind: "support" },
  },
};
