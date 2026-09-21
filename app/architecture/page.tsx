/**
 * A static architecture diagram meant to double as a presentation slide — the interviewer
 * gets handed a URL, not a screenshot. It's inline SVG using this app's own design tokens
 * (fill-card, stroke-border, text-foreground, ...) rather than hardcoded hex colors, so it
 * repaints correctly in light or dark mode automatically instead of needing its own theme
 * logic — the same tokens app/globals.css already defines for every other page.
 *
 * Three labelled arrows, matching the three trust boundaries this system actually crosses:
 *   (i)   CTFd -> Vercel:   HMAC-signed control call (POST /api/instances)
 *   (ii)  Vercel -> CTFd:   REST write-back (mintFlag / publishUrl / markReaped / scoreboard read)
 *   (iii) Player -> Vercel: direct HTTPS to the sandbox, once its URL is published — this
 *         one deliberately never touches CTFd or the control plane at all.
 */
export default function ArchitecturePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Architecture</h1>
        <p className="text-sm text-muted-foreground">
          CTFd and its data stay on Google Cloud. This repo is the Vercel side only — see CLAUDE.md&apos;s
          &quot;boundary&quot;.
        </p>
      </header>

      <svg
        viewBox="0 0 960 640"
        role="img"
        aria-label="Architecture diagram: Google Cloud hosts CTFd, Cloud SQL, Memorystore, and remaining TCP challenges on GKE. Vercel hosts Next.js, Workflows, Sandbox microVMs, and AI Gateway. CTFd sends an HMAC-signed control call to Vercel; Vercel writes back to CTFd over REST; the player connects directly over HTTPS to the sandbox."
        className="w-full text-foreground"
      >
        <defs>
          <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-foreground" />
          </marker>
          <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {/* Player */}
        <rect x="430" y="14" width="100" height="40" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="480" y="39" textAnchor="middle" className="fill-foreground text-[13px] font-medium">
          Player
        </text>

        {/* Google Cloud box */}
        <rect x="40" y="80" width="380" height="470" rx="14" className="fill-transparent stroke-border" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="60" y="106" className="fill-muted-foreground text-[13px] font-semibold tracking-wide">
          GOOGLE CLOUD — existing, system of record
        </text>

        <rect x="60" y="120" width="340" height="64" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="230" y="157" textAnchor="middle" className="fill-foreground text-[14px] font-medium">
          CTFd
        </text>

        <rect x="60" y="204" width="160" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="140" y="239" textAnchor="middle" className="fill-foreground text-[13px]">
          Cloud SQL
        </text>

        <rect x="240" y="204" width="160" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="320" y="234" textAnchor="middle" className="fill-foreground text-[13px]">
          Memorystore
        </text>
        <text x="320" y="250" textAnchor="middle" className="fill-muted-foreground text-[11px]">
          (Redis)
        </text>

        <rect x="60" y="284" width="340" height="64" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="230" y="311" textAnchor="middle" className="fill-foreground text-[13px]">
          Remaining TCP challenges
        </text>
        <text x="230" y="328" textAnchor="middle" className="fill-muted-foreground text-[11px]">
          on GKE — not everything moves to a microVM
        </text>

        <text x="60" y="530" className="fill-muted-foreground text-[11px]">
          Owns users, teams, challenges, flags, submissions, scores.
        </text>

        {/* Vercel box */}
        <rect x="540" y="80" width="380" height="470" rx="14" className="fill-transparent stroke-border" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="560" y="106" className="fill-muted-foreground text-[13px] font-semibold tracking-wide">
          VERCEL — this repo
        </text>

        <rect x="560" y="120" width="340" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="730" y="155" textAnchor="middle" className="fill-foreground text-[14px] font-medium">
          Next.js
        </text>

        <rect x="560" y="200" width="340" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="730" y="235" textAnchor="middle" className="fill-foreground text-[14px] font-medium">
          Workflows (durable lifecycle)
        </text>

        <rect x="560" y="280" width="340" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="730" y="315" textAnchor="middle" className="fill-foreground text-[14px] font-medium">
          Sandbox microVMs
        </text>

        <rect x="560" y="360" width="340" height="60" rx="8" className="fill-card stroke-border" strokeWidth="1.5" />
        <text x="730" y="395" textAnchor="middle" className="fill-foreground text-[14px] font-medium">
          AI Gateway (triage)
        </text>

        <text x="560" y="530" className="fill-muted-foreground text-[11px]">
          Zero new stateful systems — state lives in CTFd&apos;s MySQL or the Workflow event log.
        </text>

        {/* (i) CTFd -> Next.js: HMAC-signed control call */}
        <path
          d="M400,145 C460,120 500,120 560,150"
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          markerEnd="url(#arrow-solid)"
        />
        <rect x="418" y="98" width="205" height="20" rx="4" className="fill-background" />
        <text x="520" y="112" textAnchor="middle" className="fill-foreground text-[12px] font-medium">
          (i) HMAC-signed control call
        </text>

        {/* (ii) Workflows -> CTFd: REST write-back (dashed — the reverse direction) */}
        <path
          d="M560,245 C500,285 460,285 400,175"
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          strokeDasharray="6 4"
          markerEnd="url(#arrow-solid)"
        />
        <rect x="418" y="288" width="185" height="20" rx="4" className="fill-background" />
        <text x="510" y="302" textAnchor="middle" className="fill-foreground text-[12px] font-medium">
          (ii) CTFd REST write-back
        </text>

        {/* (iii) Player -> Sandbox microVMs: direct HTTPS, bypassing CTFd and the control plane */}
        <path
          d="M485,54 C660,90 800,140 745,280"
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth="2"
          strokeDasharray="2 3"
          markerEnd="url(#arrow-muted)"
        />
        <rect x="705" y="180" width="215" height="34" rx="4" className="fill-background" />
        <text x="812" y="194" textAnchor="middle" className="fill-muted-foreground text-[12px] font-medium">
          (iii) Player&apos;s direct HTTPS
        </text>
        <text x="812" y="209" textAnchor="middle" className="fill-muted-foreground text-[12px] font-medium">
          connection to the sandbox
        </text>
      </svg>

      <dl className="grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium text-foreground">(i) HMAC-signed control call</dt>
          <dd className="text-muted-foreground">
            CTFd&apos;s plugin signs the raw request body and posts it to /api/instances, which starts a
            workflow run and returns a runId immediately — it never blocks on provisioning.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">(ii) CTFd REST write-back</dt>
          <dd className="text-muted-foreground">
            Workflow steps call back into CTFd&apos;s API to mint the flag, publish the live URL, and mark
            the instance reaped — CTFd stays the system of record throughout.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">(iii) Direct HTTPS to the sandbox</dt>
          <dd className="text-muted-foreground">
            Once a URL is published, the player&apos;s browser talks straight to the Sandbox microVM.
            Neither CTFd nor this control plane sits in that path.
          </dd>
        </div>
      </dl>
    </div>
  );
}
