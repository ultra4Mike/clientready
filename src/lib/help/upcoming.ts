/**
 * DRAFT help articles for upcoming / partly shipped features. NOT rendered (not imported by the Help Center).
 * When a feature ships, verify labels in the UI, then move the article into HELP_ARTICLES in ./articles.ts.
 * Status notes: manual payment methods shipped in 81a2084; their articles moved to articles.ts 2026-10-16;
 * per-owner card payments (Stripe Connect / other processors), in-app refunds, in-app SMS is not built yet (automatic emails shipped as Automations, 9fe49fd); their UI labels are marked [TBD].
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
    tips: ["The fee is 3% of the total when you tap. If you change items, discount or tax afterwards, remove the line and add it again.", "Card surcharge rules depend on your state and the card networks. Check them before using this. ClientReady doesn't check them for you.", "When live, the job profit shows Card fees (est., after $[amount] collected).", "Hidden 2026-10-20 (CARD_FEE_PASS_THROUGH=false, eea0b79): owner chose to hide the card fee line until Terms §6 [Card fees / surcharges] is settled (R38). Labels verified against 697f6e2."], related: ["card-payments", "line-items", "job-profit-breakdown"], keywords: ["surcharge", "convenience fee", "card fee", "processing fee", "3%"] },
  { feature: "refunds", status: "draft", id: "refund-in-app", category: "Payments", question: "Can I issue a refund from ClientReady?",
    steps: ["Not built. [TBD: whether in-app refunds are planned].", "Today, refund in your provider's dashboard or send the money back yourself, then use Remove payment on the invoice."],
    related: ["ts-refund"], keywords: ["refund"] },
  { feature: "sms", status: "draft",
    id: "sms-texting", category: "Email & sharing", question: "Can I text clients from ClientReady?",
    summary: "Planned: send texts (links, reminders, On my way) from ClientReady itself.",
    steps: ["Clients must agree to receive texts; their phone must be on their client card.", "From an invoice, proposal or job, choose [TBD: in-app text action label] and review the message.", "Tap [TBD: send label]. Replies come back to [SMS reply destination]."],
    tips: ["Today, texts open in your own Messages app and are sent from your phone number.", "Clients can reply STOP to opt out."],
    related: ["automations"], keywords: ["sms", "text", "message", "phone"] },
  { feature: "reimbursements", status: "draft", id: "crew-reimbursements", category: "Crew", question: "How do I pay crew back for what they spent?",
    steps: ["[TBD: where reimbursements live, e.g. a Reimbursements page].", "[TBD: how crew costs are marked owed, approved and paid back].", "[TBD: labels and how it affects job costs and Reports]."],
    tips: ["Draft only: Dev's reimbursements feature is in progress and not committed; labels not verified."], related: ["crew-costs-review", "crew-expenses"], keywords: ["reimburse", "pay back", "crew expenses", "owed to crew"] },
  { feature: "api-keys", status: "shipped-verify-labels", id: "api-keys", category: "Account", question: "How do I connect ClientReady to Zapier, Make or my own tools (API keys)?",
    summary: "Optional and off by default: turn on the API and create a key with only the permissions a tool needs.",
    steps: ["Open Settings and find Integrations (optional).", "Turn on the API (for Zapier, Make or your own tools). You see 'API on. Create a key below.'", "Enter a Key name (e.g. Zapier) and tick only what it needs: Read clients, Add/edit clients, Read jobs, Update job status/date, Read invoices, Create draft invoices, Add visit notes.", "Tap Create key. Copy it right away: 'Copy this key now. It won't be shown again.'", "Paste it into the other tool. Docs for developers are at /developers.", "To stop a key, tap Revoke ('Key revoked.'). Turning the API off stops every key until you turn it back on."],
    tips: ["Keys are stored scrambled (hashed); ClientReady can't show a key again. Lost it? Revoke it and make a new one.", "A key only sees your account's data. Each key is limited to 60 requests a minute; up to 10 active keys.", "A worker key [TBD label: (worker)] never sees prices or invoices.", "Invoices made through the API start as drafts. Payments and amounts are only changed in the app.", "Needs migration 20261022090000_api_keys; before it's run Settings shows 'Integrations need an account update (migration 20261022090000).'", "HOLD: do not publish until R71/R72 are fixed (Dev d2e5e44)."],
    related: ["automations"], keywords: ["api", "api key", "zapier", "make", "integration", "webhook", "developer"] },
  { feature: "proposal-only-approval", status: "draft", id: "approval-proposals-only", category: "Proposals", question: "Which documents need the client's approval?",
    summary: "Planned (not shipped): only proposals need approval. Plain invoices can be paid right away.",
    steps: ["The client approves a proposal from the link. [TBD: exact labels].", "Approving turns it into an invoice; the deposit is carried over once.", "A plain invoice shows the pay options straight away, with no Approve step."],
    tips: ["HOLD: Dev is building this with the INV-1010 fixes. Verify labels before publishing."], related: ["proposal", "deposit-proposal"], keywords: ["approve", "approval", "proposal", "deposit"] },
  { feature: "calendar-filters", status: "draft", id: "calendar-show-filters", category: "Calendar & jobs", question: "Can I hide proposals and drafts that aren't approved on the Calendar?",
    summary: "Planned (R127, not shipped): choose what the Calendar shows so unapproved work doesn't look like a booked slot.",
    steps: ["Open Calendar and tap [TBD: Show button label].", "Turn approved jobs, unapproved drafts and proposals, and invoices on or off. Your choice is remembered.", "Unapproved items show faded with a dashed outline.", "Booking an approved job over an unapproved one warns you [TBD: labels] and offers to move it."],
    tips: ["HOLD: R127 in progress in cr-dev. Verify labels before publishing."], related: ["calendar-views", "schedule-conflicts"], keywords: ["filter", "hide drafts", "unapproved", "proposals on calendar", "show"] },
];
