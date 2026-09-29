const documents = [
  {
    title: "Proposals",
    text: "Send a clear quote with scope, timeline, and pricing.",
  },
  {
    title: "Invoices",
    text: "Create numbered invoices and mark them sent or paid.",
  },
  {
    title: "Client emails",
    text: "Build follow-ups, updates, and reminders you can copy and send.",
  },
  {
    title: "Reports",
    text: "Turn finished work into a simple status report.",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="text-lg font-semibold tracking-tight">ClientReady</div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Log in
            </a>
            <a
            href="/signup"
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            Get started
          </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-500">
          For freelancers and one-person businesses
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Professional client documents without starting from a blank page.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-7 text-slate-600">
          Fill in a short form. ClientReady assembles a polished proposal, invoice,
          email, or report you can download and send.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            Start free
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-900"
          >
            See pricing
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">3 free documents. No AI required.</p>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {documents.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Simple pricing</h2>
        <p className="mt-3 max-w-xl text-slate-600">
          Use 3 documents free. Upgrade when you are ready to use it every week.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold">Monthly</h3>
            <p className="mt-4 text-4xl font-semibold">$7.99</p>
            <p className="mt-1 text-sm text-slate-500">per month</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-600">
              <li>Unlimited documents</li>
              <li>Saved clients and logos</li>
              <li>Invoice tracking</li>
              <li>PDF downloads</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white">
            <h3 className="text-lg font-semibold">3 months</h3>
            <p className="mt-4 text-4xl font-semibold">$19.99</p>
            <p className="mt-1 text-sm text-slate-300">save vs monthly</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-200">
              <li>Everything in monthly</li>
              <li>Better rate for regular use</li>
              <li>Cancel anytime at period end</li>
              <li>Same documents and tools</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl justify-between px-6 py-6 text-sm text-slate-500">
          <span>ClientReady</span>
          <span>Professional documents for solo businesses</span>
        </div>
      </footer>
      
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-slate-500">
        <a href="/privacy" className="px-3">Privacy</a>
        <a href="/terms" className="px-3">Terms</a>
      </footer>
    </main>
  );
}