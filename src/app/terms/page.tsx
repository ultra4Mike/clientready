export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" className="text-sm font-medium text-slate-600 transition hover:text-teal-600">
            Back home
          </a>
          <div className="font-semibold">Terms</div>
        </div>
      </header>
      <section className="mx-auto my-6 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-8 leading-7 text-slate-700 shadow-sm sm:my-10 sm:px-10 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms of Use</h1>
        <p className="mt-5">
          ClientReady is a document and job-tracking tool for small businesses.
        </p>
        <p className="mt-5">
          You are responsible for the accuracy of your invoices, proposals,
          client details, and taxes. Documents made in the app are not legal
          advice and are not signed contracts unless you and your client agree
          separately.
        </p>
        <p className="mt-5">
          You should keep your own backups. Clearing this browser can remove
          local data.
        </p>
        <p className="mt-5">
          Paid plans, when offered, may limit the number of free documents.
        </p>
      </section>
    </main>
  );
}