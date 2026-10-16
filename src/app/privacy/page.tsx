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
          Card payments are processed by Stripe. Card details are entered on Stripe&apos;s checkout page
          and are not stored by ClientReady; we keep the payment amount, date and reference on the
          invoice. If email sending is turned on, emails you choose to send go through our email
          provider (Resend), with replies going to your own address.
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