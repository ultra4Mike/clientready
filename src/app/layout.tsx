import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClientReady",
  description:
    "Create professional proposals, invoices, client emails, and reports in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}