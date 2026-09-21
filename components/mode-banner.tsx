import { cn } from "@/lib/utils";

function ModeTag({ label, mode }: { label: string; mode: string }) {
  const isFake = mode === "fake";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[13px] tracking-wide">
      <span className="text-zinc-500">{label}:</span>
      <span
        className={cn(
          "font-bold uppercase",
          isFake ? "text-amber-400" : mode === "real" ? "text-emerald-400" : "text-zinc-400",
        )}
      >
        {mode}
      </span>
    </span>
  );
}

/** Always visible — an operator glancing at a shared screen needs to know instantly whether either side is a fake before trusting anything below it. */
export function ModeBanner({ ctfdMode, sandboxMode }: { ctfdMode: string; sandboxMode: string }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4">
      <ModeTag label="CTFD" mode={ctfdMode} />
      <span className="text-zinc-700">·</span>
      <ModeTag label="SANDBOX" mode={sandboxMode} />
    </div>
  );
}
