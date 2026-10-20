/**
 * DRAFT help articles for upcoming / partly shipped features. NOT rendered (not imported by the Help Center).
 * When a feature ships, verify labels in the UI, then move the article into HELP_ARTICLES in ./articles.ts.
 * Status notes: manual payment methods shipped in 81a2084; their articles moved to articles.ts 2026-10-16;
 * per-owner card payments (Stripe Connect / other processors), card fees, in-app refunds, automatic reminders and in-app SMS are not built yet; their UI labels are marked [TBD].
 */
import type { HelpArticle } from "./articles";

export type UpcomingArticle = HelpArticle & { feature: string; status: "draft" | "shipped-verify-labels" };

export const UPCOMING_HELP_ARTICLES: UpcomingArticle[] = [
  { feature: "card-payments-connect", status: "draft", id: "card-connect-own-account", category: "Payments", question: "How do I take card payments into my own account (Stripe, Square, PayPal)?",
    summary: "Planned (labels TBD): connect your own card processor so card payments go straight to you.",
    steps: ["Open Settings and find [TBD: card payments / connect section label].", "Tap [TBD: connect button label] and sign in to (or create) your own account with the provider.", "Finish the provider's setup, then return to ClientReady.", "Invoices, approval links and the portal show [TBD: pay button label]. Payments are recorded automatically once the provider confirms."],
    tips: ["Fees and payout timing are set by your provider. ClientReady never holds your money.", "Refunds and disputes are handled in your provider's dashboard."], related: ["pay-zelle-venmo-cashapp", "ts-refund"], keywords: ["card", "credit card", "stripe", "connect", "square", "paypal checkout"] },
  { feature: "card-fee", status: "draft", id: "card-fee-surcharge", category: "Payments", question: "Can I pass card fees on to clients?",
    steps: ["Not built yet. [TBD: whether a card fee / surcharge or cash discount option is planned, and its label].", "Today you can add a line item for a fee yourself before sending."],
    tips: ["Surcharge rules vary by state and card network. Check before adding a card fee."], related: ["card-connect-own-account"], keywords: ["surcharge", "convenience fee", "card fee"] },
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
  { feature: "auto-overdue", status: "shipped-verify-labels", id: "overdue-automatic", category: "Invoices", question: "When does an invoice count as Overdue?",
    summary: "Automatically, the day after its due date, if it was sent and still has money owed. You don't need to change the status.",
    steps: ["A sent (not draft), unpaid invoice with a balance counts as Overdue once its Due date has passed (the day after, on your device's date).", "Partly paid invoices count by the remaining balance only. Deposits already paid lower that balance.", "The dashboard Overdue card and Documents → Overdue filter use this rule.", "Choosing Overdue in the status yourself still works.", "[TBD: whether Collect and payment-plan invoices follow the same rule]"],
    tips: ["The stored status isn't changed, so nothing is emailed to the client automatically."], related: ["partial-payments", "late-fee-settings"], keywords: ["overdue", "late", "past due", "due date"] },
  { feature: "payment-method-required", status: "draft", id: "payment-method-required", category: "Payments", question: "Why do I have to pick a payment method when I mark an invoice paid?",
    steps: ["When you set an invoice to [TBD: Paid / Mark paid label], choose how you were paid in [TBD: payment method field label].", "Pick one or more methods [TBD: multi-select label] (for example Cash, Check, Zelle, Card (Stripe)).", "Tap [TBD: save label]."],
    tips: ["Reports and the accountant package group payments by method.", "[TBD: what happens to older paid invoices with no method]"], related: ["partial-payments", "accountant-package"], keywords: ["payment method", "paid", "cash", "check", "zelle"] },
  { feature: "period-views", status: "draft", id: "period-views", category: "Year packet & reports", question: "Can I see my numbers by week, month or quarter?",
    steps: ["Open [TBD: Reports / Year page] and choose [TBD: period selector label and options].", "Totals (Collected, Spent, Profit) update for that period.", "[TBD: whether exports follow the selected period]"],
    related: ["reports", "year-packet"], keywords: ["period", "month", "quarter", "week", "date range"] },
  { feature: "dashboard-reminders", status: "draft", id: "dashboard-reminders", category: "Getting started", question: "What are the reminder cards on the dashboard?",
    summary: "Planned: five reminder cards that show what needs your attention today.",
    steps: ["Open the Dashboard.", "[TBD: card 1–5 names, e.g. overdue invoices, proposals waiting, jobs today, unsent drafts, crew hours to approve].", "Tap a card to open the matching list.", "[TBD: dismiss / snooze label]"],
    related: ["needs-review", "overdue-automatic"], keywords: ["dashboard", "reminders", "to do", "cards"] },
  { feature: "schedule-conflicts", status: "draft", id: "schedule-conflicts", category: "Calendar & jobs", question: "Why can't I book a crew member at that time?",
    summary: "ClientReady stops you from double-booking the same employee on overlapping jobs.",
    steps: ["When you assign someone already booked at that time, you see [TBD: conflict message].", "Pick another time or person, or tap Book anyway to keep both bookings.", "[TBD: whether unavailable days also block]"],
    tips: ["Two different people at the same time is fine.", "Conflicts are checked against what's synced to this device. [TBD: whether checked again online]"], related: ["crew-assign", "crew-unavailable"], keywords: ["conflict", "double booked", "overlap", "book anyway"] },
  { feature: "mileage-auto", status: "draft", id: "mileage-invoices-daily", category: "Year packet & reports", question: "How does mileage from invoices and daily entries work?",
    steps: ["Miles on an invoice [TBD: field label] are added to your mileage log automatically.", "Add your own driving for a day in [TBD: owner daily entry label].", "Mileage shows in Reports and the accountant package at [TBD: rate label]."],
    tips: ["[TBD: how a trip entered both on an invoice and as a daily entry is kept from counting twice]", "Mileage syncs to your account."], related: ["mileage", "accountant-package"], keywords: ["mileage", "miles", "trips", "daily"] },
  { feature: "hours-approval", status: "draft", id: "crew-hours-approval", category: "Crew", question: "How do I approve crew hours?",
    steps: ["Open [TBD: where hours to approve are listed].", "Check clocked hours against the job, then tap [TBD: approve label] or fix the time.", "[TBD: whether only approved hours fill pay]"],
    tips: ["Until approval ships, clocked hours fill pay unless you type hours yourself."], related: ["crew-pay-hours", "crew-clock"], keywords: ["approve", "hours", "timesheet"] },
];
