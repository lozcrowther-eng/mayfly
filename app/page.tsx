import { connection } from "next/server";
import { ChallengeBoard } from "@/components/challenge-board";
import { DemoConsoleBanner } from "@/components/demo-console-banner";
import { ModeBanner } from "@/components/mode-banner";
import { NavLinks } from "@/components/nav-links";
import { CHALLENGES } from "@/lib/fixtures/challenges";

// The mode banner's entire point is showing the CURRENT deployment's env vars. Reading
// process.env alone doesn't make a page dynamic under Cache Components — without a
// dynamic API in the render path it would prerender once at build time and bake in
// whatever CTFD_MODE/SANDBOX_MODE happened to be set then, which is exactly the stale
// reading an operator can't afford to trust. `await connection()` is the replacement for
// `force-dynamic` here: it explicitly defers rendering to request time.
//
// The whole page is one dynamic read — there's no static shell worth carving out behind a
// Suspense boundary, so this opts out of Cache Components' instant-navigation requirement
// and blocks on the server instead (see node_modules/next/dist/docs/.../instant-navigation.md).
export const instant = false;

// This is a demo console, not a player UI — see CLAUDE.md "There is no player UI in this
// repo". CTFd is the player-facing surface in the target architecture; this page exists so
// a reviewer can drive the control plane without CTFd credentials. Dark and functional
// because it's read at projector distance during ops work, not because it's a product.
export default async function Home() {
  await connection();
  const ctfdMode = process.env.CTFD_MODE ?? "unset";
  const sandboxMode = process.env.SANDBOX_MODE ?? "unset";

  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <DemoConsoleBanner />
      <ModeBanner ctfdMode={ctfdMode} sandboxMode={sandboxMode} />
      <NavLinks />
      <ChallengeBoard challenges={CHALLENGES} />
    </div>
  );
}
