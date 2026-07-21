import type { Metadata } from "next";
import "@usapt/design-tokens/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "USAPT Recruiting Platform",
  description: "Centralized recruiting funnel — managers and trainers, multi-brand, multi-market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
