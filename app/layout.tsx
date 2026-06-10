import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GateKeep — AI Access Concierge",
  description: "One sentence in. Routed, tracked, auto-escalating access approvals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 font-mono antialiased">{children}</body>
    </html>
  );
}
