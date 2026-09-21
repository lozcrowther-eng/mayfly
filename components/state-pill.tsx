import { cn } from "@/lib/utils";
import type { InstanceState } from "@/lib/types";

const STATE_CONFIG: Record<InstanceState, { label: string; dot: string; text: string; ring: string; pulse?: boolean }> = {
  queued: { label: "QUEUED", dot: "bg-zinc-400", text: "text-zinc-300", ring: "ring-zinc-600/50" },
  provisioning: { label: "PROVISIONING", dot: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-600/50", pulse: true },
  healthy: { label: "HEALTHY", dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-600/50" },
  expiring: { label: "EXPIRING", dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-600/50", pulse: true },
  reaped: { label: "REAPED", dot: "bg-zinc-500", text: "text-zinc-400", ring: "ring-zinc-600/50" },
  failed: { label: "FAILED", dot: "bg-red-400", text: "text-red-300", ring: "ring-red-600/50" },
};

export function StatePill({ state, className }: { state: InstanceState; className?: string }) {
  const config = STATE_CONFIG[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs font-semibold tracking-widest ring-1",
        config.text,
        config.ring,
        className,
      )}
    >
      <span className="relative flex size-2">
        {config.pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", config.dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", config.dot)} />
      </span>
      {config.label}
    </span>
  );
}
