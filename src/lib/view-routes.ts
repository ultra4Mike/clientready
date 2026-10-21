/** Redesign 3: one Calendar (day/week/month/year/list) and one Documents (all/drafts/crew drafts/history). Old routes redirect here. */
export const CALENDAR_VIEWS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["list", "List"], ["worker", "By worker"]] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number][0] | "schedule";
export const GRID_VIEWS = ["week", "month", "worker"];
export const DOCUMENT_VIEWS = [["all", "All"], ["drafts", "Drafts"], ["crew-drafts", "Crew drafts"], ["history", "History"]] as const;
export type DocumentsView = (typeof DOCUMENT_VIEWS)[number][0];

export const OLD_ROUTE_REDIRECTS = [
  { source: "/today", destination: "/calendar?view=day" },
  { source: "/week", destination: "/calendar?view=week" },
  { source: "/upcoming", destination: "/calendar?view=list" },
  { source: "/year", destination: "/calendar?view=year" },
  { source: "/schedule", destination: "/calendar?view=schedule" },
  { source: "/drafts", destination: "/documents?view=crew-drafts" },
  { source: "/history", destination: "/documents?view=history" },
];

export function calendarView(search: string): CalendarView {
  const v = new URLSearchParams(search).get("view") || "";
  return (CALENDAR_VIEWS.some(([key]) => key === v) || v === "schedule" ? v : "week") as CalendarView;
}
export function documentsView(search: string): DocumentsView {
  const params = new URLSearchParams(search);
  const v = params.get("view") || (params.get("filter") === "drafts" ? "drafts" : "");
  return (DOCUMENT_VIEWS.some(([key]) => key === v) ? v : "all") as DocumentsView;
}
