/**
 * Help Center content. Add a new entry to HELP_ARTICLES (unique id, an existing or new category,
 * a question, short answer steps, optional keywords) — the /help page picks it up automatically.
 */
export const SUPPORT_EMAIL = "support@clientready.app"; // TODO: confirm the real support inbox.

export type HelpCategory =
  | "Getting started" | "Invoices" | "Proposals" | "Clients" | "Payments" | "Client portal"
  | "Crew" | "Calendar" | "Year packet & reports" | "Offline & sync" | "Account" | "Troubleshooting";

export type HelpArticle = { id: string; category: HelpCategory; question: string; steps: string[]; keywords?: string[] };

export const HELP_ARTICLES: HelpArticle[] = [
  { id: "first-invoice", category: "Invoices", question: "How do I create and send an invoice?", keywords: ["bill", "new"],
    steps: ["Tap + (or New invoice) to open the invoice editor.", "Pick or type the client, then add line items.", "Save — the invoice appears under Documents.", "Use Email or Share approval link to send it to your client."] },
  { id: "proposal", category: "Proposals", question: "How do I send a proposal and get it approved?", keywords: ["quote", "estimate", "approve", "signature"],
    steps: ["Create a New proposal and add your line items.", "Save, then choose Share approval link.", "Your client opens the link (no login needed) and taps Approve.", "The proposal shows as approved on your side once it syncs."] },
  { id: "change-orders", category: "Proposals", question: "How do I record a change order?", keywords: ["extra work", "change"],
    steps: ["Open the job's invoice or proposal.", "Add a change order note describing the extra work and amount.", "Save; the note stays linked to the document."] },
  { id: "clients", category: "Clients", question: "How do I add or update a client?", keywords: ["customer", "contact"],
    steps: ["Go to Clients and tap Add client.", "Enter name, company, email, phone and address.", "Contact details saved on an invoice also update the matching client (blank fields never erase data)."] },
  { id: "client-history", category: "Clients", question: "Where can I see everything for one client?", keywords: ["timeline", "history"],
    steps: ["Open Clients and tap the client, or go to History.", "The timeline lists their proposals, invoices, payments and jobs."] },
  { id: "card-payments", category: "Payments", question: "How do clients pay by card?", keywords: ["stripe", "pay online", "credit card"],
    steps: ["Connect Stripe in Settings (card payment must be set up).", "Share an invoice approval link or the client portal.", "The client taps Pay and completes Stripe Checkout.", "The payment is recorded on the invoice automatically, labelled Card (Stripe)."] },
  { id: "progress-billing", category: "Payments", question: "Can clients pay in stages instead of the full amount?", keywords: ["deposit", "stage", "partial"],
    steps: ["Set up payment stages on the invoice.", "The pay link charges the current stage's amount by default.", "Clients can choose to pay the full remaining balance instead."] },
  { id: "manual-payment", category: "Payments", question: "How do I record cash or check payments?", keywords: ["cash", "check", "receipt"],
    steps: ["Open the invoice and add a payment with amount, method and date.", "Use Cash receipt to print a receipt for the client.", "Collect shows what is still owed."] },
  { id: "portal", category: "Client portal", question: "What is the client portal?", keywords: ["share", "link"],
    steps: ["Open a client and choose Share portal.", "Send them the link — they can view their documents, approve and pay without an account.", "You can turn the link off any time from the same place."] },
  { id: "crew-add", category: "Crew", question: "How do I add crew members?", keywords: ["employee", "team", "worker"],
    steps: ["Go to Employees and add the person with their email.", "They sign up/log in with that email and only see their crew view.", "Crew can't see your prices, costs or other clients."] },
  { id: "crew-clock", category: "Crew", question: "How does crew clock in/out and expenses work?", keywords: ["time", "hours", "timesheet"],
    steps: ["Crew open their job and tap Clock in, then Clock out when done.", "They can add expenses and job photos.", "You review hours, spend and Crew drafts from your account."] },
  { id: "schedule", category: "Calendar", question: "How do I schedule a job?", keywords: ["appointment", "booking", "recurring"],
    steps: ["Tap Schedule (or open Calendar).", "Pick the client, date and time; set it to repeat if it's recurring.", "Jobs appear on Calendar, Today and This week."] },
  { id: "reminders", category: "Calendar", question: "Can I send an 'on my way' or reminder message?", keywords: ["on my way", "remind"],
    steps: ["Open the job on Today or Calendar.", "Use the reminder / on my way option to write the message.", "Review it, then send by email or your phone's email app."] },
  { id: "year-packet", category: "Year packet & reports", question: "How do I get my year-end sales and expense packet?", keywords: ["tax", "accountant", "pdf"],
    steps: ["Go to Year packet.", "Filter to the year you need.", "Tap Print / Save PDF to share with your accountant."] },
  { id: "reports", category: "Year packet & reports", question: "Where are my business reports?", keywords: ["profit", "sales"],
    steps: ["Open Reports from the Money section.", "Pick a report to see sales, payments and costs."] },
  { id: "offline", category: "Offline & sync", question: "Does ClientReady work without internet?", keywords: ["offline", "no signal"],
    steps: ["Yes — documents are always saved on your device first.", "The sync pill at the top shows whether changes are uploaded.", "When you're back online, changes sync to your account automatically.", "Payments and approvals made online are never overwritten by an older offline copy."] },
  { id: "backup", category: "Offline & sync", question: "How do I back up or restore my data?", keywords: ["export", "download", "restore"],
    steps: ["Go to Backup.", "Tap download to save a backup file.", "To restore, choose the backup file on the same page."] },
  { id: "email-send", category: "Getting started", question: "How do I email a document to a client?", keywords: ["send", "email"],
    steps: ["Save the document to your account first.", "Tap Email, review the message, and press Send.", "If sending isn't set up, use Open in email app instead."] },
  { id: "trial", category: "Account", question: "How long is the free trial?", keywords: ["plan", "billing", "subscription"],
    steps: ["New accounts get a 14-day trial.", "Days left are shown in the app.", "Check Settings for your plan."] },
  { id: "password", category: "Account", question: "I forgot my password.", keywords: ["login", "reset", "sign in"],
    steps: ["On the login screen tap Forgot password.", "Open the reset email and choose a new password."] },
  { id: "ts-sync", category: "Troubleshooting", question: "My changes aren't showing on another device.", keywords: ["sync", "missing"],
    steps: ["Check the sync pill on the first device — it must show synced.", "Make sure you're signed in to the same account on both.", "Reload the page on the second device.", "If the pill shows an error, stay online and save the document again."] },
  { id: "ts-link", category: "Troubleshooting", question: "My client sees 'Could not load this document'.", keywords: ["approval link", "broken link"],
    steps: ["Confirm the document is saved to your account (synced).", "Share a fresh approval or portal link.", "If it still fails, contact support — the link feature may need setup."] },
  { id: "ts-payment", category: "Troubleshooting", question: "A client paid but the invoice doesn't show it.", keywords: ["stripe", "missing payment"],
    steps: ["Wait a minute and reload — Stripe confirms payments in the background.", "Check your Stripe dashboard for the payment.", "If it's there but not in ClientReady, email support with the invoice number."] },
  { id: "ts-pay-button", category: "Troubleshooting", question: "The Pay button says card payment is not set up.", keywords: ["stripe", "pay"],
    steps: ["Open Settings and finish Stripe setup.", "Make sure the invoice has a balance owed (at least $0.50).", "Share the link again."] },
  { id: "ts-email", category: "Troubleshooting", question: "My email didn't send.", keywords: ["email error"],
    steps: ["Save the document to your account first.", "Use exactly one valid recipient address.", "Sign in again if asked, then press Send.", "Or use Open in email app as a fallback."] },
];
