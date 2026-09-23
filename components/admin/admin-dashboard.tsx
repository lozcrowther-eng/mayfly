"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CapBanner } from "@/components/admin/cap-banner";
import { InstancesTable, type AdminRow } from "@/components/admin/instances-table";
import { RecentFailures, type FailureRow } from "@/components/admin/recent-failures";
import { StatCard } from "@/components/admin/stat-card";

const POLL_INTERVAL_MS = 3000;

interface AdminSnapshot {
  globalCap: number;
  instancesLive: number;
  totalActiveCpuHours: number;
  estimatedSpendUsd: number;
  capHit: boolean;
  rows: AdminRow[];
  failures: FailureRow[];
}

export function AdminDashboard() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/instances");
    if (!response.ok) return;
    setSnapshot((await response.json()) as AdminSnapshot);
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => void refresh(), 0);
    pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <Link
        href="/"
        className="w-fit font-mono text-[11px] tracking-widest text-zinc-500 uppercase transition-colors hover:text-zinc-300"
      >
        ← Home
      </Link>
      <h1 className="font-mono text-sm tracking-[0.3em] text-zinc-500">LIVE INSTANCES</h1>

      {snapshot?.capHit && <CapBanner instancesLive={snapshot.instancesLive} globalCap={snapshot.globalCap} />}

      <div className="flex flex-wrap gap-4">
        <StatCard
          label="INSTANCES LIVE"
          value={snapshot ? `${snapshot.instancesLive}/${snapshot.globalCap}` : "—"}
          tone={snapshot?.capHit ? "warn" : undefined}
        />
        <StatCard
          label="ACTIVE CPU-HOURS"
          value={snapshot ? snapshot.totalActiveCpuHours.toFixed(3) : "—"}
          detail="accrued, not projected to TTL"
        />
        <StatCard
          label="ESTIMATED SPEND"
          value={snapshot ? `$${snapshot.estimatedSpendUsd.toFixed(4)}` : "—"}
          detail="CPU + memory, this instant"
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4">
        <InstancesTable rows={snapshot?.rows ?? []} loading={snapshot === null} onKilled={refresh} />
      </div>

      <RecentFailures failures={snapshot?.failures ?? []} />
    </div>
  );
}
