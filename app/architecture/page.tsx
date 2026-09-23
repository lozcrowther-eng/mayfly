import { NavLinks } from "@/components/nav-links";

/**
 * A static architecture diagram meant to double as a presentation slide — the interviewer
 * gets handed a URL, not a screenshot. Styled with this app's own hardcoded dark/zinc/mono
 * palette (see components/nav-links.tsx, components/admin/admin-dashboard.tsx,
 * components/challenge-board.tsx) rather than shadcn's generic semantic tokens — those
 * resolve to a different, untheed light palette with no `dark` wrapper on this page, which
 * is exactly why this page used to look inconsistent with the rest of the app.
 *
 * Three labelled arrows, matching the three trust boundaries this system actually crosses:
 *   (i)   CTFd -> Vercel:   HMAC-signed control call (POST /api/instances)
 *   (ii)  Vercel -> CTFd:   REST write-back (mintFlag / publishUrl / markReaped)
 *   (iii) Player -> Vercel: direct HTTPS to the sandbox, once its URL is published — this
 *         one deliberately never touches CTFd or the control plane at all.
 */
export default function ArchitecturePage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <NavLinks />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-mono text-sm tracking-[0.3em] text-zinc-500">ARCHITECTURE</h1>
          <p className="text-sm text-zinc-400">
            CTFd and its data stay on Google Cloud. This repo is the Vercel side only — see CLAUDE.md&apos;s
            &quot;boundary&quot;.
          </p>
        </header>

        <svg
          viewBox="0 0 960 640"
          role="img"
          aria-label="Architecture diagram: Google Cloud hosts CTFd, Cloud SQL, Memorystore, and remaining TCP challenges on GKE. Vercel hosts Next.js, Workflows, Sandbox microVMs, and AI Gateway. The player's browser only ever talks to CTFd -- clicking Launch, submitting flags. CTFd sends an HMAC-signed control call to Vercel; Vercel writes back to CTFd over REST; once CTFd publishes the sandbox URL, the player's browser makes a second, direct HTTPS connection straight to it."
          className="w-full text-zinc-100"
        >
          <defs>
            <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-zinc-100" />
            </marker>
            <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-zinc-500" />
            </marker>
          </defs>

          {/* Player */}
          <rect x="430" y="14" width="100" height="40" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="480" y="39" textAnchor="middle" className="fill-zinc-100 text-[13px] font-medium">
            Player
          </text>

          {/* Google Cloud box */}
          <rect x="40" y="80" width="380" height="470" rx="14" className="fill-transparent stroke-zinc-800" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="60" y="106" className="fill-zinc-500 text-[13px] font-semibold tracking-wide">
            GOOGLE CLOUD — existing, system of record
          </text>

          <rect x="60" y="120" width="340" height="64" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="230" y="157" textAnchor="middle" className="fill-zinc-100 text-[14px] font-medium">
            CTFd
          </text>

          <rect x="60" y="204" width="160" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="140" y="239" textAnchor="middle" className="fill-zinc-100 text-[13px]">
            Cloud SQL
          </text>

          <rect x="240" y="204" width="160" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="320" y="234" textAnchor="middle" className="fill-zinc-100 text-[13px]">
            Memorystore
          </text>
          <text x="320" y="250" textAnchor="middle" className="fill-zinc-500 text-[11px]">
            (Redis)
          </text>

          <rect x="60" y="284" width="340" height="64" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="230" y="311" textAnchor="middle" className="fill-zinc-100 text-[13px]">
            Remaining TCP challenges
          </text>
          <text x="230" y="328" textAnchor="middle" className="fill-zinc-500 text-[11px]">
            on GKE — not everything moves to a microVM
          </text>

          <text x="60" y="530" className="fill-zinc-500 text-[11px]">
            Owns users, teams, challenges, flags, submissions, scores.
          </text>

          {/* Vercel box */}
          <rect x="540" y="80" width="380" height="470" rx="14" className="fill-transparent stroke-zinc-800" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x="560" y="106" className="fill-zinc-500 text-[13px] font-semibold tracking-wide">
            VERCEL — this repo
          </text>

          <rect x="560" y="120" width="340" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="730" y="155" textAnchor="middle" className="fill-zinc-100 text-[14px] font-medium">
            Next.js
          </text>

          <rect x="560" y="200" width="340" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="730" y="235" textAnchor="middle" className="fill-zinc-100 text-[14px] font-medium">
            Workflows (durable lifecycle)
          </text>

          <rect x="560" y="280" width="340" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="730" y="315" textAnchor="middle" className="fill-zinc-100 text-[14px] font-medium">
            Sandbox microVMs
          </text>

          <rect x="560" y="360" width="340" height="60" rx="8" className="fill-zinc-950/60 stroke-zinc-800" strokeWidth="1.5" />
          <text x="730" y="395" textAnchor="middle" className="fill-zinc-100 text-[14px] font-medium">
            AI Gateway (triage)
          </text>

          <text x="560" y="530" className="fill-zinc-500 text-[11px]">
            Zero new stateful systems — state lives in CTFd&apos;s MySQL or the Workflow event log.
          </text>

          {/* (i) Player -> CTFd: the ONLY surface the player actually sees — loading the
              challenge page, clicking Launch, submitting flags. CLAUDE.md: "There is no
              player UI in this repo... CTFd is the only player-facing surface." Drawn
              solid and bold, same weight as the control-plane arrows, because it's the
              primary relationship — everything else on this diagram is what happens
              behind CTFd, not instead of it. */}
          <path
            d="M460,54 C380,80 300,90 262,118"
            fill="none"
            className="stroke-zinc-100"
            strokeWidth="2"
            markerEnd="url(#arrow-solid)"
          />
          <rect x="255" y="66" width="150" height="20" rx="4" className="fill-black" />
          <text x="330" y="80" textAnchor="middle" className="fill-zinc-100 text-[12px] font-medium">
            (i) player&apos;s browser
          </text>

          {/* (ii) CTFd -> Next.js: HMAC-signed control call */}
          <path
            d="M400,145 C460,120 500,120 560,150"
            fill="none"
            className="stroke-zinc-100"
            strokeWidth="2"
            markerEnd="url(#arrow-solid)"
          />
          <rect x="418" y="98" width="205" height="20" rx="4" className="fill-black" />
          <text x="520" y="112" textAnchor="middle" className="fill-zinc-100 text-[12px] font-medium">
            (ii) HMAC-signed control call
          </text>

          {/* (iii) Workflows -> CTFd: REST write-back (dashed — the reverse direction) */}
          <path
            d="M560,245 C500,285 460,285 400,175"
            fill="none"
            className="stroke-zinc-100"
            strokeWidth="2"
            strokeDasharray="6 4"
            markerEnd="url(#arrow-solid)"
          />
          <rect x="418" y="288" width="185" height="20" rx="4" className="fill-black" />
          <text x="510" y="302" textAnchor="middle" className="fill-zinc-100 text-[12px] font-medium">
            (iii) CTFd REST write-back
          </text>

          {/* (iv) Player -> Sandbox microVMs: a SECOND, derived connection — only exists
              once CTFd has published the URL from arrow (iii). The player does hit this
              endpoint directly (confirmed live, repeatedly, this session: the published
              sb-xxxx.vercel.run URL opens straight in the browser, no CTFd in that path),
              but it's downstream of CTFd telling them where to go, not an independent
              relationship — hence muted/dashed relative to (i)'s solid weight. */}
          <path
            d="M485,54 C660,90 800,140 745,280"
            fill="none"
            className="stroke-zinc-500"
            strokeWidth="2"
            strokeDasharray="2 3"
            markerEnd="url(#arrow-muted)"
          />
          <rect x="705" y="180" width="215" height="34" rx="4" className="fill-black" />
          <text x="812" y="194" textAnchor="middle" className="fill-zinc-500 text-[12px] font-medium">
            (iv) once CTFd shows the URL,
          </text>
          <text x="812" y="209" textAnchor="middle" className="fill-zinc-500 text-[12px] font-medium">
            direct HTTPS to the sandbox
          </text>
        </svg>

        <dl className="grid grid-cols-1 gap-3 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-100">(i) Player&apos;s browser</dt>
            <dd className="text-zinc-500">
              The only surface a player actually uses — loading the challenge page, clicking Launch,
              submitting flags. Everything else here happens behind CTFd, not instead of it.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-100">(ii) HMAC-signed control call</dt>
            <dd className="text-zinc-500">
              CTFd&apos;s plugin signs the raw request body and posts it to /api/instances, which starts a
              workflow run and returns a runId immediately — it never blocks on provisioning.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-100">(iii) CTFd REST write-back</dt>
            <dd className="text-zinc-500">
              Workflow steps call back into CTFd&apos;s API to mint the flag, publish the live URL, and mark
              the instance reaped — CTFd stays the system of record throughout.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-100">(iv) Direct HTTPS to the sandbox</dt>
            <dd className="text-zinc-500">
              Once CTFd publishes the URL from (iii), the player&apos;s browser opens it directly — a
              second, real connection to the Sandbox microVM, downstream of (i), not a replacement for it.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
