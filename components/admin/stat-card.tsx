import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-lg bg-zinc-950/60 px-4 py-3 ring-1 ring-zinc-800">
      <span className="font-mono text-[11px] tracking-widest text-zinc-500">{label}</span>
      <span className={cn("font-mono text-2xl font-semibold tabular-nums text-zinc-100", tone === "warn" && "text-amber-400")}>
        {value}
      </span>
      {detail && <span className="font-mono text-[11px] text-zinc-500">{detail}</span>}
    </div>
  );
}
