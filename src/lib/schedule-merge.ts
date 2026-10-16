// Merging two copies of a job's schedule block (device vs cloud) without ever moving the job.
//
// The block has two owners:
// - the owner's plan: date, start/end time, crew, crew note. Stamped by plannedAt (set only when the
//   owner changes one of these).
// - crew progress: status, done/confirm/on-my-way fields. Stamped by updatedAt, which crew actions
//   bump on the server.
// Before, the whole block went to whichever copy had the newer updatedAt, so a crew tap on an older
// cloud copy (e.g. "mark done") carried that copy's old date/time over the owner's newer move.

type Block = Record<string, unknown>;
export const PLAN_KEYS = ["date", "startTime", "endTime", "workerIds", "crewNote"] as const;

const t = (value: unknown) => {
  const n = Date.parse(String(value || ""));
  return Number.isNaN(n) ? 0 : n;
};

export function samePlan(a: Block | undefined, b: Block | undefined) {
  return PLAN_KEYS.every((key) => JSON.stringify(a?.[key] ?? null) === JSON.stringify(b?.[key] ?? null));
}

/**
 * Field-wise merge. `ownerSide` is the copy the owner saved last (doc-level winner); it decides
 * the plan only when neither copy carries plannedAt (older data) and breaks ties.
 */
export function mergeScheduleBlocks(local: Block | undefined, cloud: Block | undefined, ownerSide: "local" | "cloud"): Block | undefined {
  if (!local) return cloud;
  if (!cloud) return local;
  const owner = ownerSide === "local" ? local : cloud;
  const other = ownerSide === "local" ? cloud : local;
  const pl = t(local.plannedAt), pc = t(cloud.plannedAt);
  const plan = pl || pc ? (pl === pc ? owner : pl > pc ? local : cloud) : owner;
  const ul = t(local.updatedAt), uc = t(cloud.updatedAt);
  const progress = ul === uc ? owner : ul > uc ? local : cloud;
  const out: Block = { ...progress };
  for (const key of PLAN_KEYS) {
    if (plan[key] === undefined) delete out[key];
    else out[key] = plan[key];
  }
  if (plan.plannedAt) out.plannedAt = plan.plannedAt;
  else delete out.plannedAt;
  const newest = Math.max(ul, uc);
  out.updatedAt = newest ? (newest === ul ? local.updatedAt : cloud.updatedAt) : progress.updatedAt ?? other.updatedAt ?? "";
  return out;
}
