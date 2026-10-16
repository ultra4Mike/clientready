export const metadata = { title: "Offline · ClientReady" };

/** Shown by the service worker when a page that was never opened on this device is requested offline. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-6 text-center text-[var(--cr-text)]" data-testid="offline">
      <div className="max-w-sm space-y-3">
        <p className="text-4xl" aria-hidden="true">📶</p>
        <h1 className="text-xl font-bold">You&apos;re offline</h1>
        <p className="text-sm text-[var(--cr-muted)]">This page hasn&apos;t been opened on this device yet. Pages you&apos;ve used before (Today, Documents, Clients) still work offline with what&apos;s saved here, and changes sync when you&apos;re back online.</p>
        <a href="/today" className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950">Go to Today</a>
      </div>
    </main>
  );
}
