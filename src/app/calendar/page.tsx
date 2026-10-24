"use client";

import { useEffect, useState } from "react";
import CalendarGridView from "@/components/views/CalendarGridView";
import TodayView from "@/components/views/TodayView";
import UpcomingView from "@/components/views/UpcomingView";
import ScheduleView from "@/components/views/ScheduleView";
import { calendarView, type CalendarView } from "@/lib/view-routes";

/** Redesign 3: one Calendar with day/week/month/list views (old /today, /upcoming, /week, /schedule redirect here; /year goes to /reports?tab=taxes). */
export default function CalendarPage() {
  const [view, setView] = useState<CalendarView | "">("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The year packet lives on Reports & Taxes now (server redirect too; this covers cached/offline loads).
    if (params.get("view") === "year") { window.location.replace(`/reports?tab=taxes${params.get("year") ? `&year=${params.get("year")}` : ""}`); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    setView(calendarView(window.location.search));
  }, []);
  if (!view) return null;
  if (view === "day") return <TodayView />;
  if (view === "list") return <UpcomingView />;
  if (view === "schedule") return <ScheduleView />;
  return <CalendarGridView initialView={view} />;
}
