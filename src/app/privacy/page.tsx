import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-medium text-slate-600 transition hover:text-teal-600">
            Back home
          </Link>
          <div className="font-semibold">Privacy</div>
        </div>
      </header>
      <section className="mx-auto my-6 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-8 leading-7 text-slate-700 shadow-sm sm:my-10 sm:px-10 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-5">
          ClientReady stores your business profile, clients, documents, and
          appointments so you can run your work.
        </p>
        <p className="mt-5">
          On this first version, that data is saved in your browser unless you
          download a backup or later connect a hosted account.
        </p>
        <p className="mt-5">
          We do not sell your client list. You should not upload information you
          are not allowed to keep for your own business records.
        </p>
        <p className="mt-5">
          This page will be updated before paid accounts and cloud storage go
          live.
        </p>
      </section>
    </main>
  );
}