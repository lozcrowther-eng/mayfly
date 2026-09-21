"use client";

import { useEffect, useState } from "react";

function format(msRemaining: number): string {
  if (msRemaining <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Counts down to targetMs. Ticks client-side only — the server's own state (via polling) is what actually governs the pill. */
export function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // No eager setNow() call here — the first tick fills in within 1s, and starting from
    // the same null-on-both-server-and-client render avoids a hydration mismatch anyway.
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (now === null) return <span className="font-mono text-3xl tabular-nums text-zinc-500">--:--:--</span>;

  const remaining = targetMs - now;
  return (
    <span className={remaining <= 0 ? "font-mono text-3xl tabular-nums text-amber-400" : "font-mono text-3xl tabular-nums text-zinc-100"}>
      {format(remaining)}
    </span>
  );
}
