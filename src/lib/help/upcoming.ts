/**
 * DRAFT help articles for upcoming / partly shipped features. NOT rendered (not imported by the Help Center).
 * When a feature ships, verify labels in the UI, then move the article into HELP_ARTICLES in ./articles.ts.
 * Status notes: manual payment methods shipped in 81a2084; their articles moved to articles.ts 2026-10-16;
 * per-owner card payments (Stripe Connect / other processors), in-app refunds, automatic reminders and in-app SMS are not built yet; their UI labels are marked [TBD].
 */
import type { HelpArticle } from "./articles";

export type UpcomingArticle = HelpArticle & { feature: string; status: "draft" | "shipped-verify-labels" };

export const UPCOMING_HELP_ARTICLES: UpcomingArticle[] = [
  { feature: "card-payments-connect", status: "draft", id: "card-connect-own-account", category: "Payments", question: "How do I take card payments into my own account (Stripe, Square, PayPal)?",
    summary: "Planned (labels TBD): connect your own card processor so card payments go straight to you.",
    steps: ["Open Settings and find [TBD: card payments / connect section label].", "Tap [TBD: connect button label] and sign in to (or create) your own account with the provider.", "Finish the provider's setup, then return to ClientReady.", "Invoices, approval links and the portal show [TBD: pay button label]. Payments are recorded automatically once the provider confirms."],
    tips: ["Fees and payout timing are set by your provider. ClientReady never holds your money.", "Refunds and disputes are handled in your provider's dashboard."], related: ["pay-zelle-venmo-cashapp", "ts-refund"], keywords: ["card", "credit card", "stripe", "connect", "square", "paypal checkout"] },
  { feature: "card-fee", status: "shipped-verify-labels", id: "card-fee-surcharge", category: "Payments", question: "Can I pass card fees on to clients?",
    summary: "Optional: add a clearly labeled card processing fee line to an invoice. It's off unless you add it.",
    steps: ["Open the invoice (not a proposal) and open Pass card processing fee to the customer (optional).", "It shows the amount: Card processing fee (3%) of the current total.", "Tap Add card fee line. It's added as its own line, 'Card processing fee (3%, credit card payments only)', and you see 'Card fee of $… added as its own line. Remove it if the customer doesn't pay by credit card.'", "Save the invoice. If the client pays by cash, check, bank or another method, remove the line before they pay."],
    tips: ["The fee is 3% of the total when you tap. If you change items, discount or tax afterwards, remove the line and add it again.", "Card surcharge rules depend on your state and the card networks. Check them before using this. ClientReady doesn't check them for you.", "Hidden 2026-10-20: owner chose to hide the card fee line until Terms §6 [Card fees / surcharges] is settled (R38). Labels verified against 697f6e2."], related: ["card-payments", "line-items", "job-profit-breakdown"], keywords: ["surcharge", "convenience fee", "card fee", "processing fee", "3%"] },
  { feature: "refunds", status: "draft", id: "refund-in-app", category: "Payments", question: "Can I issue a refund from ClientReady?",
    steps: ["Not built. [TBD: whether in-app refunds are planned].", "Today, refund in your provider's dashboard or send the money back yourself, then use Remove payment on the invoice."],
    related: ["ts-refund"], keywords: ["refund"] },
  { feature: "reminders", status: "draft",
    id: "auto-reminders", category: "Invoices", question: "Can ClientReady remind clients about unpaid invoices automatically?",
    summary: "Planned: choose a reminder schedule and ClientReady emails overdue clients for you.",
    steps: ["Open Settings and find [TBD: reminders section label].", "[TBD: toggle label] Turn on automatic reminders and pick when they go out (for example 3 days before due, on the due date, 7 days after).", "Edit the reminder message if you like and Save.", "Turn reminders off for a single invoice from that invoice."],
    tips: ["Today you can already send a reminder by hand: open the invoice's Payment reminder and use Open in Messages or Open in email."],
    related: ["sms-texting"], keywords: ["reminder", "overdue", "late", "nudge"] },
  { feature: "sms", status: "draft",
    id: "sms-texting", category: "Email & sharing", question: "Can I text clients from ClientReady?",
    summary: "Planned: send texts (links, reminders, On my way) from ClientReady itself.",
    steps: ["Clients must agree to receive texts; their phone must be on their client card.", "From an invoice, proposal or job, choose [TBD: in-app text action label] and review the message.", "Tap [TBD: send label]. Replies come back to [SMS reply destination]."],
    tips: ["Today, texts open in your own Messages app and are sent from your phone number.", "Clients can reply STOP to opt out."],
    related: ["auto-reminders"], keywords: ["sms", "text", "message", "phone"] },
  { feature: "reimbursements", status: "draft", id: "crew-reimbursements", category: "Crew", question: "How do I pay crew back for what they spent?",
    steps: ["[TBD: where reimbursements live, e.g. a Reimbursements page].", "[TBD: how crew costs are marked owed, approved and paid back].", "[TBD: labels and how it affects job costs and Reports]."],
    tips: ["Draft only: Dev's reimbursements feature is in progress and not committed; labels not verified."], related: ["crew-costs-review", "crew-expenses"], keywords: ["reimburse", "pay back", "crew expenses", "owed to crew"] },
];
