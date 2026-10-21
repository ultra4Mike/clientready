import Link from "next/link";

const code = "mt-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs leading-6 text-slate-100";
const h2 = "mt-6 text-lg font-semibold";

/** Backlog 15: API documentation (public page; the API itself is off until the owner turns it on). */
export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <header className="border-b border-teal-500/20 bg-[var(--cr-panel)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600">Back home</Link>
          <div className="font-semibold">API</div>
        </div>
      </header>
      <section data-testid="api-docs" className="mx-4 my-6 max-w-3xl rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] px-5 py-8 leading-7 sm:mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">ClientReady API</h1>
        <p className="mt-3">Optional. Connect ClientReady to Zapier, Make, or your own scripts. It is <strong>off</strong> until you turn it on in Profile &gt; More settings &gt; Integrations and create a key.</p>
        <h2 className={h2}>Keys and scopes</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>Keys start with <code>cr_</code> and are shown once. Store them like a password; revoke any key in Integrations.</li>
          <li>Scopes: <code>clients:read</code>, <code>clients:write</code>, <code>jobs:read</code>, <code>jobs:write</code>, <code>invoices:read</code>, <code>invoices:write</code>, <code>notes:write</code>.</li>
          <li><strong>Worker keys</strong> (for crew tools) never see prices: they can&apos;t use invoices, and jobs come back without amounts or status.</li>
          <li>Limit: 60 requests a minute per key (HTTP 429 after that). Up to 10 active keys.</li>
        </ul>
        <h2 className={h2}>Requests</h2>
        <pre className={code}>{`curl https://www.clientreadyapp.com/api/v1/clients \\
  -H "Authorization: Bearer cr_your_key"`}</pre>
        <table className="mt-3 w-full text-left text-sm" data-testid="api-endpoints">
          <tbody className="divide-y divide-slate-200">
            <tr><td className="py-1 pr-3 font-mono">GET /api/v1/clients</td><td>List clients (newest 200)</td></tr>
            <tr><td className="py-1 pr-3 font-mono">GET /api/v1/clients/:id</td><td>One client</td></tr>
            <tr><td className="py-1 pr-3 font-mono">POST /api/v1/clients</td><td>Create: name (required), company, email, phone, address, notes</td></tr>
            <tr><td className="py-1 pr-3 font-mono">PATCH /api/v1/clients/:id</td><td>Update any of those fields</td></tr>
            <tr><td className="py-1 pr-3 font-mono">GET /api/v1/jobs[/:id]</td><td>Scheduled jobs: date, time, status, address, visit notes</td></tr>
            <tr><td className="py-1 pr-3 font-mono">PATCH /api/v1/jobs/:id</td><td>status (scheduled, in_progress, done), date (YYYY-MM-DD), start_time (HH:MM)</td></tr>
            <tr><td className="py-1 pr-3 font-mono">POST /api/v1/jobs/:id/notes</td><td>Add a visit note: text, date (optional)</td></tr>
            <tr><td className="py-1 pr-3 font-mono">GET /api/v1/invoices[/:id]</td><td>Invoices with items, payments, status</td></tr>
            <tr><td className="py-1 pr-3 font-mono">POST /api/v1/invoices</td><td>Create a draft: items [{"{"}description, qty, rate{"}"}], client_name, client_email, due_date, tax_percent, notes</td></tr>
            <tr><td className="py-1 pr-3 font-mono">PATCH /api/v1/invoices/:id</td><td>status (draft or sent), due_date, notes. Payments are recorded in the app.</td></tr>
            <tr><td className="py-1 pr-3 font-mono">GET /api/v1/events?since=…</td><td>What changed since a time (polling trigger for Zapier/Make); returns <code>now</code> for the next call</td></tr>
          </tbody>
        </table>
        <h2 className={h2}>Responses</h2>
        <p className="mt-2">JSON <code>{`{"data": …}`}</code> on success; <code>{`{"error": "…"}`}</code> with 400 (bad input), 401 (bad or revoked key), 403 (API off or missing scope), 404, 405, 429 (rate limit).</p>
        <p className="mt-2 text-sm text-[var(--cr-muted)]">Changes made through the API show up in the app the next time it syncs. Customer links never show API-only fields such as visit notes.</p>
      </section>
    </main>
  );
}
