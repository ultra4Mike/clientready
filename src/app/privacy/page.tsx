export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-slate-600">
            Back home
          </a>
          <div className="font-semibold">Privacy</div>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-10 leading-7 text-slate-700">
        <h1 className="text-2xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="mt-4">
          ClientReady stores your business profile, clients, documents, and
          appointments so you can run your work.
        </p>
        <p className="mt-4">
          On this first version, that data is saved in your browser unless you
          download a backup or later connect a hosted account.
        </p>
        <p className="mt-4">
          We do not sell your client list. You should not upload information you
          are not allowed to keep for your own business records.
        </p>
        <p className="mt-4">
          This page will be updated before paid accounts and cloud storage go
          live.
        </p>
      </section>
    </main>
  );
}