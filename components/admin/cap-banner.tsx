export function CapBanner({ instancesLive, globalCap }: { instancesLive: number; globalCap: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3">
      <p className="font-mono text-sm font-semibold tracking-wide text-amber-300">
        Concurrency cap reached — {instancesLive}/{globalCap} instances live. New launches will be rejected until one is freed.
      </p>
    </div>
  );
}
