export const metadata = { title: "Offline · ClientReady" };

/** Shown by the service worker when a page that was never opened on this device is requested offline. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-6 text-center text-[var(--cr-text)]" data-testid="offline">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-teal-500/20 bg-[var(--cr-card)] p-8 shadow-xl">
        <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10 text-3xl ring-1 ring-teal-500/25" aria-hidden="true">📶</p>
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re offline</h1>
        <p className="text-sm text-[var(--cr-muted)]">This page hasn&apos;t been opened on this device yet. Pages you&apos;ve used before (Today, Documents, Clients) still work offline with what&apos;s saved here, and changes sync when you&apos;re back online.</p>
        <a href="/today" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-500 px-5 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Go to Today</a>
      </div>
    </main>
  );
}
