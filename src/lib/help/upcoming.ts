/**
 * DRAFT help articles for upcoming / partly shipped features. NOT rendered (not imported by the Help Center).
 * When a feature ships, verify labels in the UI, then move the article into HELP_ARTICLES in ./articles.ts.
 * Status notes: manual payment methods shipped in 81a2084 (see payment-methods-setup in articles.ts);
 * per-owner card payments (Stripe Connect), automatic reminders and in-app SMS are not built yet.
 */
import type { HelpArticle } from "./articles";

export type UpcomingArticle = HelpArticle & { feature: string; status: "draft" | "shipped-verify-labels" };

export const UPCOMING_HELP_ARTICLES: UpcomingArticle[] = [
  { feature: "manual-payment-methods", status: "shipped-verify-labels",
    id: "pay-zelle-venmo-cashapp", category: "Payments", question: "How do clients pay me with Zelle, Venmo or Cash App?",
    summary: "Clients see your handle with a copy button; they pay you in their own app.",
    steps: ["In Settings, under Payment methods, turn on Zelle, Venmo or Cash App and enter your handle.", "Tap Save payment methods.", "Your client sees the handle on the invoice, approval link and portal, with Copy and (where supported) an Open app button.", "When the money arrives, open the invoice, tap Mark paid and pick the method."],
    tips: ["ClientReady can't see these transfers, so it never marks them paid for you."],
    related: ["manual-payment"], keywords: ["zelle", "venmo", "cash app", "p2p"] },
  { feature: "manual-payment-methods", status: "shipped-verify-labels",
    id: "pay-paypal-me", category: "Payments", question: "How do I accept PayPal.me payments?",
    steps: ["In Settings, under Payment methods, turn on PayPal.me and enter your PayPal.me link or username.", "Save payment methods.", "Clients tap the link to pay in PayPal; record it with Mark paid."],
    related: ["pay-zelle-venmo-cashapp"], keywords: ["paypal"] },
  { feature: "manual-payment-methods", status: "shipped-verify-labels",
    id: "pay-check-ach", category: "Payments", question: "How do clients pay by check or bank transfer (ACH)?",
    steps: ["In Settings, under Payment methods, turn on Check and enter who to pay and the mailing address.", "Turn on Bank transfer and enter the instructions you want clients to see.", "Save payment methods.", "When the check clears or the transfer lands, tap Mark paid and choose the method."],
    tips: ["Only share bank details you are comfortable showing to anyone who has the invoice link."],
    related: ["pay-zelle-venmo-cashapp"], keywords: ["check", "cheque", "ach", "bank", "wire"] },
  { feature: "card-payments-connect", status: "draft",
    id: "card-connect-own-account", category: "Payments", question: "How do I take card payments into my own account?",
    summary: "Connect your own card processor account; card payments go straight to you.",
    steps: ["Open Settings and find Card payments.", "Tap Connect and sign in to (or create) your own Stripe account.", "Finish the provider's setup, then return to ClientReady.", "Invoices, approval links and the portal show a Pay by card button. Paid invoices are recorded automatically once the provider confirms."],
    tips: ["Fees and payout timing are set by your provider. ClientReady never holds your money.", "Refunds are done in your provider's dashboard."],
    related: ["pay-zelle-venmo-cashapp"], keywords: ["card", "credit card", "stripe", "connect", "square", "paypal checkout"] },
  { feature: "reminders", status: "draft",
    id: "auto-reminders", category: "Invoices", question: "Can ClientReady remind clients about unpaid invoices automatically?",
    summary: "Planned: choose a reminder schedule and ClientReady emails overdue clients for you.",
    steps: ["Open Settings and find Reminders.", "Turn on automatic reminders and pick when they go out (for example 3 days before due, on the due date, 7 days after).", "Edit the reminder message if you like and Save.", "Turn reminders off for a single invoice from that invoice."],
    tips: ["Today you can already send a reminder by hand: open the invoice's Payment reminder and use Open in Messages or Open in email."],
    related: ["sms-texting"], keywords: ["reminder", "overdue", "late", "nudge"] },
  { feature: "sms", status: "draft",
    id: "sms-texting", category: "Email & sharing", question: "Can I text clients from ClientReady?",
    summary: "Planned: send texts (links, reminders, On my way) from ClientReady itself.",
    steps: ["Clients must agree to receive texts; their phone must be on their client card.", "From an invoice, proposal or job, choose Text and review the message.", "Tap Send. Replies come back to [SMS reply destination]."],
    tips: ["Today, texts open in your own Messages app and are sent from your phone number.", "Clients can reply STOP to opt out."],
    related: ["auto-reminders"], keywords: ["sms", "text", "message", "phone"] },
];
