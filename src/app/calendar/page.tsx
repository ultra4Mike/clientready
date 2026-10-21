"use client";

import { useEffect, useState } from "react";
import CalendarGridView from "@/components/views/CalendarGridView";
import TodayView from "@/components/views/TodayView";
import UpcomingView from "@/components/views/UpcomingView";
import YearView from "@/components/views/YearView";
import ScheduleView from "@/components/views/ScheduleView";
import { calendarView, type CalendarView } from "@/lib/view-routes";

/** Redesign 3: one Calendar with day/week/month/year/list views (old /today, /upcoming, /week, /year, /schedule redirect here). */
export default function CalendarPage() {
  const [view, setView] = useState<CalendarView | "">("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setView(calendarView(window.location.search)), []);
  if (!view) return null;
  if (view === "day") return <TodayView />;
  if (view === "list") return <UpcomingView />;
  if (view === "year") return <YearView />;
  if (view === "schedule") return <ScheduleView />;
  return <CalendarGridView initialView={view} />;
}
