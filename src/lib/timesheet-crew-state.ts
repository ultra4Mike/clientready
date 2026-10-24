/** Why the timesheet has no crew rows: signed out, still loading, cloud read failed, or truly no crew. */
export type CrewLoad = "loading" | "ready" | "signed_out" | "error";
export function timesheetEmptyKind(load: CrewLoad, workerCount: number, filter: "all" | "review"): "none" | "review_clear" | "loading" | "signed_out" | "error" | "no_crew" {
  if (workerCount > 0) return filter === "review" ? "review_clear" : "none";
  if (load === "signed_out") return "signed_out";
  if (load === "loading") return "loading";
  if (load === "error") return "error";
  return "no_crew";
}
