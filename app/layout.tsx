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

// suppressHydrationWarning appears on BOTH <html> and <body> — not just <body> — because a
// browser extension (e.g. Testim's automation recorder) can inject or rewrite attributes
// anywhere in that opening chain before React hydrates. That's a real, unavoidable mismatch
// between server HTML and the client DOM at first paint, nothing in this app's code, and
// each root element needs its own flag: the prop doesn't cascade to a parent's mismatch.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
