export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-slate-600">
            Back home
          </a>
          <div className="font-semibold">Terms</div>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-10 leading-7 text-slate-700">
        <h1 className="text-2xl font-semibold text-slate-900">Terms of Use</h1>
        <p className="mt-4">
          ClientReady is a document and job-tracking tool for small businesses.
        </p>
        <p className="mt-4">
          You are responsible for the accuracy of your invoices, proposals,
          client details, and taxes. Documents made in the app are not legal
          advice and are not signed contracts unless you and your client agree
          separately.
        </p>
        <p className="mt-4">
          You should keep your own backups. Clearing this browser can remove
          local data.
        </p>
        <p className="mt-4">
          Paid plans, when offered, may limit the number of free documents.
        </p>
      </section>
    </main>
  );
}