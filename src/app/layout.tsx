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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('clientready-theme')||'dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.classList.toggle('light',t==='light');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)] antialiased">
        {children}
      </body>
    </html>
  );
}