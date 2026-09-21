/**
 * Required disclosure, not decoration — see CLAUDE.md "There is no player UI in this repo".
 * CTFd is the player-facing surface in the target architecture; this page only exists so a
 * reviewer can drive the control plane without CTFd credentials, or so there's a clickable
 * URL if CTFd isn't wired up in time. It must never read as a product landing page.
 */
export function DemoConsoleBanner() {
  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-900 px-4 py-1.5 text-center">
      <p className="font-mono text-[11px] tracking-wide text-zinc-400">
        Demo console — stands in for CTFd, which is the player UI in the target architecture.
        Not part of the production design.
      </p>
    </div>
  );
}
