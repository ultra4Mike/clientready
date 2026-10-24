import type { Metadata } from "next";
import { HelpClient } from "./HelpClient";

const title = "Help center | ClientReady";
const description = "How-to guides for ClientReady: invoices, proposals, the calendar, timesheets and payroll, payments, and Reports & Taxes.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/help" },
  openGraph: { type: "website", siteName: "ClientReady", url: "/help", title, description, images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ClientReady" }] },
  twitter: { card: "summary", title, description, images: ["/icons/icon-512.png"] },
};

export default function HelpPage() {
  return <HelpClient />;
}
