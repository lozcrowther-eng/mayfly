import { ChallengeBoard } from "@/components/challenge-board";
import { ModeBanner } from "@/components/mode-banner";
import { CHALLENGES } from "@/lib/fixtures/challenges";

// The mode banner's entire point is showing the CURRENT deployment's env vars — statically
// prerendering this page would bake in whatever CTFD_MODE/SANDBOX_MODE were set at build
// time instead, which is exactly the stale reading an operator can't afford to trust.
export const dynamic = "force-dynamic";

// Always dark, regardless of the viewer's system theme — an ops console being screen-shared
// shouldn't flip to light mode because someone in the room has that OS preference set.
export default function Home() {
  const ctfdMode = process.env.CTFD_MODE ?? "unset";
  const sandboxMode = process.env.SANDBOX_MODE ?? "unset";

  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <ModeBanner ctfdMode={ctfdMode} sandboxMode={sandboxMode} />
      <ChallengeBoard challenges={CHALLENGES} />
    </div>
  );
}
