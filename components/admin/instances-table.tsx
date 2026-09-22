"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatePill } from "@/components/state-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InstanceState } from "@/lib/types";

export interface AdminRow {
  runId: string;
  challengeId: string | null;
  teamId: string | null;
  state: InstanceState;
  url: string | null;
  vcpus: number;
  elapsedMs: number;
  ttlRemainingMs: number | null;
  cost: { totalUsd: number };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function InstancesTable({
  rows,
  loading,
  onKilled,
}: {
  rows: AdminRow[];
  loading: boolean;
  onKilled: () => void;
}) {
  const [killing, setKilling] = useState<string | null>(null);

  async function handleKill(runId: string) {
    setKilling(runId);
    try {
      await fetch(`/api/admin/instances/${runId}/kill`, { method: "POST" });
      onKilled();
    } finally {
      setKilling(null);
    }
  }

  // An empty rows array means two different things: the first poll hasn't resolved yet
  // (loading — common in dev, where Turbopack lazily compiles this route on its first hit
  // and can take a couple of seconds) versus a poll that resolved and genuinely found
  // nothing running. They must render differently, or "still loading" looks identical to
  // "confirmed empty" and the only way to tell them apart is to guess and refresh the page.
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-sm text-zinc-500">
        {loading ? "Loading…" : "No live instances."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-zinc-500">Team</TableHead>
          <TableHead className="text-zinc-500">Challenge</TableHead>
          <TableHead className="text-zinc-500">State</TableHead>
          <TableHead className="text-zinc-500">Elapsed</TableHead>
          <TableHead className="text-zinc-500">TTL remaining</TableHead>
          <TableHead className="text-zinc-500">Cost</TableHead>
          <TableHead className="text-right text-zinc-500">Kill</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.runId} className="border-zinc-800">
            <TableCell className="font-mono text-zinc-200">{row.teamId ?? "—"}</TableCell>
            <TableCell className="font-mono text-zinc-200">{row.challengeId ?? "—"}</TableCell>
            <TableCell>
              <StatePill state={row.state} />
            </TableCell>
            <TableCell className="font-mono tabular-nums text-zinc-300">{formatDuration(row.elapsedMs)}</TableCell>
            <TableCell className="font-mono tabular-nums text-zinc-300">
              {row.ttlRemainingMs === null ? "—" : formatDuration(row.ttlRemainingMs)}
            </TableCell>
            <TableCell className="font-mono tabular-nums text-zinc-300">${row.cost.totalUsd.toFixed(4)}</TableCell>
            <TableCell className="text-right">
              <Button
                variant="destructive"
                size="sm"
                disabled={killing !== null}
                onClick={() => handleKill(row.runId)}
              >
                {killing === row.runId ? "Killing…" : "Kill"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
