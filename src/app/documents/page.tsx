"use client";

import { useEffect, useState } from "react";
import DocumentsListView from "@/components/views/DocumentsListView";
import CrewDraftsView from "@/components/views/CrewDraftsView";
import HistoryView from "@/components/views/HistoryView";
import { documentsView, type DocumentsView } from "@/lib/view-routes";

/** Redesign 3: Documents with All / Drafts / Crew drafts / History (old /drafts and /history redirect here). */
export default function DocumentsPage() {
  const [view, setView] = useState<DocumentsView | "">("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setView(documentsView(window.location.search)), []);
  if (!view) return null;
  if (view === "crew-drafts") return <CrewDraftsView />;
  if (view === "history") return <HistoryView />;
  return <DocumentsListView initialView={view === "drafts" ? "drafts" : "all"} />;
}
