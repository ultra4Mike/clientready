/**
 * Generic ordered offline queue (persisted in the device DB "queue" store).
 * - FIFO per record (`recordKey`): a record's next job never runs before its earlier one succeeds.
 * - Idempotency: each job has an `idempotencyKey`; enqueueing the same key again replaces the pending job
 *   in place (coalesces repeated saves) instead of adding a duplicate. Send it to the server too.
 * - Retry with exponential backoff (1s, 2s, 4s ... max 5 min) on "retry"; "conflict" parks the job and calls onConflict.
 * - `baseVersion` travels with the job for server-side optimistic versioning.
 * Used by src/lib/drafts.ts. Dev: to adopt for document saves later, call createQueue("docs", handler) once and
 * enqueue({ recordKey: doc.id, idempotencyKey: `${doc.id}:${doc.version}`, payload: doc, baseVersion }).
 */
import { idbDel, idbEntries, idbSet } from "./device-store";

export type QueueJob<P = unknown> = {
  id: string;
  queue: string;
  recordKey: string;
  idempotencyKey: string;
  payload: P;
  baseVersion?: number;
  seq: number;
  attempts: number;
  nextAttemptAt: number;
  state: "pending" | "conflict";
  createdAt: number;
};
export type HandlerResult = { status: "ok" } | { status: "retry"; error?: unknown } | { status: "conflict"; server?: unknown; version?: number };
export type QueueHandler<P> = (job: QueueJob<P>) => Promise<HandlerResult>;

export const backoffMs = (attempts: number) => Math.min(1000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);

export function createQueue<P>(name: string, handler: QueueHandler<P>, opts: { now?: () => number; onConflict?: (job: QueueJob<P>, result: HandlerResult) => void } = {}) {
  const now = opts.now ?? Date.now;
  let seq = 0;
  let flushing: Promise<{ sent: number; left: number }> | null = null;
  const storeKey = (job: { idempotencyKey: string }) => `${name}:${job.idempotencyKey}`;

  async function jobs(): Promise<QueueJob<P>[]> {
    const all = (await idbEntries<QueueJob<P>>("queue")).map(([, j]) => j).filter((j) => j.queue === name);
    return all.sort((a, b) => a.seq - b.seq);
  }

  async function enqueue(input: { recordKey: string; idempotencyKey: string; payload: P; baseVersion?: number }) {
    const all = await jobs();
    const existing = all.find((j) => j.idempotencyKey === input.idempotencyKey);
    seq = Math.max(seq, now(), ...all.map((j) => j.seq + 1));
    const job: QueueJob<P> = existing
      ? { ...existing, payload: input.payload, baseVersion: input.baseVersion ?? existing.baseVersion, state: "pending" }
      : { id: `${name}-${seq}`, queue: name, ...input, seq: seq++, attempts: 0, nextAttemptAt: 0, state: "pending", createdAt: now() };
    await idbSet("queue", storeKey(job), job);
    return job;
  }

  async function remove(idempotencyKey: string) {
    await idbDel("queue", `${name}:${idempotencyKey}`);
  }

  async function runOnce() {
    const all = await jobs();
    const blocked = new Set<string>();
    let sent = 0;
    for (const job of all) {
      if (blocked.has(job.recordKey)) continue;
      if (job.state === "conflict" || job.nextAttemptAt > now()) { blocked.add(job.recordKey); continue; }
      let result: HandlerResult;
      try {
        result = await handler(job);
      } catch (error) {
        result = { status: "retry", error };
      }
      if (result.status === "ok") { await idbDel("queue", storeKey(job)); sent++; continue; }
      blocked.add(job.recordKey);
      if (result.status === "conflict") {
        await idbSet("queue", storeKey(job), { ...job, state: "conflict" });
        opts.onConflict?.(job, result);
      } else {
        const attempts = job.attempts + 1;
        await idbSet("queue", storeKey(job), { ...job, attempts, nextAttemptAt: now() + backoffMs(attempts) });
      }
    }
    return { sent, left: (await jobs()).length };
  }

  /** Sends what it can, in order. Concurrent calls share one run. */
  function flush() {
    if (!flushing) flushing = runOnce().finally(() => { flushing = null; });
    return flushing;
  }

  return { enqueue, flush, jobs, remove };
}
