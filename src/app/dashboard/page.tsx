export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="font-semibold">
            ClientReady
          </a>
          <a href="/" className="text-sm text-slate-600">
            Home
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Account setup is working. Next we add documents and saved clients.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/documents/new?type=proposal"
            className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm hover:border-slate-300"
          >
            New proposal
          </a>
          <a
            href="/documents/new?type=invoice"
            className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm hover:border-slate-300"
          >
            New invoice
          </a>
          <a
            href="/documents/new?type=email"
            className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm hover:border-slate-300"
          >
            New client email
          </a>
          <a
            href="/documents/new?type=report"
            className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm hover:border-slate-300"
          >
            New report
          </a>
        </div>
      </section>
    </main>
  );
}