import { ChallengeBoard } from "@/components/challenge-board";
import { DemoConsoleBanner } from "@/components/demo-console-banner";
import { ModeBanner } from "@/components/mode-banner";
import { CHALLENGES } from "@/lib/fixtures/challenges";

// The mode banner's entire point is showing the CURRENT deployment's env vars — statically
// prerendering this page would bake in whatever CTFD_MODE/SANDBOX_MODE were set at build
// time instead, which is exactly the stale reading an operator can't afford to trust.
export const dynamic = "force-dynamic";

// This is a demo console, not a player UI — see CLAUDE.md "There is no player UI in this
// repo". CTFd is the player-facing surface in the target architecture; this page exists so
// a reviewer can drive the control plane without CTFd credentials. Dark and functional
// because it's read at projector distance during ops work, not because it's a product.
export default function Home() {
  const ctfdMode = process.env.CTFD_MODE ?? "unset";
  const sandboxMode = process.env.SANDBOX_MODE ?? "unset";

  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <DemoConsoleBanner />
      <ModeBanner ctfdMode={ctfdMode} sandboxMode={sandboxMode} />
      <ChallengeBoard challenges={CHALLENGES} />
    </div>
  );
}
