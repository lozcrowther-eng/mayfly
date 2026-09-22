import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mayfly",
  description: "Ephemeral CTF challenge environments on Vercel Sandbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Testim's automation recorder)
          inject their own attributes onto <body> before React hydrates. That's a real,
          unavoidable mismatch between server HTML and the client DOM at first paint —
          nothing in this app's code — and this is Next.js's documented way to tell React
          to keep whatever's actually in the DOM there rather than flag it as an error. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
