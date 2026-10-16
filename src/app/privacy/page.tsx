import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <header className="border-b border-teal-500/20 bg-[var(--cr-panel)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600">
            Back home
          </Link>
          <div className="font-semibold">Privacy</div>
        </div>
      </header>
      <section className="mx-4 my-6 max-w-3xl rounded-2xl sm:mx-auto border border-teal-500/20 bg-[var(--cr-card)] px-5 py-8 leading-7 text-[var(--cr-text)] opacity-95 shadow-sm sm:my-10 sm:px-10 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Privacy Policy</h1>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40! dark:bg-amber-950/60! dark:text-amber-200!">
          Draft — pending owner/legal review. Not final legal text.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">What we store</h2>
        <p className="mt-2">
          ClientReady stores your business profile, clients, proposals, invoices, payments you record,
          job schedules, crew time and expenses, and job photos so you can run your work.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Where it is stored</h2>
        <p className="mt-2">
          Data is saved on your device first so the app works offline. When you are signed in, it is
          also synced to your ClientReady account in the cloud (hosted on Supabase), so you can use it
          on other devices. You can download a backup at any time from the Backup page.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Your clients</h2>
        <p className="mt-2">
          When you share an approval link or client portal, the client can see the documents you shared
          with them, without your internal costs or crew details. Crew members only see the jobs they are
          assigned to.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Payments and email</h2>
        <p className="mt-2">
          Clients pay the business directly through the business&apos;s own payment methods (for example
          Zelle, Venmo, Cash App, PayPal.me, check, bank transfer, or a connected online payment
          provider). ClientReady does not process payments or hold funds, and never receives card or
          bank account numbers: those are entered with the payment provider, whose own terms and
          privacy policy apply. ClientReady keeps the payment details shown on an invoice (such as a
          payment handle or instructions) and the payments recorded on it (amount, date, method and
          reference), including deposits, partial and stage payments, and the discounts, taxes and
          totals on each document. Payments go to the business, not to ClientReady. If email sending is turned on, emails you choose to send go through our email
          provider (Resend), with replies going to your own address.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Account deletion</h2>
        <p className="mt-2">
          <strong>How to delete:</strong> open Settings and tap Delete account (crew: Delete account on
          the Crew page), or go to https://clientreadyapp.com/account/delete on the web without the app. Confirm with your password or
          a link we email you, type DELETE and tap Delete my account. If online deletion is unavailable, the
          page tells you to email support@clientreadyapp.com instead, and we complete it within [Deletion response time].
        </p>
        <p className="mt-2">
          <strong>What is deleted:</strong> your login, business profile, clients, proposals, invoices,
          recorded payments, schedules, crew time and expenses, job photos and payment-method settings.
          Approval links and client portals you shared stop working. Copies saved only on your device stay
          there until you clear the app&apos;s data or uninstall it, so download a backup first if you want one.
        </p>
        <p className="mt-2">
          <strong>Retention:</strong> some data may remain in backups for up to [Data retention period], or
          longer where the law requires. Emails already sent and records held by payment providers you
          connected are kept under those providers&apos; own policies.
        </p>
        <p className="mt-2">
          <strong>Crew:</strong> crew members you added lose access to your jobs, hours and expenses. Their
          own logins are not deleted; a crew member can ask us to delete their own account the same way.
        </p>
        <p className="mt-2">
          <strong>Your clients:</strong> client details are kept on behalf of the business that entered them.
          If a client asks us to delete their information, we refer the request to that business, which can
          remove it from Clients and Documents.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Notifications and this device</h2>
        <p className="mt-2">
          Phone notifications are off unless you turn them on in Settings under Notifications. If you do,
          we store that device&apos;s push subscription (an address from your browser&apos;s push service, its keys
          and the browser type) with your account so we can send it alerts about approvals, payments and crew
          updates. Turn them off on this device, log out, or delete your account and it is removed.
        </p>
        <p className="mt-2">
          To work offline, the app keeps copies of pages you have opened on this device. Approval links,
          client portals, shared invoice views, account deletion and server requests are never cached.
          These copies are cleared when your account is deleted, or when you clear the app&apos;s data.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">Your responsibilities</h2>
        <p className="mt-2">
          We do not sell your client list. You should not upload information you are not allowed to keep
          for your own business records.
        </p>
      </section>
    </main>
  );
}