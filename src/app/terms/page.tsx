import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/help/articles";

// DRAFT — pending owner/legal review. Bracketed items like [Company legal name] are placeholders the owner must fill.
const SECTIONS: { title: string; body: string[] }[] = [
  { title: "1. Who we are", body: [
    "ClientReady is provided by [Company legal name] (\"we\", \"us\"). By creating an account or using ClientReady you agree to these Terms. If you use it for a business, you agree on behalf of that business.",
  ] },
  { title: "2. Your account and the free trial", body: [
    "You need an account to use ClientReady. Keep your login details private; you are responsible for activity on your account.",
    "New accounts get a 14-day free trial. After the trial, continued use may require a paid plan at the price shown at the time ([Pricing and billing terms]).",
  ] },
  { title: "3. Your data and your clients", body: [
    "You own the business information, client details, documents and photos you put into ClientReady. You are responsible for having the right to store your clients' information and for the accuracy of your invoices, proposals, prices and taxes.",
    "Messages to your clients are yours. Emails are sent through our email provider (Resend) only when you review a message and press Send. Texts, reminders, \"On my way\" and review requests open in your own messaging or email app and are sent by you. You are responsible for following the laws that apply to messages you send.",
  ] },
  { title: "4. Crew accounts", body: [
    "You can add crew members by email. Crew sign in with their own account and only see the jobs they are assigned to, their own hours and expenses, and the details needed to do the work — not your prices, costs or other clients. You are responsible for who you add and for removing access when someone leaves.",
  ] },
  { title: "5. Approval links, the client portal and e-signatures", body: [
    "Approval links and the client portal let anyone who has the link view the documents you shared, approve them and, for invoices, pay. Share links only with the intended client and turn them off when no longer needed.",
    "A client's approval or drawn signature is recorded with their typed name and the date. Whether it forms a binding agreement depends on your arrangement with your client and the law where you work; ClientReady does not guarantee that it does.",
  ] },
  { title: "6. Getting paid", body: [
    "Your clients pay you directly, through your own accounts and payment methods — for example Zelle, Venmo, Cash App, PayPal.me, check, bank transfer/ACH instructions, or an online card checkout from a payment provider you connect. ClientReady is not a payment processor, bank or money transmitter, never holds or moves your funds, and does not process payments itself.",
    "Each payment provider's own terms, fees, payout timing and holds apply. You are responsible for your accounts with those providers and for the payment details you show your clients.",
    "For manual methods (such as Zelle, Venmo, Cash App, PayPal.me, check or bank transfer), ClientReady never marks an invoice paid automatically — you record the payment yourself. A payment confirmed by a connected online provider may be recorded on the invoice for you.",
    "Refunds, chargebacks and disputes are handled with the payment provider, or between you and your client. ClientReady cannot refund, reverse or release money.",
  ] },
  { title: "7. Offline use, sync and backups", body: [
    "ClientReady saves your work on your device first and syncs it to your account when you are online and signed in. Changes made on a device that never syncs, or lost when browser data is cleared before syncing, cannot be recovered by us.",
    "Deleted documents cannot be undeleted in the app. Download a backup from the Backup page regularly.",
  ] },
  { title: "8. Acceptable use", body: [
    "Don't use ClientReady to break the law, send spam or harassment, store information you have no right to keep, try to access other accounts or data, interfere with the service, or resell it without our permission.",
  ] },
  { title: "9. Not tax, legal or accounting advice", body: [
    "Reports, the Year packet, the tax set-aside cushion, late-fee suggestions and similar features are informational only. They are not tax, legal or accounting advice and are not a tax return. Check with a qualified professional.",
  ] },
  { title: "10. Availability and no warranty", body: [
    "We work to keep ClientReady available and accurate, but it is provided \"as is\" and \"as available\", without warranties of any kind to the extent the law allows. Features may change, and the service may sometimes be unavailable.",
  ] },
  { title: "11. Limitation of liability", body: [
    "To the extent the law allows, [Company legal name] is not liable for indirect, incidental or consequential losses, lost profits or lost data, and our total liability for any claim is limited to the amount you paid us in the [12] months before the claim ([Liability cap to confirm]).",
  ] },
  { title: "12. Ending your account and exporting data", body: [
    "You can stop using ClientReady at any time. Before you close your account, download your data from the Backup page. We may suspend or end accounts that break these Terms. After an account is closed, we may delete its data after [Data retention period].",
  ] },
  { title: "12a. Account deletion", body: [
    "You can delete your account at any time: in Settings tap Delete account (crew: Delete account on the Crew page), or visit https://clientreadyapp.com/account/delete on the web. You confirm with your password or an emailed link and by typing DELETE. If online deletion is unavailable, the page asks you to email support@clientreadyapp.com and we complete it within [Deletion response time].",
    "Deleting an owner account deletes your login, business profile, clients, proposals, invoices, recorded payments, schedules, crew time, expenses, job photos and payment-method settings, and turns off every approval link and client portal you shared. Crew members you added lose access to your jobs; their own logins are not deleted. Data saved only on your device stays there until you clear it or uninstall the app.",
    "Some records may be kept for up to [Data retention period] in backups, or longer where the law requires (for example tax or fraud-prevention records). Payment providers you connected keep their own records under their own terms; deleting ClientReady does not close those accounts.",
    "Your clients' information belongs to your business records. If one of your clients asks us to delete their information, we will refer them to you, and you can remove it from Clients and Documents.",
  ] },
  { title: "13. Changes to these Terms", body: [
    "We may update these Terms. We'll change the date below and, for important changes, tell you in the app or by email. Using ClientReady after a change means you accept the updated Terms.",
  ] },
  { title: "14. Governing law", body: [
    "These Terms are governed by the laws of [State], [Country], and disputes will be handled in the courts of [County/City, State], unless the law where you live requires otherwise.",
  ] },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <header className="border-b border-teal-500/20 bg-[var(--cr-panel)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600">
            Back home
          </Link>
          <div className="font-semibold">Terms</div>
        </div>
      </header>
      <section className="mx-4 my-6 max-w-3xl rounded-2xl sm:mx-auto border border-teal-500/20 bg-[var(--cr-card)] px-5 py-8 leading-7 text-[var(--cr-text)] opacity-95 shadow-sm sm:my-10 sm:px-10 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Terms of Use</h1>
        <p data-testid="terms-draft" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40! dark:bg-amber-950/60! dark:text-amber-200!">
          Draft — pending owner/legal review. Not final legal text.
        </p>
        <p className="mt-2 text-sm text-[var(--cr-muted)]">Last updated: 2026-10-16</p>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mt-6 text-lg font-semibold">{section.title}</h2>
            {section.body.map((text, index) => <p key={index} className="mt-2">{text}</p>)}
          </div>
        ))}
        <h2 className="mt-6 text-lg font-semibold">15. Contact</h2>
        <p className="mt-2">
          Questions about these Terms: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-teal-600 underline-offset-2 hover:underline">{SUPPORT_EMAIL}</a> or [Company mailing address].
        </p>
        <p className="mt-6 text-sm text-[var(--cr-muted)]">
          See also our <Link href="/privacy" className="underline-offset-2 hover:text-teal-600 hover:underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
