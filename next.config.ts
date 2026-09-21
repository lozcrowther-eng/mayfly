import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Required for the "use cache" directive used by /scoreboard's data fetch (see
  // app/scoreboard/page.tsx) — replaces the old experimental.ppr flag.
  cacheComponents: true,

  async rewrites() {
    const ctfdOrigin = process.env.CTFD_ORIGIN;
    // No origin configured (e.g. running against the fakes only, or CI) — proxy nothing
    // rather than rewrite to an empty/invalid destination.
    if (!ctfdOrigin) return { fallback: [] };

    return {
      // `fallback` rewrites are the one phase Next.js tries only after every real page,
      // API route, and static file has already been checked and none matched (see
      // node_modules/next/dist/docs/.../rewrites.md). That ordering — not an explicit
      // exclusion list — is what keeps /scoreboard, /architecture, /admin, /, /api/*, and
      // /debug served by this app while every other path (CTFd login, challenge pages, its
      // admin panel, its own static assets, ...) falls through to CTFd untouched. Opening
      // the Vercel URL should feel like browsing CTFd, with exactly one route — the
      // scoreboard — actually rendered at the edge.
      //
      // A real deployment wouldn't need this rewrite at all: DNS for the CTFd domain would
      // point straight at CTFd, and only a scoreboard subdomain/path would resolve to
      // Vercel. This proxy exists only because the demo puts both "sides" behind one
      // Vercel deployment; the mechanism — everything goes to CTFd except what Vercel
      // renders itself — is identical either way.
      fallback: [
        {
          source: "/:path*",
          destination: `${ctfdOrigin}/:path*`,
        },
      ],
    };
  },
};

export default withWorkflow(nextConfig);
