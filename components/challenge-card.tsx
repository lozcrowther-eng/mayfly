"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/countdown";
import { StatePill } from "@/components/state-pill";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { EXTEND_SECONDS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Challenge } from "@/lib/fixtures/challenges";
import type { InstanceState } from "@/lib/types";

// 30 min, not the CLI's 1h default — RealSandboxClient adds a 300s grace buffer on top of
// this (lib/sandbox/real-client.ts's GRACE_SECONDS), and Vercel Hobby plans cap sandbox
// sessions at 45 min total, so a 1h player launch would 400 on create() before ever
// reaching the sandbox.
const DEFAULT_TTL_SECONDS = 1800;
const POLL_INTERVAL_MS = 2000;

interface PolledInstance {
  runId: string;
  state: InstanceState;
  url: string | null;
  logs: string | null;
}

interface TrackedLaunch {
  runId: string;
  ttlSeconds: number;
  launchedAt: number;
}

const TERMINAL_STATES: InstanceState[] = ["reaped", "failed"];

export function ChallengeCard({ challenge, teamId }: { challenge: Challenge; teamId: string }) {
  const [tracked, setTracked] = usePersistentState<TrackedLaunch | null>(
    `mayfly:${teamId}:${challenge.id}`,
    null,
  );
  const [status, setStatus] = useState<PolledInstance | null>(null);
  const [launching, setLaunching] = useState(false);
  const [actionPending, setActionPending] = useState<"stop" | "extend" | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async (runId: string) => {
    const response = await fetch(`/api/instances/${runId}`);
    if (!response.ok) return;
    const data = (await response.json()) as PolledInstance;
    setStatus(data);
    if (TERMINAL_STATES.includes(data.state)) stopPolling();
  }, [stopPolling]);

  // Subscribes to (and polls) whichever run is currently tracked for this team+challenge —
  // switches teams or challenges cleanly because the effect keys off runId, the one
  // primitive that actually identifies what to poll.
  const runId = tracked?.runId;
  useEffect(() => {
    stopPolling();
    if (!runId) return;
    // The first poll is scheduled via setTimeout, not called directly, so its setState
    // happens inside a callback rather than synchronously in the effect body.
    const kickoff = setTimeout(() => void pollOnce(runId), 0);
    pollRef.current = setInterval(() => void pollOnce(runId), POLL_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      stopPolling();
    };
  }, [runId, pollOnce, stopPolling]);

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    try {
      const response = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, teamId, ttlSeconds: DEFAULT_TTL_SECONDS }),
      });
      if (!response.ok) return;
      const { runId } = (await response.json()) as { runId: string };
      setStatus(null);
      setTracked({ runId, ttlSeconds: DEFAULT_TTL_SECONDS, launchedAt: Date.now() });
    } finally {
      setLaunching(false);
    }
  }, [challenge.id, teamId, setTracked]);

  const handleAction = useCallback(async (action: "stop" | "extend") => {
    if (!tracked) return;
    setActionPending(action);
    try {
      const response = await fetch(`/api/instances/${tracked.runId}/${action}`, { method: "POST" });
      // The workflow grows the countdown target by EXTEND_SECONDS on a successful extend
      // (see instance-lifecycle.ts) — mirror that here so the displayed countdown matches
      // what the server is actually counting down to, not the original launch's deadline.
      if (action === "extend" && response.ok) {
        setTracked({ ...tracked, ttlSeconds: tracked.ttlSeconds + EXTEND_SECONDS });
      }
      await pollOnce(tracked.runId);
    } finally {
      setActionPending(null);
    }
  }, [tracked, pollOnce, setTracked]);

  function handleCopy() {
    if (!status?.url) return;
    void navigator.clipboard.writeText(status.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (challenge.tier === "shared") {
    return (
      <Card className="gap-3 border border-zinc-800 bg-zinc-950/60 p-5 ring-0">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">{challenge.name}</h3>
          <span className="font-mono text-[11px] tracking-widest text-zinc-500">SHARED</span>
        </div>
        <a
          href={challenge.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary" }), "mt-2 w-fit")}
        >
          Open →
        </a>
      </Card>
    );
  }

  // No tracked run for this team+challenge means any leftover `status` is stale (from a
  // team switch or an earlier launch) — treat it as absent rather than clearing it in an
  // effect, since that lines up with the same "no synchronous setState in an effect" shape.
  const state = tracked ? status?.state : undefined;
  const showLaunch = !state || state === "reaped";
  const showUpAndRunning = state === "healthy" || state === "expiring";
  const showTriage = state === "failed";

  return (
    <Card className="gap-3 border border-zinc-800 bg-zinc-950/60 p-5 ring-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-100">{challenge.name}</h3>
        {state && <StatePill state={state} />}
      </div>

      {showLaunch && (
        <Button onClick={handleLaunch} disabled={launching} className="mt-2 w-fit">
          {launching ? "Launching…" : "Launch"}
        </Button>
      )}

      {state && !showLaunch && !showUpAndRunning && !showTriage && (
        <p className="font-mono text-xs tracking-wide text-zinc-500">standing by…</p>
      )}

      {showUpAndRunning && status?.url && tracked && (
        <div className="mt-1 flex flex-col gap-3">
          <button
            onClick={handleCopy}
            className="group flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-black px-3 py-2 text-left font-mono text-sm text-zinc-200 transition-colors hover:border-zinc-600"
          >
            <span className="truncate">{status.url}</span>
            <span className="shrink-0 text-[11px] tracking-wide text-zinc-500 group-hover:text-zinc-300">
              {copied ? "copied" : "copy"}
            </span>
          </button>

          <Countdown targetMs={tracked.launchedAt + tracked.ttlSeconds * 1000} />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={actionPending !== null}
              onClick={() => handleAction("extend")}
            >
              {actionPending === "extend" ? "Extending…" : "Extend"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionPending !== null}
              onClick={() => handleAction("stop")}
            >
              {actionPending === "stop" ? "Stopping…" : "Stop"}
            </Button>
          </div>
        </div>
      )}

      {showTriage && (
        <div className="mt-1 flex flex-col rounded-md border border-dashed border-red-900/50 bg-red-950/10">
          {status?.logs ? (
            <pre className="max-h-40 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-red-300/80">
              {status.logs}
            </pre>
          ) : (
            <p className="flex h-24 items-center justify-center font-mono text-xs tracking-wide text-red-400/70">
              awaiting triage
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
